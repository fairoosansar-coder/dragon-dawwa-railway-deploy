// Operator-only, review-database migration. Never import into normal startup.
// BACKUP_PASSPHRASE=<protected value> node scripts/migrate-review.mjs /private/snapshot.enc
import {stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {getPool,migrate,verifySchema,closeDatabase} from '../server/db.mjs';

const snapshot=process.argv[2];
if (!snapshot || !path.isAbsolute(snapshot) || !process.env.BACKUP_PASSPHRASE || process.env.BACKUP_PASSPHRASE.length<32)
  throw new Error('An absolute private encrypted snapshot and protected passphrase are required.');
const saved=await stat(snapshot);
if (!saved.isFile() || saved.size<49 || (saved.mode & 0o077)) throw new Error('Encrypted snapshot missing or accessible to others.');
const checked=spawnSync(process.execPath,['scripts/review-backup.mjs','verify',snapshot],{
  cwd:new URL('..',import.meta.url).pathname,env:process.env,stdio:'inherit',timeout:60000,
});
if (checked.status!==0) throw new Error('Snapshot did not pass isolated logical restore; refusing schema change.');
let connection;
try {
  const pool=getPool();
  connection=await pool.getConnection();
  const [lock]=await connection.query("SELECT GET_LOCK('dragon-dawwa-review-migrations',5) AS acquired");
  if (Number(lock[0]?.acquired)!==1) throw new Error('Could not obtain exclusive review-migration lock.');
  // Never auto-delete inconsistent personal data to make a migration pass.
  for (const table of ['member_saves','member_progress']) {
    const [rows]=await connection.query(`SELECT COUNT(*) AS n FROM ${table} c LEFT JOIN member_profiles p ON c.user_id=p.user_id WHERE p.user_id IS NULL`);
    if (Number(rows[0].n)!==0) throw new Error('Orphan rows require manual review before migration: '+table);
  }
  const files=await migrate();
  const status=await verifySchema();
  console.log('PASS explicit review migration, schema and two ownership constraints:',{migrations:status.migrations,files:files.length});
} finally {
  if (connection) {
    try { await connection.query("SELECT RELEASE_LOCK('dragon-dawwa-review-migrations')"); } catch { /* errors above remain authoritative */ }
    connection.release();
  }
  await closeDatabase();
}
