import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReadEnabled, publicReadingAllowed } from '../server/public-read.mjs';
const disabled = {};
const enabled = { DD_PUBLIC_READ_MODE: 'approved-public-readonly' };
const live = { AUTH_PROVIDER: 'google-oidc', REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org' };

test('private mode never exposes a visitor or staff route', () => {
  for (const route of ['/', '/quran', '/api/content', '/admin', '/api/member/me'])
    assert.equal(publicReadingAllowed('GET', route, disabled), false, route);
});

test('separately approved public mode serves published-only visitor GETs', () => {
  for (const route of ['/', '/about', '/library/qa-reading', '/api/content', '/api/content/qa-reading', '/api/quran/verses', '/api/events', '/api/resources', '/api/mosques', '/mosques/97', '/mosque', '/privacy', '/terms', '/sources', '/accessibility', '/contact', '/assets/mark.svg', '/data/mosques-anuradhapura.json'])
    assert.equal(publicReadingAllowed('GET', route, enabled), true, route);
});

test('the approved canonical public origin enables public reading and retains an explicit private override', () => {
  assert.equal(publicReadEnabled(live), true);
  assert.equal(publicReadingAllowed('GET', '/', live), true);
  assert.equal(publicReadEnabled({ ...live, DD_PUBLIC_READ_MODE: 'private' }), false);
  assert.equal(publicReadingAllowed('GET', '/', { ...live, DD_PUBLIC_READ_MODE: 'private' }), false);
  assert.equal(publicReadEnabled({ AUTH_PROVIDER: 'google-oidc', REVIEW_PUBLIC_ORIGIN: 'https://unrelated.up.railway.app' }), false);
});

test('accounts, privileged operations, private history, intake and cross-origin writes are never public reads', () => {
  for (const route of ['/staff', '/admin', '/operations', '/member', '/study', '/mosques/official-97', '/api/review/identity', '/api/review/session', '/api/admin/documents', '/api/admin/roles', '/api/member/me', '/api/study/generate', '/api/study/history', '/api/study/audio/123', '/api/participation', '/api/corrections', '/api/admin/settings', '/api/scheduled/purge', '/admin.js', '/staff.js', '/data/starter-resources.json'])
    assert.equal(publicReadingAllowed('GET', route, enabled), false, route);
  for (const route of ['/', '/api/content', '/api/events', '/api/resources', '/api/quran/verses'])
    assert.equal(publicReadingAllowed('POST', route, enabled), false, route);
  for (const route of ['/data/../server/auth.mjs', '/assets/../../server/db.mjs', '//staff', '/api/content/a/b'])
    assert.equal(publicReadingAllowed('GET', route, enabled), false, route);
});
