// Run only against a disposable local socket database, never a production target.
// BACKUP_PASSPHRASE=<protected environment> node scripts/verify-isolated-sql-restore.mjs /restricted/review.enc /restricted/local.sock
import {createDecipheriv, createHash, scryptSync} from 'node:crypto';
import {readFile, readdir, realpath, lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import path from 'node:path';

const [backupPath, socketPath] = process.argv.slice(2);
if (!path.isAbsolute(backupPath || '') || !path.isAbsolute(socketPath || '') ||
    !/^(?:\/home\/ubuntu\/\.private|\/run\/dragon-dawwa-restore)\/[A-Za-z0-9_-]+\.sock$/.test(socketPath) ||
    !process.env.BACKUP_PASSPHRASE || process.env.BACKUP_PASSPHRASE.length < 32)
  throw new Error('A protected encrypted backup, local private Unix socket and operator passphrase are required.');
if ((await realpath(socketPath)) !== socketPath || !(await lstat(socketPath)).isSocket())
  throw new Error('The isolated local MySQL-compatible server socket is unavailable.');
const blob = await readFile(backupPath);
if (blob.length < 50 || blob.subarray(0, 5).toString() !== 'DDRB1') throw new Error('Encrypted backup header is invalid.');
const key = scryptSync(process.env.BACKUP_PASSPHRASE, blob.subarray(5, 21), 32);
const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(21, 33));
decipher.setAuthTag(blob.subarray(33, 49));
let snapshot;
try { snapshot = JSON.parse(Buffer.concat([decipher.update(blob.subarray(49)), decipher.final()]).toString('utf8')); }
catch { throw new Error('Backup authentication or manifest failed.'); }
if (snapshot.source !== 'isolated-review-project' || !snapshot.rows || ![1, 2, 3].includes(snapshot.format))
  throw new Error('Review backup has an unsupported manifest.');
const allowed = name => /^[a-z][a-z0-9_]{0,63}$/.test(name);
const tableNames = Object.keys(snapshot.rows);
if (!tableNames.length || tableNames.some(name => !allowed(name) || !Array.isArray(snapshot.rows[name])) ||
    !Array.isArray(snapshot.rows.review_migrations)) throw new Error('Backup table index is invalid.');
const migrationNames = snapshot.rows.review_migrations.map(row => row.name).sort();
const migrationDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const filenames = (await readdir(migrationDir)).filter(name => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name));
if (migrationNames.some(name => !filenames.includes(name))) throw new Error('Snapshot requires a missing migration file.');
const dbName = 'dragon_restore_' + Date.now().toString(36);
const root = await mysql.createConnection({socketPath, user:'root', multipleStatements:false, connectTimeout:5000});
const [versionRows] = await root.query('SELECT VERSION() AS version');
const engineVersion = String(versionRows[0]?.version || '');
const engine = /mariadb/i.test(engineVersion) ? 'MariaDB' : /^8\./.test(engineVersion) ? 'MySQL 8' : 'MySQL-compatible';
if (process.env.RESTORE_REQUIRE_MYSQL8 === '1' && engine !== 'MySQL 8') {
  await root.end();
  throw new Error('This acceptance drill requires a disposable MySQL 8 instance.');
}
let copy;
let created = false;
const normalized = rows => JSON.stringify(rows.map(row => Object.fromEntries(
  Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, v?.type === 'Buffer' && Array.isArray(v.data) ? {type:'Buffer',data:v.data} : v]),
)).map(row => JSON.stringify(row)).sort());
try {
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  created = true;
  copy = await mysql.createConnection({socketPath, user:'root', database:dbName, multipleStatements:false});
  await copy.query('CREATE TABLE review_migrations (name VARCHAR(128) NOT NULL PRIMARY KEY, applied_at VARCHAR(35) NOT NULL)');
  for (const name of migrationNames) {
    const script = await readFile(path.join(migrationDir, name), 'utf8');
    const sql = script.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await copy.query(statement);
  }
  const [physical] = await copy.query('SHOW TABLES');
  const actualTables = new Set(physical.map(row => Object.values(row)[0]));
  if (tableNames.some(name => !actualTables.has(name)) || actualTables.size !== tableNames.length)
    throw new Error('Restored schema differs from the encrypted table list.');
  const [relations] = await copy.query(`SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL`, [dbName]);
  const pending = new Set(tableNames), ordered = [];
  while (pending.size) {
    const ready = [...pending].filter(name => relations.every(rel => rel.TABLE_NAME !== name || !pending.has(rel.REFERENCED_TABLE_NAME)));
    if (!ready.length) throw new Error('Circular foreign-key dependency in backup.');
    for (const name of ready) { pending.delete(name); ordered.push(name); }
  }
  for (const name of ordered) {
    for (const row of snapshot.rows[name]) {
      const columns = Object.keys(row);
      if (!columns.length || columns.some(column => !allowed(column))) throw new Error('Invalid encrypted row field name.');
      const values = columns.map(column => {
        const value = row[column];
        return value?.type === 'Buffer' && Array.isArray(value.data) ? Buffer.from(value.data) : value;
      });
      await copy.execute(`INSERT INTO \`${name}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
    }
    const [restored] = await copy.query(`SELECT * FROM \`${name}\``);
    if (restored.length !== snapshot.rows[name].length || normalized(restored) !== normalized(snapshot.rows[name]))
      throw new Error('Encrypted backup row mismatch in ' + name);
  }
  const [keys] = await copy.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND CONSTRAINT_NAME IN ('member_saves_profile_fk','member_progress_profile_fk')`, [dbName]);
  if (keys.length !== 2) throw new Error('Member ownership foreign keys were not restored.');
  await copy.beginTransaction();
  const marker = 'synthetic_restore_smoke_' + Date.now().toString(36);
  try {
    await copy.execute('INSERT INTO member_profiles (user_id,display_name,avatar_preset,preferred_language,contact_preference,contact_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [marker, 'Synthetic restore check', 'none', 'en', 'none', 0, new Date().toISOString(), new Date().toISOString()]);
    await copy.execute('INSERT INTO member_saves (user_id,kind,item_id,saved_at) VALUES (?,?,?,?)',
      [marker, 'external', 'restore-fixture', new Date().toISOString()]);
    const [read] = await copy.execute('SELECT p.user_id,s.item_id FROM member_profiles p JOIN member_saves s ON p.user_id=s.user_id WHERE p.user_id=?', [marker]);
    if (read.length !== 1) throw new Error('Isolated member read/write smoke check failed.');
  } finally { await copy.rollback(); }
  const [remaining] = await copy.execute('SELECT COUNT(*) AS count FROM member_profiles WHERE user_id=?', [marker]);
  if (remaining[0].count !== 0) throw new Error('Isolated transaction rollback failed.');
  console.log(JSON.stringify({result:'PASS',target:`disposable Unix-socket ${engine}, not the live application schema`,migrations:migrationNames.length,tables:tableNames.length,rows:Object.fromEntries(tableNames.map(n=>[n,snapshot.rows[n].length])),ownershipForeignKeys:keys.length,transactionalReadWrite:true}));
} finally {
  if (copy) await copy.end();
  if (created) await root.query(`DROP DATABASE \`${dbName}\``);
  await root.end();
  key.fill(0);
  const digest = createHash('sha256').update(blob).digest('hex');
  if (process.env.RESTORE_VERBOSE === '1') console.log('Encrypted input SHA-256:', digest);
}
