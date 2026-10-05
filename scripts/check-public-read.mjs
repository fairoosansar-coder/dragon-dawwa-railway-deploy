import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReadingAllowed } from '../server/public-read.mjs';
const disabled = {};
const enabled = { DD_PUBLIC_READ_MODE: 'approved-public-readonly' };

test('private mode never exposes a visitor or staff route', () => {
  for (const route of ['/', '/quran', '/api/content', '/admin', '/api/member/me'])
    assert.equal(publicReadingAllowed('GET', route, disabled), false, route);
});

test('separately approved public mode serves published-only visitor GETs', () => {
  for (const route of ['/', '/about', '/library/qa-reading', '/api/content', '/api/content/qa-reading', '/api/quran/verses', '/api/events', '/api/resources', '/api/mosques', '/mosques/97', '/mosque', '/privacy', '/sources', '/assets/mark.svg', '/data/starter-resources.json'])
    assert.equal(publicReadingAllowed('GET', route, enabled), true, route);
});

test('accounts, privileged operations, private history, fees and cross-origin writes are never public reads', () => {
  for (const route of ['/staff', '/admin', '/operations', '/member', '/study', '/contact', '/participate', '/mosques/official-97', '/api/review/identity', '/api/review/session', '/api/admin/documents', '/api/admin/roles', '/api/member/me', '/api/study/generate', '/api/study/history', '/api/study/audio/123', '/api/participation', '/api/corrections', '/api/admin/settings', '/api/scheduled/purge'])
    assert.equal(publicReadingAllowed('GET', route, enabled), false, route);
  for (const route of ['/', '/api/content', '/api/events', '/api/resources', '/api/quran/verses'])
    assert.equal(publicReadingAllowed('POST', route, enabled), false, route);
  for (const route of ['/data/../server/auth.mjs', '/assets/../../server/db.mjs', '//staff', '/api/content/a/b'])
    assert.equal(publicReadingAllowed('GET', route, enabled), false, route);
});
