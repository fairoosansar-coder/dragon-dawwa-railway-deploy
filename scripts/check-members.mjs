import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memberResponse} from '../server/member.mjs';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(fs.readFileSync(new URL('../migrations/001_core.sql', import.meta.url), 'utf8'));
  // SQLite cannot DROP the UNIQUE autoindex from migration 003 or apply MySQL's
  // ALTER ADD CONSTRAINT. Build the equivalent final logical schema for tests.
  const memberSql = fs.readFileSync(new URL('../migrations/003_members.sql', import.meta.url), 'utf8')
    .replace('CONSTRAINT member_saves_pk PRIMARY KEY (user_id, kind, item_id)',
      'CONSTRAINT member_saves_pk PRIMARY KEY (user_id, kind, item_id),\n  FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE')
    .replace('CONSTRAINT member_progress_pk PRIMARY KEY (user_id)',
      'CONSTRAINT member_progress_pk PRIMARY KEY (user_id),\n  FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE')
    .replace(',\n  CONSTRAINT member_deletion_audit_subject_once UNIQUE (subject_hash)', '');
  sql.exec(memberSql);
  sql.exec('CREATE TABLE review_session_epochs (user_id TEXT PRIMARY KEY, revoked_after INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  // The profile fields added by review-only migration 005. Session tables are
  // exercised independently in check-auth-revocation.mjs.
  sql.exec('ALTER TABLE member_profiles ADD COLUMN preferred_translation_id INTEGER NULL; ALTER TABLE member_profiles ADD COLUMN preferred_reciter_id INTEGER NULL;');
  const db = {
    prepare(query) {
      const actualQuery = query.startsWith('INSERT INTO review_session_epochs ')
        ? 'INSERT INTO review_session_epochs (user_id,revoked_after,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET revoked_after=MAX(review_session_epochs.revoked_after,excluded.revoked_after),updated_at=excluded.updated_at'
        : query;
      let values = [];
      const statement = {
        sql: query,
        bind(...next) { values = next; return statement; },
        async first() { return sql.prepare(actualQuery).get(...values) || null; },
        async all() { return {results: sql.prepare(actualQuery).all(...values)}; },
        async run() {
          const result = sql.prepare(actualQuery).run(...values);
          return {success: true, meta: {changes: Number(result.changes), last_row_id: result.lastInsertRowid || null}};
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec('COMMIT');
        return result;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {db, sql};
}

const owner = {id: 'owner-fixture', role: 'owner', name: 'Owner Fixture'};
const memberOne = {id: 'reader-one-fixture', role: 'reader', name: 'Reader One'};
const memberTwo = {id: 'reader-two-fixture', role: 'reader', name: 'Reader Two'};
const staff = {id: 'staff-fixture', role: 'publisher', name: 'Staff Fixture'};

function profile(displayName, overrides = {}) {
  return {
    displayName,
    avatar: 'rosette',
    preferredLanguage: 'en',
    city: 'Fixture city',
    mosque: 'Fixture learning place',
    contact: '',
    contactPreference: 'none',
    contactOptIn: false,
    ...overrides,
  };
}

function fixture() {
  const {db, sql} = database();
  const now = '2030-01-01T00:00:00.000Z';
  for (const actor of [memberOne, memberTwo, staff]) sql.prepare('INSERT INTO review_roles (user_id,role,disabled,updated_at,updated_by) VALUES (?,?,?,?,?)').run(actor.id, actor.role, 0, now, owner.id);
  sql.prepare('INSERT INTO editorial_documents (id,created_by,created_at,head,published) VALUES (?,?,?,?,?)').run('published-fixture', owner.id, now, 1, 1);
  async function request(path, actor, body = undefined, extra = {}) {
    const headers = {...extra};
    const method = body === undefined ? 'GET' : 'POST';
    if (body !== undefined) {
      headers['content-type'] ??= 'application/json';
      headers.origin ??= 'https://member.test';
      headers['sec-fetch-site'] ??= 'same-origin';
    }
    const env = {
      DB: db,
      MANUS_JWT_SECRET: 'synthetic-test-audit-key',
      resourceSaveEligibility: async (_database, id) => ({eligible: id === 'quran-start'}),
      validateQuranPreferences: async ({translationId, reciterId}) => {
        if (translationId !== null && translationId !== 85 || reciterId !== null && reciterId !== 7) {
          const error = new Error('invalid_marker'); error.code = 'invalid_marker'; error.status = 400; throw error;
        }
      },
      validateQuranMarker: async marker => {
        if (marker.chapter === 1 && marker.key === '1:1') return {chapter: 1, page: 1, key: '1:1'};
        if (marker.chapter === 2 && marker.key === '2:255') return {chapter: 2, page: 13, key: '2:255'};
        const error = new Error('invalid_marker'); error.code = 'invalid_marker'; error.status = 400; throw error;
      },
    };
    const response = await memberResponse(new Request(`https://member.test${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env, actor);
    return {status: response.status, data: await response.json(), headers: response.headers};
  }
  return {request, sql, db};
}

test('invited members have self-only profiles, saves, and reading places', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/member/register', memberOne, profile('First synthetic member'))).status, 201);
  assert.equal((await f.request('/api/member/register', memberTwo, profile('Second synthetic member', {preferredLanguage: 'ta'}))).status, 201);

  assert.equal((await f.request('/api/member/save', memberOne, {action: 'add', kind: 'home', id: 'ask'})).status, 200);
  assert.equal((await f.request('/api/member/save', memberOne, {action: 'add', kind: 'editorial', id: 'published-fixture'})).status, 200);
  assert.equal((await f.request('/api/member/place', memberOne, {chapter: 2, page: 13, key: '2:255'})).status, 200);

  const own = await f.request('/api/member/me', memberOne);
  assert.equal(own.status, 200);
  assert.equal(own.data.profile.displayName, 'First synthetic member');
  assert.deepEqual(new Set(own.data.saves.map(item => `${item.kind}:${item.id}`)), new Set(['home:ask', 'editorial:published-fixture']));
  assert.deepEqual({...own.data.place, updatedAt: undefined}, {chapter: 2, page: 13, key: '2:255', updatedAt: undefined});

  const other = await f.request('/api/member/me', memberTwo);
  assert.equal(other.status, 200);
  assert.equal(other.data.profile.displayName, 'Second synthetic member');
  assert.deepEqual(other.data.saves, []);
  assert.equal(other.data.place, null);
  assert.equal(JSON.stringify(other.data).includes('First synthetic member'), false);
  assert.equal(JSON.stringify(other.data).includes('Fixture city'), true, 'self responses retain only the caller’s own private profile');
});

test('legacy bookmark import is explicit, bounded to home IDs, and does not add arbitrary saves', async () => {
  const f = fixture();
  await f.request('/api/member/register', memberOne, profile('Import synthetic member'));
  let result = await f.request('/api/member/import', memberOne, {bookmarks: ['ask', 'wisdom', 'ask']});
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, {status: 'imported', imported: 2, alreadySaved: 0});
  result = await f.request('/api/member/import', memberOne, {bookmarks: ['ask', 'wisdom']});
  assert.equal(result.status, 200);
  assert.equal(result.data.imported, 0);
  assert.equal((await f.request('/api/member/import', memberOne, {bookmarks: ['ask', 'outside-id']})).status, 400);
  assert.equal((await f.request('/api/member/save', memberOne, {action: 'add', kind: 'home', id: 'outside-id'})).status, 400);
});

test('reviewed resources save but unknown links and forged staff roles fail closed', async () => {
  const f = fixture();
  await f.request('/api/member/register', memberOne, profile('External synthetic member'));
  const external = await f.request('/api/member/save', memberOne, {action: 'add', kind: 'external', id: 'arbitrary-resource'});
  assert.equal(external.status, 400);
  assert.deepEqual(external.data, {error: 'invalid_save'});
  assert.equal((await f.request('/api/member/save', memberOne, {action: 'add', kind: 'external', id: 'quran-start'})).status, 200);
  assert.equal((await f.request('/api/member/register', staff, {...profile('Forged staff profile'), role: 'owner'})).status, 400);
  assert.equal((await f.request('/api/member/register', staff, profile('Staff profile'))).status, 201);
  assert.equal((await f.request('/api/admin/members', staff)).status, 403);
  assert.equal((await f.request('/api/member/delete', staff, {confirm: 'DELETE MY ACCOUNT'})).status, 409);
});

test('owner list omits private contact, preference, saves, and progress; deletion wipes member data and disables invitation', async () => {
  const f = fixture();
  await f.request('/api/member/register', memberOne, profile('Deletion synthetic member', {contactPreference: 'email', contact: 'fixture@example.test', contactOptIn: true}));
  await f.request('/api/member/save', memberOne, {action: 'add', kind: 'home', id: 'context'});
  await f.request('/api/member/place', memberOne, {chapter: 1, page: 1, key: '1:1'});

  const list = await f.request('/api/admin/members?search=Deletion&page=1&pageSize=25', owner);
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  const row = list.data.items[0];
  assert.equal(row.displayName, 'Deletion synthetic member');
  for (const forbidden of ['contact', 'contactValue', 'contactPreference', 'contactOptIn', 'saves', 'place', 'progress']) assert.equal(forbidden in row, false);

  const deleted = await f.request('/api/member/delete', memberOne, {confirm: 'DELETE MY ACCOUNT'});
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.reInviteRequired, true);
  assert.match(deleted.data.audit, /separate sign-in account is not deleted/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM member_profiles WHERE user_id=?').get(memberOne.id).count, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM member_saves WHERE user_id=?').get(memberOne.id).count, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM member_progress WHERE user_id=?').get(memberOne.id).count, 0);
  assert.equal(f.sql.prepare('SELECT disabled FROM review_roles WHERE user_id=?').get(memberOne.id).disabled, 1);
  assert.ok(Number(f.sql.prepare('SELECT revoked_after FROM review_session_epochs WHERE user_id=?').get(memberOne.id).revoked_after) > 0);
  const audit = f.sql.prepare('SELECT subject_hash,role_before FROM member_deletion_audit').get();
  assert.equal(audit.subject_hash.length, 64);
  assert.equal(audit.subject_hash.includes(memberOne.id), false);
  assert.equal(audit.role_before, 'reader');

  const audits = await f.request('/api/admin/member-audit?page=1&pageSize=25', owner);
  assert.equal(audits.status, 200);
  assert.equal(audits.data.items.length, 1);
  assert.equal(JSON.stringify(audits.data).includes(memberOne.id), false);
});

test('same-origin JSON is required and responses are non-cacheable', async () => {
  const f = fixture();
  const wrongOrigin = await f.request('/api/member/register', memberOne, profile('Origin synthetic member'), {origin: 'https://evil.test'});
  assert.equal(wrongOrigin.status, 403);
  const noJson = await memberResponse(new Request('https://member.test/api/member/register', {method: 'POST', headers: {origin: 'https://member.test'}, body: '{}'}), {DB: f.db, MANUS_JWT_SECRET: 'synthetic-test-audit-key'}, memberOne);
  assert.equal(noJson.status, 415);
  const me = await f.request('/api/member/me', memberOne);
  assert.equal(me.headers.get('Cache-Control'), 'private, no-store');
});

test('a deleted, subsequently re-invited reader can register and delete again without losing either pseudonymous audit event', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/member/register', memberOne, profile('First QA registration'))).status, 201);
  assert.equal((await f.request('/api/member/delete', memberOne, {confirm:'DELETE MY ACCOUNT'})).status, 200);
  f.sql.prepare('UPDATE review_roles SET disabled=0 WHERE user_id=?').run(memberOne.id); // owner re-invitation fixture
  assert.equal((await f.request('/api/member/register', memberOne, profile('Second QA registration'))).status, 201);
  assert.equal((await f.request('/api/member/delete', memberOne, {confirm:'DELETE MY ACCOUNT'})).status, 200);
  const audits = f.sql.prepare('SELECT subject_hash FROM member_deletion_audit').all();
  assert.equal(audits.length, 2);
  assert.equal(audits[0].subject_hash, audits[1].subject_hash);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM member_profiles').get().n, 0);
});

test('out-of-range browser Quran markers fail server validation', async () => {
  const f = fixture();
  await f.request('/api/member/register', memberOne, profile('Invalid-marker QA'));
  assert.equal((await f.request('/api/member/place', memberOne, {chapter:2,page:99,key:'2:255'})).status,400);
  assert.equal((await f.request('/api/member/place', memberOne, {chapter:2,page:1,key:'2:999'})).status,400);
  const resolved = await f.request('/api/member/place', memberOne, {chapter:2,page:1,key:'2:255'});
  assert.equal(resolved.status,200, 'a suspicious stale page is repaired only after provider validation locates the exact verse');
  assert.deepEqual({...resolved.data.place, updatedAt: undefined}, {chapter:2,page:13,key:'2:255',updatedAt:undefined});
  assert.equal((await f.request('/api/member/place', memberOne, {chapter:2,page:13,key:'2:256'})).status,400);
});

test('provider-backed translation and reciter choices are optional, validated, and self-export excludes another member', async () => {
  const f = fixture();
  const first = await f.request('/api/member/register', memberOne, profile('Export synthetic member', {preferredTranslation:85, preferredReciter:7}));
  assert.equal(first.status, 201);
  assert.equal(first.data.profile.preferredTranslation, 85);
  assert.equal(first.data.profile.preferredReciter, 7);
  assert.equal((await f.request('/api/member/register', memberTwo, profile('Other private synthetic member'))).status, 201);
  assert.equal((await f.request('/api/member/save', memberOne, {action:'add',kind:'home',id:'ask'})).status, 200);
  const exported = await f.request('/api/member/export', memberOne);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('Content-Disposition'), 'attachment; filename="dragon-dawwa-my-learning.json"');
  assert.equal(exported.data.profile.displayName, 'Export synthetic member');
  assert.deepEqual(exported.data.savedItems.map(item => item.id), ['ask']);
  assert.equal(JSON.stringify(exported.data).includes('Other private synthetic member'), false);
  assert.equal((await f.request('/api/member/profile', memberOne, profile('Export synthetic member', {preferredTranslation:999, preferredReciter:7}))).status, 400);
});

test('delete cannot race an already-validated save, browser import or place into orphaned private rows', async () => {
  for (const operation of ['save','import','place']) {
    const f = fixture();
    await f.request('/api/member/register', memberOne, profile('Race QA ' + operation));
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const proceed = new Promise(resolve => { release = resolve; });
    const original = f.db.prepare;
    f.db.prepare = query => {
      const statement = original(query);
      if (operation !== 'import' && /^INSERT INTO member_(?:saves|progress) /i.test(query)) {
        const insert = statement.run;
        statement.run = async () => { enter(); await proceed; return insert(); };
      }
      return statement;
    };
    if (operation === 'import') {
      const batch = f.db.batch;
      f.db.batch = async statements => {
        if (statements.some(statement => /^INSERT INTO member_saves /i.test(statement.sql || ''))) {
          enter(); await proceed;
        }
        return batch(statements);
      };
    }
    const body = operation === 'save' ? {action:'add',kind:'home',id:'ask'} :
      operation === 'import' ? {bookmarks:['wisdom']} : {chapter:2,page:13,key:'2:255'};
    const delayed = f.request('/api/member/'+operation,memberOne,body);
    await entered;
    assert.equal((await f.request('/api/member/delete',memberOne,{confirm:'DELETE MY ACCOUNT'})).status,200);
    release();
    assert.equal((await delayed).status,409,operation+' after deletion must be a conflict');
    for (const table of ['member_profiles','member_saves','member_progress'])
      assert.equal(f.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(memberOne.id).n,0,table+' orphan after '+operation);
  }
});

console.log('Member checks use synthetic in-memory identities, SQLite, and actual reviewed catalogue IDs. They do not test live Manus OAuth, parent route wiring/access revocation, browser rendering, or managed MySQL.');
