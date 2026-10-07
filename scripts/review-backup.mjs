// Encrypted logical export plus isolated SQLite rehearsal. No live restore or production import.
// BACKUP_PASSPHRASE=<private operator environment> node scripts/review-backup.mjs backup /restricted/file.enc
// BACKUP_PASSPHRASE=<same value> node scripts/review-backup.mjs verify /restricted/file.enc
import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closeDatabase } from '../server/db.mjs';

const core = ['review_migrations','review_roles','editorial_documents','editorial_revisions','community_events','community_event_revisions','community_submissions','community_submission_audits'];
const members = ['member_profiles','member_saves','member_progress','member_deletion_audit'];
const sessions = ['review_session_revocations','review_session_epochs'];
const management = ['managed_resources','managed_resource_revisions','mosque_corrections','mosque_correction_revisions','mosque_directory_overlays','management_intake_state','management_intake_actions','management_settings','management_audit_events','review_admin_audit'];
const study = ['study_responses','study_audio_jobs','study_response_reports','study_audio','study_usage_daily','study_runtime_locks'];
// Metadata only: the podcast migration intentionally stores no generated audio BLOBs.
const podcast = ['podcast_voices','podcast_assets','podcast_episodes','podcast_line_cache','podcast_jobs','podcast_usage_daily','podcast_runtime_locks'];
const [mode, destination] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!['backup','verify'].includes(mode) || !destination || !passphrase || passphrase.length < 32)
  throw new Error('Choose backup or verify, a protected destination and an operator passphrase of at least 32 characters.');
const digest = text => createHash('sha256').update(text).digest('hex');
const namesFor = applied => [
  ...core,
  ...(applied.has('003_members.sql') ? members : []),
  ...(applied.has('005_sessions.sql') ? sessions : []),
  ...(applied.has('006_manage.sql') ? management : []),
  ...(applied.has('007_study.sql') ? study : []),
  ...(applied.has('008_podcast_foundation.sql') ? podcast : []),
];

function encrypt(payload) {
  const salt = randomBytes(16), nonce = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    return Buffer.concat([Buffer.from('DDRB1'), salt, nonce, cipher.getAuthTag(), encrypted]);
  } finally { key.fill(0); }
}
function decrypt(bytes) {
  if (bytes.length < 49 || bytes.subarray(0,5).toString() !== 'DDRB1') throw new Error('Invalid backup format');
  const key = scryptSync(passphrase, bytes.subarray(5,21), 32);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(21,33));
    decipher.setAuthTag(bytes.subarray(33,49));
    return Buffer.concat([decipher.update(bytes.subarray(49)), decipher.final()]);
  } finally { key.fill(0); }
}
async function backup() {
  const connection = await getPool().getConnection();
  try {
    // A single InnoDB repeatable-read view prevents torn parent/child exports
    // while other requests modify the review database. This performs no DDL/DML.
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const [migrations] = await connection.query('SELECT name,applied_at FROM review_migrations');
    const names = namesFor(new Set(migrations.map(row => row.name)));
    const rows = {review_migrations: migrations};
    for (const table of names.filter(name => name !== 'review_migrations')) {
      const [result] = await connection.query(`SELECT * FROM \`${table}\``);
      rows[table] = result;
    }
    await connection.commit();
    const payload = JSON.stringify({format:3,exportedAt:new Date().toISOString(),source:'isolated-review-project',rows});
    await writeFile(destination, encrypt(Buffer.from(payload)), {flag:'wx',mode:0o600});
    console.log('Encrypted consistent review snapshot created. Table/row counts:',Object.fromEntries(names.map(name=>[name,rows[name].length])));
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); await closeDatabase(); }
}
async function verify() {
  const input = JSON.parse(decrypt(await readFile(destination)).toString('utf8'));
  if (![1,2,3].includes(input.format) || input.source !== 'isolated-review-project' || !input.rows ||
      !Array.isArray(input.rows.review_migrations)) throw new Error('Backup manifest invalid');
  const expected = input.format === 1 ? core : input.format === 2 ? [...core,...members] : namesFor(new Set(input.rows.review_migrations.map(row=>row.name)));
  if (Object.keys(input.rows).sort().join('|') !== expected.slice().sort().join('|') || expected.some(name=>!Array.isArray(input.rows[name])))
    throw new Error('Backup table inventory mismatch');
  const scratch = new DatabaseSync(':memory:');
  try {
    scratch.exec('PRAGMA foreign_keys=ON');
    const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
    const applied = new Set(input.rows.review_migrations.map(row=>row.name));
    const all = (await readdir(dir)).filter(name=>/^\d{3}_[a-z0-9_-]+\.sql$/.test(name)).sort();
    for (const name of all.filter(file => /^00[1-3]_/.test(file) || input.format === 3 && /^00[5-8]_/.test(file) && applied.has(file))) {
      let source = (await readFile(path.join(dir,name),'utf8')).split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
      if (name === '003_members.sql') source = source.replace(',\n  CONSTRAINT member_deletion_audit_subject_once UNIQUE (subject_hash)', '');
      if (name === '005_sessions.sql') source = source.replace('CHAR(64) CHARACTER SET ascii COLLATE ascii_bin', 'CHAR(64)');
      scratch.exec(source);
    }
    scratch.exec('CREATE TABLE review_migrations (name VARCHAR(128) PRIMARY KEY, applied_at VARCHAR(35) NOT NULL)');
    for (const table of expected) {
      for (const row of input.rows[table]) {
        const keys = Object.keys(row);
        if (!keys.length || keys.some(key=>!/^[a-z_]+$/.test(key))) throw new Error('Invalid backup column');
        const values = keys.map(key=>row[key]?.type === 'Buffer' && Array.isArray(row[key].data) ? Buffer.from(row[key].data) : row[key]);
        scratch.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...values);
      }
      const restored = scratch.prepare(`SELECT * FROM ${table}`).all();
      const canonical = rows => JSON.stringify(rows.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).map(row=>JSON.stringify(row)).sort());
      if (restored.length !== input.rows[table].length || digest(canonical(restored)) !== digest(canonical(input.rows[table])))
        throw new Error('Restore mismatch in ' + table);
    }
    if (expected.includes('member_profiles')) {
      for (const child of ['member_saves','member_progress',...(expected.includes('study_responses')?['study_responses','study_audio_jobs','study_response_reports','study_audio']:[])]) {
        const orphans = scratch.prepare(`SELECT COUNT(*) AS n FROM ${child} c LEFT JOIN member_profiles p ON p.user_id=c.user_id WHERE p.user_id IS NULL`).get().n;
        if (orphans) throw new Error('Orphan member rows in backup: ' + child);
      }
    }
    if (scratch.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || scratch.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Restored relational integrity failed');
    console.log('PASS encrypted backup restored in isolated SQLite; tables='+expected.length+'; relational integrity checked; no live database write. A separate MySQL-compatible restore drill remains required.');
  } finally { scratch.close(); }
}
if (mode === 'backup') await backup(); else await verify();
