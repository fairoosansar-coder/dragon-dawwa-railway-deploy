import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { publicReadingAllowed } from '../server/public-read.mjs';
import { anonymousRateCookie, anonymousRateIdentity, rateLimited } from '../server/index.mjs';
import { quranResponse } from '../lib/quran.mjs';

const origin = 'https://dragondawwa.org';
const config = {
  AUTH_PROVIDER: 'google-oidc',
  RAILWAY_PROJECT_ID: '786918bd-4ce1-4075-b763-93c7c6f729a1',
  RAILWAY_ENVIRONMENT_ID: '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66',
  REVIEW_DB_TRANSPORT: 'railway-internal-wireguard',
  REVIEW_DB_ROLE: 'app',
  REVIEW_BIND_HOST: '0.0.0.0',
  DATABASE_URL: 'mysql://dd_app:synthetic-only@mysql.railway.internal/dragon_dawwa_private_railway',
  REVIEW_PUBLIC_ORIGIN: origin,
  GOOGLE_OIDC_ISSUER: 'https://accounts.google.com',
  GOOGLE_OIDC_CLIENT_ID: 'synthetic.apps.googleusercontent.com',
  GOOGLE_OIDC_CLIENT_SECRET: 'only-a-synthetic-client-secret',
  REVIEW_APP_ID: 'dragon-dawwa-public-fixture',
  REVIEW_SESSION_SECRET: 'only-a-synthetic-session-secret-long-enough',
  DD_DELETION_AUDIT_SECRET: 'synthetic-private-deletion-key-not-a-real-secret',
  STUDY_USAGE_SECRET: 'synthetic-private-study-key-not-a-real-secret',
  QURAN_CLIENT_ID: '',
  QURAN_CLIENT_SECRET: '',
  QURAN_ENVIRONMENT: 'production',
};

test('public policy exposes only visitor pages, published-read endpoints, and required assets', () => {
  for (const route of ['/', '/about', '/quran', '/library', '/library/published-reading', '/resources', '/research', '/mosque', '/mosques', '/mosques/97', '/events', '/events/published-event', '/contact', '/privacy', '/terms', '/sources', '/accessibility', '/api/content', '/api/content/published-reading', '/api/events', '/api/resources', '/api/mosques', '/api/quran/bootstrap', '/api/quran/verses', '/assets/mark.svg', '/library.js'])
    assert.equal(publicReadingAllowed('GET', route, config), true, route);
  for (const route of ['/admin', '/staff', '/operations', '/member', '/study', '/api/review/session', '/api/admin/dashboard', '/api/member/me', '/api/study/history', '/api/participation', '/api/corrections', '/admin.js', '/staff.js', '/data/starter-resources.json'])
    assert.equal(publicReadingAllowed('GET', route, config), false, route);
  assert.equal(publicReadingAllowed('GET', '/api/study/availability', config), false);
  for (const route of ['/api/content', '/api/events', '/api/resources', '/api/quran/bootstrap'])
    assert.equal(publicReadingAllowed('POST', route, config), false, route);
});

test('public library footer points to public source attribution, not private administration', () => {
  const html = readFileSync(new URL('../public/library.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/sources"/);
  assert.doesNotMatch(html, /href="\/(?:admin|staff|operations|member|study)"/);
});

test('Quran reader reports a clear source-configuration failure instead of blocking public pages', async () => {
  const response = await quranResponse(new Request(origin + '/api/quran/bootstrap'), config);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'not_configured' });
});

test('signed anonymous rate tokens isolate public reader quotas without trusting forwarded client headers', () => {
  const cookie = value => anonymousRateCookie(config, size => Buffer.alloc(size, value)).split(';')[0];
  const first = anonymousRateIdentity({ headers: { cookie: cookie(1) } }, config);
  const second = anonymousRateIdentity({ headers: { cookie: cookie(2) } }, config);
  assert.equal(first.seeded, true);
  assert.equal(second.seeded, true);
  assert.notEqual(first.id, second.id);
  assert.equal(anonymousRateIdentity({ headers: { cookie: '__Host-dd_public_rate=v1.forged.invalid' } }, config).seeded, false);
  const entries = new Map();
  for (let attempt = 0; attempt < 120; attempt++) assert.equal(rateLimited(first.id + ':/api/content', 120, 60_000, entries, 1), false);
  assert.equal(rateLimited(first.id + ':/api/content', 120, 60_000, entries, 1), true);
  assert.equal(rateLimited(second.id + ':/api/content', 120, 60_000, entries, 1), false);
});

test('signed-out canonical-host responses serve public HTML and keep private routes inaccessible', () => {
  const script = `
    import { handle } from './server/index.mjs';
    const cases = ['/', '/about', '/quran', '/library', '/learn', '/resources', '/research', '/mosque', '/mosques', '/events', '/contact', '/participate', '/privacy', '/terms', '/sources', '/accessibility', '/about/', '/quran/', '/library/', '/resources/', '/research/', '/mosque/', '/mosques/', '/events/', '/contact/', '/participate/?via=nav', '/privacy/', '/terms/', '/sources/', '/accessibility/', '/learn/', '/assets/mark.svg', '/admin.js', '/staff', '/admin', '/member', '/study', '/api/member/me', '/api/admin/dashboard', '/robots.txt', '/sitemap.xml'];
    const output = [];
    for (const path of cases) {
      const response = await handle({ method: 'GET', url: path, headers: { host: 'dragondawwa.org' }, socket: { remoteAddress: '127.0.0.1' } });
      output.push({ path, status: response.status, location: response.headers.get('location'), cookie: response.headers.get('set-cookie'), type: response.headers.get('content-type'), body: await response.text() });
    }
    console.log(JSON.stringify(output));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    // This child is a synthetic Railway fixture, not the host's Webdev Preview.
    // Never inherit injected Preview markers or ambient credentials into it.
    cwd: new URL('../', import.meta.url), env: { ...config }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr.replace(/synthetic-[^\s]*/g, '[redacted]'));
  const pages = JSON.parse(result.stdout.trim().split('\n').at(-1));
  const byPath = Object.fromEntries(pages.map(page => [page.path, page]));
  for (const route of ['/', '/about', '/quran', '/library', '/learn', '/resources', '/research', '/mosque', '/mosques', '/events', '/contact', '/participate', '/privacy', '/terms', '/sources', '/accessibility', '/assets/mark.svg'])
    assert.equal(byPath[route].status, 200, route);
  for (const route of ['/admin.js', '/staff', '/admin', '/member', '/study']) {
    assert.equal(byPath[route].status, 302, route);
    assert.equal(byPath[route].location, '/login', route);
  }
  for (const route of ['/api/member/me', '/api/admin/dashboard']) assert.equal(byPath[route].status, 401, route);
  assert.match(byPath['/'].body, /<link rel="canonical" href="https:\/\/dragondawwa\.org\/">/);
  assert.match(byPath['/quran'].cookie, /__Host-dd_public_rate=v1\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800/);
  assert.match(byPath['/learn'].body, /<link rel="canonical" href="https:\/\/dragondawwa\.org\/library">/);
  assert.match(byPath['/participate'].body, /<link rel="canonical" href="https:\/\/dragondawwa\.org\/contact">/);
  assert.match(byPath['/'].body, /<meta name="robots" content="index,follow,max-image-preview:large">/);
  assert.doesNotMatch(byPath['/'].body, /content="noindex,nofollow"/);
  assert.match(byPath['/contact'].body, /No public form is available/);
  assert.doesNotMatch(byPath['/contact'].body, /participation-form/);
  assert.doesNotMatch(byPath['/mosque'].body, /correction-form/);
  for (const route of ['/library', '/resources', '/mosques', '/sources', '/accessibility'])
    assert.doesNotMatch(byPath[route].body, /href="\/(?:study|member)"/, route);
  assert.match(byPath['/robots.txt'].body, /Disallow: \/admin/);
  assert.match(byPath['/robots.txt'].body, /Sitemap: https:\/\/dragondawwa\.org\/sitemap\.xml/);
  assert.match(byPath['/sitemap.xml'].body, /<loc>https:\/\/dragondawwa\.org\/library<\/loc>/);
  assert.doesNotMatch(byPath['/sitemap.xml'].body, /\/admin|\/member|\/study/);
  for (const route of ['/about/', '/quran/', '/library/', '/resources/', '/research/', '/mosque/', '/mosques/', '/events/', '/contact/', '/privacy/', '/terms/', '/sources/', '/accessibility/', '/learn/']) {
    assert.equal(byPath[route].status, 308, route);
    assert.equal(byPath[route].location, route.slice(0, -1), route);
  }
  assert.equal(byPath['/participate/?via=nav'].status, 308);
  assert.equal(byPath['/participate/?via=nav'].location, '/participate?via=nav');
});

console.log('Public launch checks use synthetic configuration only; no Railway service, database, or provider was contacted.');
