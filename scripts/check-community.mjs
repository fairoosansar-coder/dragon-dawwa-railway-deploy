import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {communityResponse} from '../server/community.mjs';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(fs.readFileSync(new URL('../migrations/002_community.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return {results: sql.prepare(query).all(...args)}; },
        run() { const result = sql.prepare(query).run(...args); return {meta: {changes: Number(result.changes)}}; },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const output = statements.map(statement => statement.run());
        sql.exec('COMMIT');
        return output;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {db, sql};
}

const owner = {id: 'owner', role: 'owner'};
const publisher = {id: 'publisher', role: 'publisher'};
const reviewer = {id: 'reviewer', role: 'reviewer'};
const stranger = {id: 'stranger', role: 'reader'};

function future() { return new Date(Date.now() + 86_400_000).toISOString(); }
function event(overrides = {}) {
  return {
    title: 'Non-religious test workshop',
    description: 'A local-only fixture for event workflow verification.',
    language: 'en',
    timezone: 'Asia/Colombo',
    startsAt: future(),
    location: 'Fixture room',
    onlineUrl: null,
    speaker: 'Fixture speaker supplied by the test',
    resourceUrl: 'https://example.test/fixture-resource',
    ...overrides,
  };
}

function fixture() {
  const {db, sql} = database();
  async function request(path, actor = null, body = undefined, extra = {}) {
    const method = body === undefined ? 'GET' : 'POST';
    const headers = {...extra};
    if (body !== undefined) {
      headers['content-type'] ??= 'application/json';
      headers.origin ??= 'https://test.example';
    }
    const response = await communityResponse(new Request(`https://test.example${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), {DB: db}, actor);
    return {status: response.status, data: await response.json(), headers: response.headers};
  }
  async function create(actor = owner, details = event()) {
    const result = await request('/api/admin/events', actor, {action: 'create', event: details});
    assert.equal(result.status, 201);
    return result.data;
  }
  async function action(doc, actionName, actor = owner, body = {}) {
    return request(`/api/admin/events/${doc.id}/${actionName}`, actor, {baseVersion: doc.head, ...body});
  }
  return {request, create, action, sql};
}

test('public events reveal only a published snapshot and never cancelled events', async () => {
  const f = fixture();
  assert.deepEqual((await f.request('/api/events')).data.items, []);
  let document = await f.create();
  assert.deepEqual((await f.request('/api/events')).data.items, []);
  document = (await f.action(document, 'publish', publisher)).data;
  let visible = (await f.request('/api/events')).data.items;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].title, 'Non-religious test workshop');
  assert.equal(visible[0].actor, undefined);
  document = (await f.action(document, 'save', owner, {event: event({title: 'Unpublished revised fixture'})})).data;
  visible = (await f.request('/api/events')).data.items;
  assert.equal(visible[0].title, 'Non-religious test workshop');
  document = (await f.action(document, 'cancel', publisher)).data;
  assert.equal(document.current.state, 'cancelled');
  assert.deepEqual((await f.request('/api/events')).data.items, []);
});

test('event roles, same-origin write protection, and optimistic versions are enforced', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/admin/events')).status, 401);
  assert.equal((await f.request('/api/admin/events', stranger)).status, 403);
  assert.equal((await f.request('/api/admin/events', reviewer)).status, 200);
  assert.equal((await f.request('/api/admin/events', reviewer, {action: 'create', event: event()})).status, 403);
  assert.equal((await f.request('/api/admin/events', owner, {action: 'create', event: event()}, {origin: 'https://evil.example'})).status, 403);
  let document = await f.create();
  const first = await f.action(document, 'save', owner, {event: event({title: 'First edit'})});
  const second = await f.action(document, 'save', publisher, {event: event({title: 'Stale edit'})});
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  const history = await f.request(`/api/admin/events/${document.id}/history`, reviewer);
  assert.equal(history.status, 200);
  assert.equal(history.data.items.length, 2);
  assert.equal(history.data.items[0].action, 'save');
});

test('event validation requires an IANA zone, an event venue, HTTPS links, and a future date on publish', async () => {
  const f = fixture();
  for (const bad of [
    event({timezone: 'UTC'}),
    event({location: null, onlineUrl: null}),
    event({onlineUrl: 'http://example.test', location: null}),
    event({resourceUrl: 'javascript:alert(1)'}),
    event({startsAt: 'not-a-date'}),
  ]) assert.equal((await f.request('/api/admin/events', owner, {action: 'create', event: bad})).status, 400);
  let document = await f.create(owner, event({startsAt: '2020-01-01T09:00:00+05:30'}));
  assert.equal((await f.action(document, 'publish', owner)).status, 400);
  document = (await f.action(document, 'save', owner, {event: event()})).data;
  assert.equal((await f.action(document, 'publish', owner)).status, 200);
});

test('a past session accepts only a rights-confirmed resource added to its prior published snapshot', async () => {
  const f = fixture();
  let document = await f.create(owner, event({resourceUrl: null}));
  document = (await f.action(document, 'publish', publisher)).data;
  const original = document.current.content;
  const now = Date.now;
  try {
    // Simulate time passing after an event was genuinely published in advance.
    Date.now = () => Date.parse(original.startsAt) + 1;
    document = (await f.action(document, 'save', owner, {event: {...original, resourceUrl: 'https://example.test/authorized-recording'}})).data;
    assert.equal((await f.action(document, 'publish', owner)).data.error, 'recording_rights_required');
    const published = await f.action(document, 'publish', owner, {authorizedRecording: true});
    assert.equal(published.status, 200);
    assert.equal((await f.request('/api/events')).data.items[0].resourceUrl, 'https://example.test/authorized-recording');
    document = (await f.action(published.data, 'save', owner, {event: {...original, title: 'Changed historical details', resourceUrl: 'https://example.test/another-recording'}})).data;
    assert.equal((await f.action(document, 'publish', owner, {authorizedRecording: true})).data.error, 'archive_only');
  } finally {
    Date.now = now;
  }
});

test('visitor intake requires consent for contact, rejects the honeypot, and exposes submissions only to owner', async () => {
  const f = fixture();
  const base = {purpose: 'interest', contactPreference: 'email', contact: 'fixture@example.test', details: 'Non-personal test inquiry.'};
  assert.equal((await f.request('/api/participation', null, base)).status, 400);
  assert.equal((await f.request('/api/participation', null, {...base, contactConsent: true, website: 'filled'})).status, 400);
  const stored = await f.request('/api/participation', null, {...base, contactConsent: true, website: ''});
  assert.equal(stored.status, 201);
  assert.deepEqual(stored.data, {status: 'stored_for_review'});
  assert.equal((await f.request('/api/admin/submissions', publisher)).status, 403);
  const list = await f.request('/api/admin/submissions', owner);
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].contact, 'fixture@example.test');
});

test('correction deletion creates a non-private tombstone and a payload-free audit action', async () => {
  const f = fixture();
  const created = await f.request('/api/corrections', null, {
    purpose: 'directory_correction',
    contactPreference: 'none',
    details: 'Fixture correction details only.',
    website: '',
  });
  assert.equal(created.status, 201);
  const id = f.sql.prepare('SELECT id FROM community_submissions').get().id;
  assert.equal((await f.request(`/api/admin/submissions/${id}/delete`, publisher, {})).status, 403);
  const deleted = await f.request(`/api/admin/submissions/${id}/delete`, owner, {});
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data, {status: 'deleted'});
  const raw = f.sql.prepare('SELECT contact_value,details,consented_at,contact_preference,deleted_at FROM community_submissions WHERE id=?').get(id);
  assert.equal(raw.contact_value, null);
  assert.equal(raw.details, null);
  assert.equal(raw.consented_at, null);
  assert.equal(raw.contact_preference, 'deleted');
  assert.ok(raw.deleted_at);
  const list = (await f.request('/api/admin/submissions', owner)).data.items;
  assert.equal(list[0].deleted, true);
  assert.equal('contact' in list[0], false);
  assert.equal('details' in list[0], false);
  const audit = f.sql.prepare("SELECT action,actor_id,actor_role FROM community_submission_audits WHERE submission_id=? AND action='deleted'").get(id);
  assert.deepEqual({...audit}, {action: 'deleted', actor_id: 'owner', actor_role: 'owner'});
  assert.equal((await f.request(`/api/admin/submissions/${id}/delete`, owner, {})).status, 409);
});

test('responses are no-store and database failures do not fall back to memory', async () => {
  const response = await communityResponse(new Request('https://test.example/api/events'), {}, null);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {error: 'storage_unavailable'});
});
