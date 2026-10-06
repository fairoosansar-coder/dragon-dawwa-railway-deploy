import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { authResponse, verifiedRequestUser } from '../server/auth.mjs';
import { assertLastActiveOwnerProtected } from '../server/session.mjs';

const now = Date.now();
const config = {
  MANUS_JWT_SECRET: 'synthetic-session-signing-key',
  MANUS_PROJECT_ID: 'review-project-fixture',
  MANUS_OAUTH_PORTAL_URL: 'https://accounts.fixture.test',
  MANUS_OAUTH_API_URL: 'https://api.fixture.test',
  REVIEW_PUBLIC_ORIGIN: 'https://review.fixture.test',
};

function encoded(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function token({ id = 'owner-fixture', issuedAt = now - 2_000, expiresAt = now + 60_000, preview = false } = {}) {
  const header = encoded({ alg: 'HS256', typ: 'JWT' });
  const payload = encoded({
    appId: config.MANUS_PROJECT_ID,
    openId: id,
    name: 'Synthetic owner',
    iat: Math.floor(issuedAt / 1_000),
    ...(preview ? {} : { ddIat: issuedAt }),
    exp: Math.floor(expiresAt / 1_000),
  });
  const signature = createHmac('sha256', config.MANUS_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

class SessionFixtureDb {
  constructor() {
    this.revocations = new Map();
    this.epochs = new Map();
    this.roles = new Map([['owner-fixture', {role: 'owner', disabled: 0}]]);
  }
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        if (sql.startsWith('SELECT token_hash FROM review_session_revocations')) {
          const row = this.db.revocations.get(values[0]);
          return row && row.expiresAt > values[1] ? { token_hash: values[0] } : null;
        }
        if (sql.startsWith('SELECT revoked_after FROM review_session_epochs')) {
          const revokedAfter = this.db.epochs.get(values[0]);
          return revokedAfter === undefined ? null : { revoked_after: revokedAfter };
        }
        if (sql.startsWith('SELECT role,disabled FROM review_roles')) return this.db.roles.get(values[0]) || null;
        if (sql.startsWith('SELECT COUNT(*) AS count FROM review_roles')) {
          return {count: [...this.db.roles.values()].filter(row => row.role === 'owner' && !row.disabled).length};
        }
        throw new Error(`Unhandled first query: ${sql}`);
      },
      async run() {
        if (sql.startsWith('DELETE FROM review_session_revocations')) {
          let count = 0;
          for (const [hash, row] of this.db.revocations) if (row.expiresAt <= values[0]) { this.db.revocations.delete(hash); count++; }
          return { meta: { changes: count } };
        }
        if (sql.startsWith('INSERT INTO review_session_revocations')) {
          const [hash, userId, expiresAt] = values;
          const prior = this.db.revocations.get(hash);
          this.db.revocations.set(hash, { userId, expiresAt: Math.max(prior?.expiresAt || 0, expiresAt) });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO review_session_epochs')) {
          const [userId, revokedAfter] = values;
          this.db.epochs.set(userId, Math.max(this.db.epochs.get(userId) || 0, revokedAfter));
          return { meta: { changes: 1 } };
        }
        throw new Error(`Unhandled run query: ${sql}`);
      },
      db: this,
    };
    return statement;
  }
}

function request(path, session, headers = {}) {
  return new Request(`https://review.fixture.test${path}`, {
    method: headers.method || 'GET',
    headers: { cookie: `webdev_app_session=${session}`, ...headers },
  });
}

test('an existing signed Preview owner cookie remains valid before revocation', async () => {
  const db = new SessionFixtureDb();
  const previewCookie = token({ preview: true });
  const user = await verifiedRequestUser(request('/', previewCookie), config, db, { now: () => now });
  assert.deepEqual(user, { id: 'owner-fixture', name: 'Synthetic owner' });
});

test('POST logout blacklists the copied token persistently', async () => {
  const db = new SessionFixtureDb();
  const copiedToken = token();
  const logout = await authResponse(request('/auth/logout', copiedToken, {
    method: 'POST', origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin',
  }), config, { db, now: () => now });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get('location'), '/signed-out');
  assert.equal(await verifiedRequestUser(request('/', copiedToken), config, db, { now: () => now }), null);
});

test('GET logout and cross-site POST logout are denied without revocation', async () => {
  const db = new SessionFixtureDb();
  const active = token();
  const get = await authResponse(request('/auth/logout', active), config, { db, now: () => now });
  assert.equal(get.status, 405);
  const crossSite = await authResponse(request('/auth/logout', active, {
    method: 'POST', origin: 'https://attacker.fixture.test', 'sec-fetch-site': 'cross-site',
  }), config, { db, now: () => now });
  assert.equal(crossSite.status, 403);
  const noOrigin = await authResponse(request('/auth/logout', active, {
    method: 'POST', 'sec-fetch-site': 'same-origin',
  }), config, { db, now: () => now });
  assert.equal(noOrigin.status, 403);
  assert.notEqual(await verifiedRequestUser(request('/', active), config, db, { now: () => now }), null);
});

test('logout-all invalidates every older token for one account only', async () => {
  const db = new SessionFixtureDb();
  const first = token({ issuedAt: now - 5_000 });
  const second = token({ issuedAt: now - 2_000 });
  const otherUser = token({ id: 'reader-fixture', issuedAt: now - 2_000 });
  const logout = await authResponse(request('/auth/logout-all', first, {
    method: 'POST', origin: config.REVIEW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin',
  }), config, { db, now: () => now });
  assert.equal(logout.status, 303);
  assert.equal(await verifiedRequestUser(request('/', first), config, db, { now: () => now }), null);
  assert.equal(await verifiedRequestUser(request('/', second), config, db, { now: () => now }), null);
  assert.equal((await verifiedRequestUser(request('/', otherUser), config, db, { now: () => now }))?.id, 'reader-fixture');
});

test('last active owner is protected before a role removal or suspension', async () => {
  const db = new SessionFixtureDb();
  await assert.rejects(() => assertLastActiveOwnerProtected(db, 'owner-fixture', {nextRole: 'reader', disabled: true}), error => error?.code === 'last_owner_protected');
  db.roles.set('second-owner-fixture', {role: 'owner', disabled: 0});
  await assert.doesNotReject(() => assertLastActiveOwnerProtected(db, 'owner-fixture', {nextRole: 'reader', disabled: true}));
});

console.log('Auth revocation checks use synthetic HMAC cookies and an in-memory session-store double. They do not call Manus OAuth, MySQL, Preview, or a browser.');
