import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {manageResponse, resourceSaveEligibility, validateManagedResource, validateSafeSetting} from '../server/manage.mjs';

const seed = {
  id: 'fixture-resource', verified: true, title: 'Fixture primary-publisher link', publisher: 'Fixture Publisher',
  url: 'https://publisher.example/fixture', evidence_url: 'https://publisher.example/about',
  summary: 'A deliberately non-religious test catalogue description used only for management workflow checks.',
  category: 'Finding source references', languages: ['English'], format: 'article', rightsNote: 'LINK ONLY — fixture rights remain with its publisher.',
};
const env = {STATIC_RESOURCES: [seed]};

function fakeDb({override = null} = {}) {
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...next) { values = next; return statement; },
        async first() {
          if (query.includes('COUNT(*) AS count')) return {count: 0};
          if (query.includes('WHERE id=?')) return null;
          if (query.includes('WHERE seed_key=?')) return override && values[0] === 'fixture-resource' ? override : null;
          return null;
        },
        async all() {
          if (query.includes('WHERE seed_key IS NOT NULL')) return {results: override ? [override] : []};
          if (query.includes('management_settings')) return {results: []};
          return {results: []};
        },
        async run() { return {meta: {changes: 0}}; },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
}

function archivedOverride() {
  return {
    id: 'managed-fixture', seed_key: 'fixture-resource', title: seed.title, publisher: seed.publisher,
    publisher_url: seed.evidence_url, resource_url: seed.url, summary: seed.summary, category: seed.category,
    languages_json: JSON.stringify(seed.languages), resource_format: seed.format, rights_note: seed.rightsNote,
    last_checked_on: '2026-10-05', link_status: 'verified', review_state: 'reviewed', status: 'archived',
    created_by: 'owner', created_at: '2026-10-05T00:00:00.000Z', updated_by: 'owner', updated_at: '2026-10-05T00:00:00.000Z', archived_at: '2026-10-05T00:00:00.000Z',
  };
}

test('resource validation requires HTTPS URLs and a verified check before reviewed visibility', () => {
  const base = {title: 'Fixture', publisher: 'Fixture Publisher', publisherUrl: 'https://publisher.example/about', url: 'https://publisher.example/item', summary: 'Original navigation description.', category: 'Finding source references', languages: ['English'], format: 'article', rightsNote: 'LINK ONLY', lastCheckedOn: '2026-10-05', linkStatus: 'verified', reviewState: 'reviewed', status: 'active'};
  assert.equal(validateManagedResource(base).url, 'https://publisher.example/item');
  assert.throws(() => validateManagedResource({...base, url: 'http://publisher.example/item'}), /invalid_resource/);
  assert.throws(() => validateManagedResource({...base, linkStatus: 'unchecked'}), /link_verification_required/);
});

test('safe settings refuse automatic retention and disabled contact has no hidden endpoint', () => {
  assert.deepEqual(validateSafeSetting('contact', {enabled: false, type: 'url', value: 'https://ignored.example'}), {enabled: false, type: null, value: null});
  assert.throws(() => validateSafeSetting('retention', {intakeDays: 90, dryRunOnly: false, automaticPurge: true}), /retention_dry_run_only/);
  assert.deepEqual(validateSafeSetting('usageLimits', {studyRequestsPerDay: 2, speechRequestsPerDay: 0, maxConcurrentJobs: 1}), {studyRequestsPerDay: 2, speechRequestsPerDay: 0, maxConcurrentJobs: 1});
});

test('visitor catalogue exposes only an active reviewed server-eligible seed and hides an archived override', async () => {
  let response = await manageResponse(new Request('https://test.example/api/resources?page=1&pageSize=25'), {DB: fakeDb(), ...env});
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, 'fixture-resource');
  assert.equal(body.items[0].saveEligibility, 'server_validated');
  for (const privateField of ['recordId','seedKey','createdBy','updatedBy','createdAt','updatedAt','archivedAt'])
    assert.equal(Object.hasOwn(body.items[0], privateField), false, `${privateField} stays in owner-only metadata`);
  response = await manageResponse(new Request('https://test.example/api/resources?page=1&pageSize=25'), {DB: fakeDb({override: archivedOverride()}), ...env});
  body = await response.json();
  assert.deepEqual(body.items, []);
});

test('save eligibility blocks an archived seed override even though the immutable seed exists', async () => {
  assert.deepEqual(await resourceSaveEligibility(fakeDb(), 'fixture-resource', env), {eligible: true, reason: 'verified_primary_publisher_seed'});
  assert.deepEqual(await resourceSaveEligibility(fakeDb({override: archivedOverride()}), 'fixture-resource', env), {eligible: false, reason: 'seed_override_not_active_reviewed'});
  assert.deepEqual(await resourceSaveEligibility(fakeDb(), 'unknown-resource', env), {eligible: false, reason: 'unknown_resource'});
});

test('combined mosque API preserves government fields and exposes overlays only as separate correction metadata', async () => {
  const response = await manageResponse(new Request('https://test.example/api/mosques'), {DB: fakeDb(), ...env});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source.governmentRecordsPreserved, true);
  assert.match(body.source.url, /^https:\/\//);
  assert.ok(Array.isArray(body.items) && body.items.length === 108);
  assert.equal(body.items[96].entry, 97);
  assert.equal(body.items[96].registration, 'R/2141/A 112');
  assert.equal('correction' in body.items[96], false);
});

test('management writer rejects cross-site setters and settings remain owner-only', async () => {
  const crossSite = await manageResponse(new Request('https://test.example/api/admin/resources', {method: 'POST', headers: {'content-type': 'application/json', origin: 'https://evil.example'}, body: '{}'}), {DB: fakeDb(), ...env}, {id: 'publisher', role: 'publisher'});
  assert.equal(crossSite.status, 403);
  const settingsDenied = await manageResponse(new Request('https://test.example/api/admin/settings'), {DB: fakeDb(), ...env}, {id: 'reader', role: 'reader'});
  assert.equal(settingsDenied.status, 403);
  const settings = await manageResponse(new Request('https://test.example/api/admin/settings'), {DB: fakeDb(), ...env}, {id: 'owner', role: 'owner'});
  assert.equal(settings.status, 200);
  assert.equal((await settings.json()).retention.automaticPurge, false);
  const audit = await manageResponse(new Request('https://test.example/api/admin/audit?page=1'), {DB: fakeDb(), ...env}, {id: 'owner', role: 'owner'});
  assert.equal(audit.status, 200);
  assert.deepEqual((await audit.json()).items, []);
});

test('migration 006 is additive, has no seed row writes, and publishes the shared role audit contract', async () => {
  const migration = await readFile(new URL('../migrations/006_manage.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS managed_resources/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS review_admin_audit/);
  assert.match(migration, /actor_id VARCHAR\(191\) NOT NULL/);
  assert.doesNotMatch(migration, /\b(?:INSERT|DELETE|UPDATE)\s+INTO?\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
});

test('staff and visitor clients point to real management routes, not read-only placeholder controls', async () => {
  const [staffHtml, staffJs, resourceJs] = await Promise.all([
    readFile(new URL('../public/staff.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/staff.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/resources.js', import.meta.url), 'utf8'),
  ]);
  for (const heading of ['Operational dashboard', 'Curated external resources', 'Mosque correction overlays', 'Restricted intake and reports', 'Safe settings']) assert.match(staffHtml, new RegExp(heading));
  for (const endpoint of ['/api/admin/dashboard', '/api/admin/resources', '/api/admin/mosque-corrections', '/api/admin/intake', '/api/admin/settings', '/api/admin/audit']) assert.match(staffJs, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(staffJs, /REDACT SUBMISSION/);
  assert.match(staffJs, /APPLY COMMUNITY OVERLAY/);
  assert.match(resourceJs, /\/api\/resources\?page=1&pageSize=100/);
  assert.match(resourceJs, /saveEligible/);
  assert.doesNotMatch(staffHtml, /Settings are deliberately read-only/);
});

console.log('manage checks run only against synthetic in-memory adapters and static fixtures; no DATABASE_URL, migration, live DB, or outbound request is used.');
