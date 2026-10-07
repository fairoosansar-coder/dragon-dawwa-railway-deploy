import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHadithReportAdapter, hadithResponse} from '../server/hadith.mjs';

const migration = fs.readFileSync(new URL('../migrations/pending/008_hadith.sql', import.meta.url), 'utf8')
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

function phase2Database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(`
    CREATE TABLE review_roles (user_id TEXT PRIMARY KEY, role TEXT NOT NULL, disabled INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NULL);
    CREATE TABLE management_audit_events (id TEXT PRIMARY KEY, category TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, summary_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE review_admin_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  sql.exec(migration);
  const db = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...next) { values = next; return statement; },
        async first() { return sql.prepare(query).get(...values) || null; },
        async all() { return {results: sql.prepare(query).all(...values)}; },
        async run() { const result = sql.prepare(query).run(...values); return {success: true, meta: {changes: Number(result.changes)}}; },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return {sql, db};
}

const owner = {id: 'owner-001', role: 'owner', name: 'Synthetic owner'};
const author = {id: 'author-001', role: 'author', name: 'Synthetic author'};
const reviewer = {id: 'reviewer-001', role: 'reviewer', name: 'Synthetic reviewer'};
const reader = {id: 'reader-001', role: 'reader', name: 'Synthetic member'};

function environment(db, enabled = true) { return {DB: db, HADITH_PHASE2A_ENABLED: enabled ? 'true' : 'false'}; }
async function request(db, path, actor, body = undefined) {
  const headers = {};
  const options = {method: body === undefined ? 'GET' : 'POST', headers};
  if (body !== undefined) { headers.origin = 'https://hadith.test'; headers['sec-fetch-site'] = 'same-origin'; headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await hadithResponse(new Request(`https://hadith.test${path}`, options), environment(db), actor);
  return {status: response.status, data: await response.json()};
}
const fixtureClaim = {
  claimText: 'Synthetic fixture claim used only to test immutable review state.',
  sourceBook: 'Synthetic fixture book', sourceReference: 'fixture 1', edition: 'Synthetic test edition',
  checkedWording: 'Synthetic checked wording for a nonreligious test fixture.', namedGrader: 'Synthetic reviewer', gradingReference: 'Synthetic grading reference',
};

test('Phase 2a stays disabled unless explicitly activated after an operator migration', async () => {
  const {db, sql} = phase2Database();
  try {
    const response = await hadithResponse(new Request('https://hadith.test/api/admin/hadith-reports'), environment(db, false), owner);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error: 'hadith_phase2a_disabled'});
  } finally { sql.close(); }
});

test('owner attests a distinct reviewer, human-authored claims become immutable approved provenance, and owner self-approval is refused', async () => {
  const {db, sql} = phase2Database();
  try {
    for (const actor of [owner, author, reviewer, reader]) sql.prepare('INSERT INTO review_roles (user_id,role,disabled,updated_at,updated_by) VALUES (?,?,?,?,?)').run(actor.id, actor.role, 0, '2030-01-01T00:00:00.000Z', owner.id);
    const attestation = await request(db, '/api/admin/hadith-reviewers', owner, {action: 'attest', reviewerId: reviewer.id, statedBasis: 'Synthetic qualified-reviewer basis for regression only.'});
    assert.equal(attestation.status, 201);
    const created = await request(db, '/api/admin/hadith-reports', author, {title: 'Synthetic report', hadithReference: 'Synthetic reference', language: 'ta', claims: [fixtureClaim]});
    assert.equal(created.status, 201); assert.equal(created.data.status, 'draft'); assert.equal(created.data.claims[0].enteredStaffId, author.id);
    const readerQueue = await request(db, '/api/admin/hadith-reports', reader);
    assert.equal(readerQueue.status, 403); assert.equal(readerQueue.data.error, 'forbidden');
    const adapter = createHadithReportAdapter({db});
    assert.equal(await adapter.getApprovedRevision({reportRevisionId: created.data.id}), null);
    const ownerApproval = await request(db, `/api/admin/hadith-reports/${created.data.id}/approve`, owner, {});
    assert.equal(ownerApproval.status, 403); assert.equal(ownerApproval.data.error, 'qualified_reviewer_required');
    const approved = await request(db, `/api/admin/hadith-reports/${created.data.id}/approve`, reviewer, {});
    assert.equal(approved.status, 200); assert.equal(approved.data.status, 'approved'); assert.equal(approved.data.qualifiedReviewerId, reviewer.id);
    const report = await adapter.getApprovedRevision({reportRevisionId: created.data.id});
    assert.deepEqual(report.claimIds, [created.data.claims[0].id]); assert.equal(report.qualifiedReviewerId, reviewer.id);
    assert.deepEqual(Object.keys(report).sort(), ['approvedAt', 'claimIds', 'id', 'qualifiedReviewerId', 'status']);
    sql.prepare('UPDATE hadith_claims SET claim_text=? WHERE id=?').run('Tampered fixture content.', created.data.claims[0].id);
    assert.equal(await adapter.getApprovedRevision({reportRevisionId: created.data.id}), null);
    sql.prepare('UPDATE hadith_claims SET claim_text=? WHERE id=?').run(fixtureClaim.claimText, created.data.claims[0].id);
    sql.prepare("UPDATE hadith_reports SET status='superseded' WHERE id=?").run(created.data.id);
    assert.equal(await adapter.getApprovedRevision({reportRevisionId: created.data.id}), null);
    sql.prepare("UPDATE hadith_reports SET status='approved' WHERE id=?").run(created.data.id);
    const withdrawn = await request(db, `/api/admin/hadith-reports/${created.data.id}/withdraw`, reviewer, {note: 'Synthetic withdrawal state.'});
    assert.equal(withdrawn.status, 200); assert.equal(withdrawn.data.status, 'withdrawn');
    assert.equal(await adapter.getApprovedRevision({reportRevisionId: created.data.id}), null);
    assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM review_admin_audit').get().count, 4);
  } finally { sql.close(); }
});

test('staged migration contains only reviewer-authored report metadata and no reference-library or audio payload', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hadith_reports/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hadith_claims/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hadith_reviewer_attestations/i);
  assert.doesNotMatch(migration, /reference_library|BLOB|elevenlabs|INSERT\s+INTO/i);
  const databaseSource = fs.readFileSync(new URL('../server/db.mjs', import.meta.url), 'utf8');
  assert.match(databaseSource, /const migrationFiles = async \(\) => \(await readdir\(migrationDir\)\)\.filter/, 'normal migration discovery must scan only migrations root');
  assert.doesNotMatch(databaseSource, /readdir\([^)]*pending|migrationDir[^\n]*pending/, 'normal migration discovery must never scan pending migrations');
  assert.equal(fs.existsSync(path.join(new URL('../migrations/', import.meta.url).pathname, 'pending', '008_hadith.sql')), true);
});

console.log('Hadith Phase 2a checks use SQLite and synthetic nonreligious claims only. They perform no corpus import, AI research, provider call, Railway DDL, or religious conclusion.');
