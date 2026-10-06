import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { googleAuthResponse, googleModeConfig, googleSubjectId, canonicalGoogleHost, publicLoginPage } from '../server/google-auth.mjs';
import { publicPolicyPage } from '../server/public-policies.mjs';
import { authResponse, verifiedRequestUser } from '../server/auth.mjs';
import { changeRole } from '../server/access.mjs';
import { deletionAuditSecret } from '../server/member.mjs';
import { usageSecret } from '../server/study.mjs';
import { sessionTokenHash } from '../server/session.mjs';
import { quranResponse } from '../lib/quran.mjs';

const now = Date.now();
const origin = 'https://dragon-dawwa-fixture.up.railway.app';
const subject = 'synthetic-google-subject';
const id = googleSubjectId(subject);
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
  REVIEW_APP_ID: 'dragon-dawwa-railway-fixture',
  REVIEW_SESSION_SECRET: 'only-a-synthetic-session-secret-long-enough',
  DD_DELETION_AUDIT_SECRET: 'synthetic-private-deletion-key-not-a-real-secret',
  STUDY_USAGE_SECRET: 'synthetic-private-study-key-not-a-real-secret',
  QURAN_CLIENT_ID: 'synthetic-quran-client-id',
  QURAN_CLIENT_SECRET: 'synthetic-quran-client-secret',
  QURAN_ENVIRONMENT: 'production',
};
const mock = {
  randomState: () => 's'.repeat(43),
  randomNonce: () => 'n'.repeat(43),
  randomPKCECodeVerifier: () => 'v'.repeat(43),
  calculatePKCECodeChallenge: async value => createHash('sha256').update(value).digest('base64url'),
  buildAuthorizationUrl: (_client, params) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  },
  authorizationCodeGrant: async (_client, callback, checks) => {
    assert.equal(callback.searchParams.get('state'), checks.expectedState);
    assert.equal(checks.expectedNonce, 'n'.repeat(43));
    assert.equal(checks.pkceCodeVerifier, 'v'.repeat(43));
    assert.equal(checks.idTokenExpected, true);
    return { claims: () => ({ iss: 'https://accounts.google.com', sub: subject,
      email_verified: true, email: 'fictional.fixture@example.test', name: 'Fixture <Owner>' }) };
  },
};
function db(role = 'owner') {
  return {
    roles: new Map(role ? [[id, { role, disabled: 0 }]] : []),
    revoked: new Set(), epochs: new Map(), outage: false,
    prepare(sql) {
      let bind = [];
      const statement = {
        bind(...values) { bind = values; return statement; },
        first: async () => {
          if (this.outage) throw new Error('synthetic database offline');
          if (sql.startsWith('SELECT role,disabled FROM review_roles')) return this.roles.get(bind[0]) || null;
          if (sql.startsWith('SELECT token_hash FROM review_session_revocations')) return this.revoked.has(bind[0]) ? { token_hash: bind[0] } : null;
          if (sql.startsWith('SELECT revoked_after FROM review_session_epochs')) return this.epochs.has(bind[0]) ? { revoked_after: this.epochs.get(bind[0]) } : null;
          throw new Error('Unexpected synthetic SELECT');
        },
        run: async () => {
          if (sql.startsWith('DELETE FROM review_session_revocations')) return { meta: { changes: 0 } };
          if (sql.startsWith('INSERT INTO review_session_revocations')) { this.revoked.add(bind[0]); return { meta: { changes: 1 } }; }
          if (sql.startsWith('INSERT INTO review_session_epochs')) { this.epochs.set(bind[0], bind[1]); return { meta: { changes: 1 } }; }
          throw new Error('Unexpected synthetic write');
        },
      };
      return statement;
    },
  };
}
function request(path, { cookie = '', method = 'GET', headers = {} } = {}) {
  return new Request(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...headers } });
}
function headerCookies(response) { return response.headers.getSetCookie(); }
function getCookie(response, name) { return headerCookies(response).find(value => value.startsWith(name + '='))?.split(';')[0]; }
async function start(options = {}) {
  return googleAuthResponse(request('/auth/login', options), config, { db: db(), now: () => now, library: mock, discover: async () => ({}) });
}
function callbackQuery(state = 's'.repeat(43)) { return `/auth/callback?code=synthetic-code&state=${state}`; }
async function finish(startResponse, database, { path = callbackQuery(), cookie = getCookie(startResponse, '__Host-dd_oidc_flow'), nowValue = now } = {}) {
  return googleAuthResponse(request(path, { cookie }), config, { db: database, now: () => nowValue, library: mock, discover: async () => ({}) });
}

test('Google mode accepts only the exact private Railway project and canonical HTTPS origin', () => {
  assert.equal(googleModeConfig(config).origin, origin);
  assert.equal(googleModeConfig({ ...config, REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org' }).origin, 'https://dragondawwa.org');
  assert.equal(googleModeConfig({ ...config, QURAN_CLIENT_ID: '', QURAN_CLIENT_SECRET: '' }).origin, origin);
  for (const patch of [
    { RAILWAY_PROJECT_ID: 'unrelated-hobby' }, { RAILWAY_ENVIRONMENT_ID: 'different' },
    { REVIEW_PUBLIC_ORIGIN: 'http://dragon-dawwa-fixture.up.railway.app' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragon-dawwa-fixture.up.railway.app.evil.test' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragon-dawwa-fixture.up.railway.app/inside' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragon-dawwa-fixture.up.railway.app:8443' },
    { REVIEW_PUBLIC_ORIGIN: 'http://dragondawwa.org' },
    { REVIEW_PUBLIC_ORIGIN: 'https://www.dragondawwa.org' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org.evil.test' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org:8443' },
    { REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org/study' },
    { REVIEW_BIND_HOST: '127.0.0.1' }, { REVIEW_DB_ROLE: 'migrator' },
    { DD_PUBLIC_READ_MODE: 'approved-public-readonly' }, { EDITORIAL_OWNER_ID: 'other' },
    { GOOGLE_OIDC_ISSUER: 'https://evil.test' }, { REVIEW_SESSION_SECRET: 'short' },
    { MANUS_WEBDEV_PROJECT_ID: 'review-project' },
    { DD_DELETION_AUDIT_SECRET: '' }, { STUDY_USAGE_SECRET: '' },
    { QURAN_CLIENT_ID: '' }, { QURAN_CLIENT_SECRET: '' }, { QURAN_ENVIRONMENT: 'staging' },
  ]) assert.throws(() => googleModeConfig({ ...config, ...patch }), /not safely configured/);
});
test('missing separate Quran credentials do not block owner login or serve substituted Quran content', async () => {
  const authOnly = { ...config, QURAN_CLIENT_ID: '', QURAN_CLIENT_SECRET: '' };
  assert.equal(googleModeConfig(authOnly).origin, origin);
  const denial = await quranResponse(new Request(origin + '/api/quran/bootstrap'), authOnly);
  assert.equal(denial.status, 503);
  assert.deepEqual(await denial.json(), { error: 'not_configured' });
  for (const incomplete of [
    { QURAN_CLIENT_ID: config.QURAN_CLIENT_ID, QURAN_CLIENT_SECRET: '' },
    { QURAN_CLIENT_ID: '', QURAN_CLIENT_SECRET: config.QURAN_CLIENT_SECRET },
  ]) assert.throws(() => googleModeConfig({ ...authOnly, ...incomplete }), /not safely configured/);
});
test('Google application routes are allowed only on the canonical public Host, never the Railway bootstrap hostname', () => {
  const apex = 'https://dragondawwa.org';
  assert.equal(canonicalGoogleHost('dragondawwa.org', apex), true);
  for (const host of ['www.dragondawwa.org', 'dragondawwa.org.evil.test', 'dragondawwa.org:443',
    'dragondawwa.org.', 'dragon-dawwa-fixture.up.railway.app', 'DRAGONDAWWA.ORG', '', undefined])
    assert.equal(canonicalGoogleHost(host, apex), false);
  assert.equal(canonicalGoogleHost('dragon-dawwa-fixture.up.railway.app', origin), true);
});

test('Railway member deletion and study usage require independent stable protected keys', () => {
  assert.equal(deletionAuditSecret(config), config.DD_DELETION_AUDIT_SECRET);
  assert.equal(usageSecret(config), config.STUDY_USAGE_SECRET);
  assert.throws(() => deletionAuditSecret({ ...config, DD_DELETION_AUDIT_SECRET: '', MANUS_JWT_SECRET: 'legacy-secret' }));
  assert.throws(() => usageSecret({ ...config, STUDY_USAGE_SECRET: '', MANUS_JWT_SECRET: 'legacy-secret' }));
  assert.equal(deletionAuditSecret({ MANUS_JWT_SECRET: 'legacy-preview-secret' }), 'legacy-preview-secret');
  assert.equal(usageSecret({ MANUS_JWT_SECRET: 'legacy-preview-secret' }), 'legacy-preview-secret');
});

test('opaque role identity is stable for sub and does not contain email or permit invalid subjects', () => {
  assert.match(id, /^google:[A-Za-z0-9_-]{43}$/);
  assert.equal(googleSubjectId(subject), id);
  assert.notEqual(googleSubjectId(subject + '2'), id);
  assert.equal(googleSubjectId(''), null);
  assert.equal(googleSubjectId('a'.repeat(256)), null);
});

test('anonymous login page contains no private content or external assets', async () => {
  const response = publicLoginPage();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const html = await response.text();
  assert.match(html, /Continue with Google/);
  assert.match(html, /owner can open/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.doesNotMatch(html, /quran\.html|member_profiles|src="\//);
});

test('only static legal notices can be read without an invitation on the canonical Google Host', async () => {
  for (const page of ['/privacy', '/terms']) {
    const response = publicPolicyPage(page);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /noindex,nofollow/);
    assert.match(html, /Private review/i);
    assert.match(html, /Google|privacy notice/i);
    assert.doesNotMatch(html, /<script|<link|<img|src="\/|member_profiles|review_roles/);
    const head = publicPolicyPage(page, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(publicPolicyPage(page, 'POST').status, 405);
  }
  const privacy = await publicPolicyPage('/privacy').text();
  assert.match(privacy, /openid email profile/);
  assert.match(privacy, /email is checked for validity but is not used as your invitation key/);
  assert.match(privacy, /no automatic expiry/);
  for (const route of ['/quran', '/member', '/assets/mark.svg', '/data/starter-resources.json', '/api/review/session'])
    assert.equal(publicPolicyPage(route).status, 404);
  const source = await readFile(new URL('../server/index.mjs', import.meta.url), 'utf8');
  const host = source.indexOf('!canonicalGoogleHost(req.headers.host, origin)');
  const legal = source.indexOf("pathname === '/privacy' || pathname === '/terms'");
  const authorization = source.indexOf('const user = identityBound ?');
  assert.ok(host > 0 && legal > host && authorization > legal);
  assert.match(source, /if \(googleMode && \(pathname === '\/privacy' \|\| pathname === '\/terms'\)\)\s*return publicPolicyPage\(pathname, req\.method\)/);
});

test('authorization start binds PKCE, state, nonce, redirect URI and encrypted short-lived first-party cookie', async () => {
  const response = await start();
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get('location'));
  assert.equal(redirect.hostname, 'accounts.google.com');
  assert.equal(redirect.searchParams.get('redirect_uri'), origin + '/auth/callback');
  assert.equal(redirect.searchParams.get('state'), 's'.repeat(43));
  assert.equal(redirect.searchParams.get('nonce'), 'n'.repeat(43));
  assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(redirect.searchParams.get('code_challenge'), createHash('sha256').update('v'.repeat(43)).digest('base64url'));
  assert.match(headerCookies(response).join(' '), /__Host-dd_oidc_flow=.*HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.doesNotMatch(headerCookies(response).join(' '), /s{43}|n{43}|v{43}/);
});

test('custom apex is the only canonical OAuth callback origin after binding', async () => {
  const apex = 'https://dragondawwa.org';
  const env = { ...config, REVIEW_PUBLIC_ORIGIN: apex };
  const database = db();
  const options = { db: database, now: () => now, library: mock, discover: async () => ({}) };
  const login = await googleAuthResponse(new Request(apex + '/auth/login'), env, options);
  assert.equal(login.status, 302);
  assert.equal(new URL(login.headers.get('location')).searchParams.get('redirect_uri'), apex + '/auth/callback');
  const cookie = getCookie(login, '__Host-dd_oidc_flow');
  const callback = await googleAuthResponse(new Request(apex + callbackQuery(), { headers: { cookie } }), env, options);
  assert.equal(callback.status, 302);
  assert.ok(getCookie(callback, 'webdev_app_session'));
  const otherHost = await googleAuthResponse(new Request(origin + callbackQuery(), { headers: { cookie } }), env, options);
  assert.equal(otherHost.status, 403);
});

test('invalid, duplicated, tampered and expired login state never reaches the token endpoint', async () => {
  const started = await start();
  const database = db();
  for (const options of [
    { cookie: '' }, { path: callbackQuery('x'.repeat(43)) },
    { path: callbackQuery() + '&state=' + 's'.repeat(43) },
    { path: callbackQuery() + '&error=access_denied' },
    { cookie: getCookie(started, '__Host-dd_oidc_flow') + 'bad' },
    { nowValue: now + 601_000 },
    { cookie: getCookie(started, '__Host-dd_oidc_flow') + '; ' + getCookie(started, '__Host-dd_oidc_flow') },
  ]) {
    const denied = await finish(started, database, options);
    assert.equal(denied.status, 400);
    assert.ok(!getCookie(denied, 'webdev_app_session'));
  }
});

test('verified but uninvited or suspended Google users never receive an application session', async () => {
  const started = await start();
  const database = db(null);
  const uninvited = await finish(started, database);
  assert.equal(uninvited.status, 403);
  assert.match(await uninvited.text(), new RegExp(id));
  assert.ok(!getCookie(uninvited, 'webdev_app_session'));
  database.roles.set(id, { role: 'reader', disabled: 1 });
  assert.equal((await finish(started, database)).status, 403);
  database.roles.set(id, { role: 'visitor', disabled: 0 });
  assert.equal((await finish(started, database)).status, 403);
});

test('invited login becomes an eight-hour secure cookie with DB-backed immediate revocation and logout-all', async () => {
  const database = db('reader');
  const started = await start();
  const complete = await finish(started, database);
  assert.equal(complete.status, 302);
  assert.equal(complete.headers.get('location'), '/');
  const session = getCookie(complete, 'webdev_app_session');
  assert.match(session, /^webdev_app_session=[A-Za-z0-9_.-]+$/);
  assert.match(headerCookies(complete).join(' '), /webdev_app_session=.*Secure; SameSite=Lax; Max-Age=28800/);
  assert.equal((await verifiedRequestUser(request('/', { cookie: session }), config, database, { now: () => now }))?.id, id);
  assert.equal(await verifiedRequestUser(request('/', { cookie: session + '; ' + session }), config, database, { now: () => now }), null);
  const copied = session;
  const denied = await authResponse(request('/auth/logout', { cookie: session, method: 'POST', headers: { origin: 'https://attacker.test', 'sec-fetch-site': 'cross-site' } }), config, { db: database, now: () => now });
  assert.equal(denied.status, 403);
  const get = await authResponse(request('/auth/logout', { cookie: session }), config, { db: database, now: () => now });
  assert.equal(get.status, 405);
  assert.equal((await verifiedRequestUser(request('/', { cookie: copied }), config, database, { now: () => now }))?.id, id);
  const all = await authResponse(request('/auth/logout-all', { cookie: session, method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin' } }), config, { db: database, now: () => now });
  assert.equal(all.status, 303);
  assert.match(headerCookies(all).join(' '), /webdev_app_session=; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=0/);
  assert.equal(await verifiedRequestUser(request('/', { cookie: copied }), config, database, { now: () => now + 1 }), null);
  assert.notEqual(sessionTokenHash(session.split('=')[1]), null);
});

test('an owner role revocation commits the session epoch atomically and invalidates a copied Google cookie', async () => {
  const database = db('reader');
  const session = getCookie(await finish(await start(), database), 'webdev_app_session');
  assert.equal((await verifiedRequestUser(request('/', { cookie: session }), config, database, { now: () => now }))?.id, id);
  let snapshot;
  const connection = {
    async beginTransaction() { snapshot = { roles: new Map(database.roles), epochs: new Map(database.epochs) }; },
    async commit() { snapshot = null; },
    async rollback() { database.roles = snapshot.roles; database.epochs = snapshot.epochs; },
    release() {},
    async query(sql, values = []) { return this.execute(sql, values); },
    async execute(sql, values = []) {
      if (sql.startsWith('SELECT user_id FROM review_roles')) return [[{ user_id: 'owner-fixture' }]];
      if (sql.startsWith('SELECT role,disabled FROM review_roles WHERE user_id=?')) return [[database.roles.get(values[0])].filter(Boolean)];
      if (sql.startsWith('INSERT INTO review_roles')) { database.roles.set(values[0], { role: values[1], disabled: values[2] }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO review_admin_audit')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT token_hash FROM review_session_revocations')) return [[]];
      if (sql.startsWith('SELECT revoked_after FROM review_session_epochs')) return [[database.epochs.has(values[0]) ? { revoked_after: database.epochs.get(values[0]) } : null].filter(Boolean)];
      if (sql.startsWith('DELETE FROM review_session_revocations')) return [{ affectedRows: 0 }];
      if (sql.startsWith('INSERT INTO review_session_epochs')) { database.epochs.set(values[0], values[1]); return [{ affectedRows: 1 }]; }
      throw new Error('Unhandled transaction query: ' + sql);
    },
  };
  const response = await changeRole({ id: 'owner-fixture' }, { userId: id, role: 'revoke' },
    { pool: { getConnection: async () => connection }, now: () => now + 3 });
  assert.equal(response.status, 200);
  assert.equal(database.roles.get(id).disabled, 1);
  assert.equal(database.epochs.get(id), now + 3);
  assert.equal(await verifiedRequestUser(request('/', { cookie: session }), config, database, { now: () => now + 4 }), null);
  database.roles.set(id, { role: 'reader', disabled: 0 });
  database.epochs.delete(id);
  const failedEpoch = { ...connection,
    async execute(sql, values) {
      if (sql.startsWith('INSERT INTO review_session_epochs')) throw new Error('synthetic epoch unavailable');
      return connection.execute(sql, values);
    },
  };
  const rolledBack = await changeRole({ id: 'owner-fixture' }, { userId: id, role: 'revoke' },
    { pool: { getConnection: async () => failedEpoch }, now: () => now + 5 });
  assert.equal(rolledBack.status, 503);
  assert.equal(database.roles.get(id).disabled, 0);
  assert.equal(database.epochs.has(id), false);
  assert.equal((await verifiedRequestUser(request('/', { cookie: session }), config, database, { now: () => now + 6 }))?.id, id);
});

test('database outage, invalid ID claims and provider errors fail without issuing a session', async () => {
  const started = await start();
  const database = db('owner');
  database.outage = true;
  assert.equal((await finish(started, database)).status, 503);
  database.outage = false;
  const fake = { ...mock, authorizationCodeGrant: async () => ({ claims: () => ({ sub: subject, iss: 'https://evil.test', email_verified: true, email: 'f@example.test' }) }) };
  const denial = await googleAuthResponse(request(callbackQuery(), { cookie: getCookie(started, '__Host-dd_oidc_flow') }), config,
    { db: database, now: () => now, library: fake, discover: async () => ({}) });
  assert.equal(denial.status, 401);
  assert.ok(!getCookie(denial, 'webdev_app_session'));
});

test('server startup and protected routes are structurally bounded to the Google mode', async () => {
  const source = await readFile(new URL('../server/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(googleMode\) googleModeConfig\(process\.env\)/);
  assert.match(source, /if \(pathname === '\/login' && googleMode\)/);
  assert.match(source, /googleMode \? '\/login' : '\/auth\/login'/);
  assert.match(source, /!tailnetMode && !googleMode && !verifiedActor/);
  assert.match(source, /if \(!verifiedActor && !visitorRead\)/);
  const docker = await readFile(new URL('../deploy/railway/Dockerfile.https', import.meta.url), 'utf8');
  assert.match(docker, /^EXPOSE 3000$/m);
  assert.match(docker, /^USER node$/m);
  assert.doesNotMatch(docker, /tailscale|REVIEW_SESSION_SECRET=/i);
  const result = spawnSync(process.execPath, ['server/index.mjs'], { cwd: new URL('../', import.meta.url),
    env: { ...config, RAILWAY_PROJECT_ID: 'unrelated-project', PATH: process.env.PATH }, encoding: 'utf8', timeout: 8000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not safely configured/);
  assert.doesNotMatch(result.stderr, /synthetic-only|synthetic-session/);
});

test('actual router permits only login and two legal notices to anonymous canonical-Host requests', () => {
  const script = `
    import { handle } from './server/index.mjs';
    const cases = [
      ['GET','/login','dragondawwa.org'],
      ['GET','/privacy','dragondawwa.org'], ['HEAD','/privacy','dragondawwa.org'],
      ['POST','/privacy','dragondawwa.org'],
      ['GET','/terms','dragondawwa.org'], ['HEAD','/terms','dragondawwa.org'],
      ['POST','/terms','dragondawwa.org'],
      ['GET','/','dragondawwa.org'], ['GET','/quran','dragondawwa.org'],
      ['GET','/assets/mark.svg','dragondawwa.org'],
      ['GET','/data/starter-resources.json','dragondawwa.org'],
      ['GET','/api/review/session','dragondawwa.org'],
      ['GET','/privacy','www.dragondawwa.org'],
      ['GET','/terms','dragon-dawwa-fixture.up.railway.app'],
      ['GET','/login','dragondawwa.org.evil.test'],
    ];
    const results = [];
    for (const [method, url, host] of cases) {
      const response = await handle({ method, url, headers: { host }, socket: { remoteAddress: '127.0.0.1' } });
      results.push({ status: response.status, location: response.headers.get('location'), type: response.headers.get('content-type') });
    }
    console.log(JSON.stringify(results));
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../', import.meta.url),
    env: { ...config, REVIEW_PUBLIC_ORIGIN: 'https://dragondawwa.org', PATH: process.env.PATH },
    encoding: 'utf8', timeout: 8_000,
  });
  assert.equal(result.status, 0, result.stderr.replace(/synthetic-[^\s]*/g, '[redacted]'));
  const outcomes = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.deepEqual(outcomes.map(value => value.status), [200, 200, 200, 405, 200, 200, 405, 302, 302, 302, 302, 401, 421, 421, 421]);
  for (const value of outcomes.slice(7, 11)) assert.equal(value.location, '/login');
  for (const value of [outcomes[1], outcomes[2], outcomes[4], outcomes[5]]) assert.match(value.type, /text\/html/);
});

test('owner bootstrap refuses a claimed Google account with app privileges before connecting', () => {
  const result = spawnSync(process.execPath, ['scripts/bootstrap-review-owner.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...config, REVIEW_BOOTSTRAP_OWNER_ID: id, PATH: process.env.PATH },
    encoding: 'utf8', timeout: 8_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /isolated Railway migrator/);
  assert.doesNotMatch(result.stderr, /synthetic-only|synthetic-session/);
});

console.log('Google OIDC checks use only synthetic claims and a mocked token exchange; no real provider, database or Railway deployment was contacted.');
