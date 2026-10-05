import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tailnetAuthResponse, tailnetIdentity, sessionMatchesIdentity } from '../server/tailnet-auth.mjs';
import { verifiedRequestUser, verifySession } from '../server/auth.mjs';

const now = 1_800_000_000_000;
const config = {
  AUTH_PROVIDER: 'tailscale-serve',
  REVIEW_BIND_HOST: '127.0.0.1',
  REVIEW_APP_ID: 'tailnet-review-fixture',
  REVIEW_SESSION_SECRET: 'synthetic-tailnet-session-signing-key',
  REVIEW_PUBLIC_ORIGIN: 'https://review.fixture.ts.net',
};

function serveHeaders(login = 'alice@example.com', name = 'Alice Example') {
  return {
    'tailscale-user-login': login,
    ...(name === undefined ? {} : { 'tailscale-user-name': name }),
  };
}

function request(path, { method = 'GET', headers = {}, cookie = '' } = {}) {
  return new Request(`${config.REVIEW_PUBLIC_ORIGIN}${path}`, {
    method,
    headers: { ...(cookie ? { cookie: `webdev_app_session=${cookie}` } : {}), ...headers },
  });
}

function issuedCookie(response) {
  const match = response.headers.get('set-cookie')?.match(/^webdev_app_session=([^;]+);/);
  assert.ok(match, 'successful login must issue the application session cookie');
  return match[1];
}

class SessionFixtureDb {
  constructor() {
    this.revocations = new Map();
    this.epochs = new Map();
  }

  prepare(sql) {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async run() {
        if (sql.startsWith('DELETE FROM review_session_revocations')) {
          for (const [hash, row] of this.db.revocations) if (row.expiresAt <= values[0]) this.db.revocations.delete(hash);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO review_session_revocations')) {
          const [hash, userId, expiresAt] = values;
          this.db.revocations.set(hash, { userId, expiresAt });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO review_session_epochs')) {
          const [userId, revokedAfter] = values;
          this.db.epochs.set(userId, revokedAfter);
          return { meta: { changes: 1 } };
        }
        throw new Error(`Unhandled query: ${sql}`);
      },
      async first() {
        if (sql.startsWith('SELECT token_hash FROM review_session_revocations')) {
          const row = this.db.revocations.get(values[0]);
          return row && row.expiresAt > values[1] ? { token_hash: values[0] } : null;
        }
        if (sql.startsWith('SELECT revoked_after FROM review_session_epochs')) {
          const value = this.db.epochs.get(values[0]);
          return value === undefined ? null : { revoked_after: value };
        }
        throw new Error(`Unhandled query: ${sql}`);
      },
      db: this,
    };
    return statement;
  }
}

async function login(login = 'alice@example.com', name = 'Alice Example') {
  const response = await tailnetAuthResponse(request('/auth/login', { headers: serveHeaders(login, name) }), config, {
    remoteAddress: '127.0.0.1', now: () => now,
  });
  assert.equal(response.status, 302);
  return issuedCookie(response);
}

test('Serve login maps a canonical ASCII login to an exact tailnet ID and an 8-hour signed cookie', async () => {
  const response = await tailnetAuthResponse(request('/auth/login', {
    headers: serveHeaders('Alice+Review@Example.COM', 'Alice Example'),
  }), config, { remoteAddress: '127.0.0.1', now: () => now });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
  const cookie = issuedCookie(response);
  const identity = tailnetIdentity(request('/', { headers: serveHeaders('Alice+Review@Example.COM') }), config, {
    remoteAddress: '127.0.0.1',
  });
  assert.deepEqual(identity, { id: 'tailnet:alice+review@example.com', login: 'alice+review@example.com', name: 'Alice Example' });
  assert.equal(sessionMatchesIdentity(cookie, config, identity, { now: () => now }), true);
  assert.equal(sessionMatchesIdentity(cookie, config, { ...identity, id: 'tailnet:other@example.com' }, { now: () => now }), false);
});

test('only localhost Serve traffic with a valid header is accepted; direct, tagged, and malformed requests fail closed', () => {
  const withHeaders = request('/', { headers: serveHeaders() });
  assert.equal(tailnetIdentity(withHeaders, config, { remoteAddress: '10.0.0.7' }), null);
  assert.equal(tailnetIdentity(withHeaders, config, { remoteAddress: undefined }), null);
  assert.equal(tailnetIdentity(request('/'), config, { remoteAddress: '127.0.0.1' }), null); // tagged devices have no identity header
  assert.equal(tailnetIdentity(request('/', { headers: serveHeaders('not an email') }), config, { remoteAddress: '127.0.0.1' }), null);
  const rfc2047Name = tailnetIdentity(request('/', { headers: serveHeaders('shared.user@example.net', '=?utf-8?q?Ferris_B=C3=BCller?=') }), config, {
    remoteAddress: '127.0.0.1',
  });
  assert.deepEqual(rfc2047Name, { id: 'tailnet:shared.user@example.net', login: 'shared.user@example.net', name: '' });
});

test('missing or unsafe Tailnet configuration cannot enable header authentication', async () => {
  const missingSecret = { ...config, REVIEW_SESSION_SECRET: '' };
  const wrongProvider = { ...config, AUTH_PROVIDER: 'manus' };
  const unsafeOrigin = { ...config, REVIEW_PUBLIC_ORIGIN: 'https://review.fixture.example' };
  for (const candidate of [missingSecret, wrongProvider, unsafeOrigin]) {
    assert.equal(tailnetIdentity(request('/', { headers: serveHeaders() }), candidate, { remoteAddress: '127.0.0.1' }), null);
    const response = await tailnetAuthResponse(request('/auth/login', { headers: serveHeaders() }), candidate, {
      remoteAddress: '127.0.0.1', now: () => now,
    });
    assert.equal(response.status, 503);
  }
});

test('logout refuses a copied cookie when the current Serve identity differs', async () => {
  const cookie = await login('alice@example.com');
  const db = new SessionFixtureDb();
  const response = await tailnetAuthResponse(request('/auth/logout', {
    method: 'POST', cookie,
    headers: { ...serveHeaders('bob@example.com'), origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' },
  }), config, { db, remoteAddress: '127.0.0.1', now: () => now });
  assert.equal(response.status, 403);
  assert.equal(db.revocations.size, 0);
  assert.equal(db.epochs.size, 0);
});

test('logout is POST-only and requires the configured same HTTPS origin', async () => {
  const cookie = await login();
  const db = new SessionFixtureDb();
  const get = await tailnetAuthResponse(request('/auth/logout', { cookie, headers: serveHeaders() }), config, {
    db, remoteAddress: '127.0.0.1', now: () => now,
  });
  assert.equal(get.status, 405);
  const crossSite = await tailnetAuthResponse(request('/auth/logout', {
    method: 'POST', cookie,
    headers: { ...serveHeaders(), origin: 'https://attacker.fixture.ts.net', 'sec-fetch-site': 'cross-site' },
  }), config, { db, remoteAddress: '127.0.0.1', now: () => now });
  assert.equal(crossSite.status, 403);
  assert.equal(db.revocations.size, 0);
});

test('matched identity logout and logout-all persist revocation through the DB adapter and clear the cookie', async () => {
  const db = new SessionFixtureDb();
  const cookie = await login();
  const logout = await tailnetAuthResponse(request('/auth/logout', {
    method: 'POST', cookie,
    headers: { ...serveHeaders(), origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' },
  }), config, { db, remoteAddress: '127.0.0.1', now: () => now });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('set-cookie'), /webdev_app_session=;.*Max-Age=0$/);
  assert.equal(db.revocations.size, 1);

  const allCookie = await login();
  const logoutAll = await tailnetAuthResponse(request('/auth/logout-all', {
    method: 'POST', cookie: allCookie,
    headers: { ...serveHeaders(), origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' },
  }), config, { db, remoteAddress: '127.0.0.1', now: () => now });
  assert.equal(logoutAll.status, 303);
  assert.equal(db.epochs.get('tailnet:alice@example.com'), now);
});

test('Tailnet auth never carries an owner role; existing resolveActor retains exact review_roles grant authority', async () => {
  const external = tailnetIdentity(request('/', { headers: serveHeaders('external.shared@example.net') }), config, {
    remoteAddress: '127.0.0.1',
  });
  assert.deepEqual(Object.keys(external).sort(), ['id', 'login', 'name']);
  assert.equal('role' in external, false);
  // resolveActor is intentionally backed by the production-only DB adapter and
  // cannot be injected here without touching it. Assert its present exact-ID
  // query and no-role denial contract, rather than contacting a live database.
  const access = await readFile(new URL('../server/access.mjs', import.meta.url), 'utf8');
  assert.match(access, /SELECT role, disabled FROM review_roles WHERE user_id = \?/);
  assert.match(access, /if \(!role\) return null;/);
});

test('shared app verifier accepts only this tailnet app ID and denies the revoked copied session', async () => {
  const current = Date.now();
  const requestFor = (path, cookie) => new Request(config.REVIEW_PUBLIC_ORIGIN + path, {
    headers: { ...serveHeaders(), cookie: `webdev_app_session=${cookie}` },
  });
  const loginResponse = await tailnetAuthResponse(requestFor('/auth/login', ''), config, {
    remoteAddress: '127.0.0.1', now: () => current,
  });
  const cookie = issuedCookie(loginResponse);
  const db = new SessionFixtureDb();
  const requestWithCookie = requestFor('/', cookie);
  assert.equal(verifySession(cookie, config).id, 'tailnet:alice@example.com');
  assert.equal(verifySession(cookie, {MANUS_PROJECT_ID: 'original-preview', MANUS_JWT_SECRET: config.REVIEW_SESSION_SECRET}), null);
  assert.equal((await verifiedRequestUser(requestWithCookie, config, db, {now: () => current + 1000})).id, 'tailnet:alice@example.com');
  const logout = await tailnetAuthResponse(new Request(config.REVIEW_PUBLIC_ORIGIN + '/auth/logout', {
    method: 'POST', headers: { ...serveHeaders(), cookie: `webdev_app_session=${cookie}`, origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' },
  }), config, {db, remoteAddress: '127.0.0.1', now: () => current + 2000});
  assert.equal(logout.status, 303);
  assert.equal(await verifiedRequestUser(requestWithCookie, config, db, {now: () => current + 3000}), null);
});

test('actual private router binds each request to Serve identity and refuses a public listener before connecting to MySQL', async () => {
  const source = await readFile(new URL('../server/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /tailnetAuthResponse\(incoming, process\.env, \{ db: database\(\), remoteAddress: req\.socket\.remoteAddress \}\)/);
  assert.match(source, /sessionMatchesIdentity\(tailnetSessionCookie\(incoming\), process\.env, serveIdentity\)/);
  assert.match(source, /const visitorRead = !tailnetMode &&/);
  const result = spawnSync(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../', import.meta.url).pathname,
    env: {
      ...process.env,
      AUTH_PROVIDER: 'tailscale-serve',
      REVIEW_PUBLIC_ORIGIN: 'https://dragon.private.ts.net',
      REVIEW_BIND_HOST: '0.0.0.0',
      REVIEW_APP_ID: 'isolated-private-app',
      REVIEW_SESSION_SECRET: 'synthetic-unit-only-secret-with-more-than-32-chars',
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Private tailnet mode is not safely configured/);
  assert.doesNotMatch(result.stderr, /DATABASE_URL|GEMINI_API_KEY|QURAN_CLIENT_SECRET/);
});

test('an exact verified tailnet owner ID is accepted syntactically but cannot bind without an isolated database', () => {
  const result = spawnSync(process.execPath, ['scripts/bootstrap-review-owner.mjs'], {
    cwd: new URL('../', import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      AUTH_PROVIDER: 'tailscale-serve',
      REVIEW_BIND_HOST: '127.0.0.1',
      REVIEW_BOOTSTRAP_OWNER_ID: 'tailnet:alice+review@example.com',
      // Deliberately no DATABASE_URL: this test must never connect or write.
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Review database unavailable/);
  assert.doesNotMatch(result.stderr, /Set a verified REVIEW_BOOTSTRAP_OWNER_ID/);
});

console.log('Tailnet auth checks are deterministic, use synthetic HMAC cookies and an in-memory DB double, and do not contact Tailscale, MySQL, Preview, a browser, or vendor accounts.');
