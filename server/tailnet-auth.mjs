import { createHmac, timingSafeEqual } from 'node:crypto';
import { revokeAllSessions, revokeSession, SessionStoreError } from './session.mjs';

const COOKIE = 'webdev_app_session';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1_000;
const TOKEN_MAX = 8_000;
const USER_ID_MAX = 200;

// Tailscale Serve supplies an account login, not a stable opaque account ID. Keep
// the mapping deliberately narrow and deterministic so review_roles can grant an
// exact, separately administered ID without conflating it with a Manus identity.
const LOGIN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const TAILNET_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/;

function encoded(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function signature(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }

function fixedEqual(left, right) {
  const leftBytes = Buffer.from(left || '');
  const rightBytes = Buffer.from(right || '');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function validOpaque(value, max = USER_ID_MAX) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);
}

function tailnetOrigin(config) {
  const value = config?.REVIEW_PUBLIC_ORIGIN;
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  // Do not silently canonicalize a configured port, path, credentials, or case.
  // The operator must configure the one HTTPS Serve hostname that browsers use.
  if (value !== parsed.origin && value !== `${parsed.origin}/`) return null;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || !TAILNET_HOST.test(parsed.hostname)) return null;
  return parsed.origin;
}

function configured(config) {
  const origin = tailnetOrigin(config);
  if (!origin || config?.AUTH_PROVIDER !== 'tailscale-serve' || config?.REVIEW_BIND_HOST !== '127.0.0.1' ||
      !validOpaque(config?.REVIEW_APP_ID) || typeof config?.REVIEW_SESSION_SECRET !== 'string' ||
      config.REVIEW_SESSION_SECRET.length < 32 || config.REVIEW_SESSION_SECRET.length > 4_096) return null;
  return { origin, appId: config.REVIEW_APP_ID, secret: config.REVIEW_SESSION_SECRET };
}

function isLoopback(remoteAddress) {
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

function canonicalLogin(value) {
  // This explicitly excludes RFC2047 and all Unicode. Login is an authorization
  // key, so accepting a display-oriented encoding would create ambiguous grants.
  if (typeof value !== 'string' || value.length === 0 || value.length > USER_ID_MAX - 'tailnet:'.length ||
      !/^[\x21-\x7e]+$/.test(value) || !LOGIN.test(value)) return null;
  const login = value.toLowerCase();
  return `tailnet:${login}`.length <= USER_ID_MAX ? login : null;
}

function safeDisplayName(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 150) return '';
  // RFC2047 syntax is ASCII transport encoding, but it can decode to Unicode.
  // Do not decode it and do not persist a fallback/guessed display name.
  if (value.includes('=?') || value.includes('?=') || !/^[\x20-\x7e]+$/.test(value)) return '';
  return value;
}

function validIdentity(identity) {
  const login = canonicalLogin(identity?.login);
  if (!login || identity.id !== `tailnet:${login}`) return null;
  return { id: identity.id, login, name: safeDisplayName(identity.name) };
}

function cookieValue(request) {
  const raw = request?.headers?.get?.('cookie') || '';
  let value = null;
  for (const part of raw.split(';')) {
    const at = part.indexOf('=');
    if (at < 1 || part.slice(0, at).trim() !== COOKIE) continue;
    // Ambiguous duplicate cookies fail closed instead of selecting an attacker-
    // controlled ordering. JWTs are base64url and never need percent decoding.
    if (value !== null) return null;
    value = part.slice(at + 1).trim();
  }
  return value && value.length <= TOKEN_MAX ? value : null;
}
export function tailnetSessionCookie(request) { return cookieValue(request); }

function sessionDetails(token, config, nowMs = Date.now()) {
  const settings = configured(config);
  if (!settings || typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || (header.typ && header.typ !== 'JWT')) return null;
    if (!fixedEqual(parts[2], signature(`${parts[0]}.${parts[1]}`, settings.secret))) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(nowMs / 1_000);
    if (claims.appId !== settings.appId || typeof claims.openId !== 'string' || claims.openId.length > USER_ID_MAX ||
        typeof claims.name !== 'string' || claims.name.length > 150 || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= nowSeconds || claims.exp > Number.MAX_SAFE_INTEGER / 1_000 || !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > nowSeconds + 60 ||
        !Number.isSafeInteger(claims.ddIat) || claims.ddIat < 0 || claims.ddIat > nowMs + 60_000) return null;
    const issuedAt = claims.ddIat;
    if (claims.exp * 1_000 - issuedAt > SESSION_MAX_AGE_MS + 60_000) return null;
    return {
      token,
      user: { id: claims.openId, name: safeDisplayName(claims.name) },
      issuedAt,
      expiresAt: claims.exp * 1_000,
    };
  } catch { return null; }
}

function currentTime(now) {
  const value = typeof now === 'function' ? now() : now;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function failure(status, text) {
  return new Response(text, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function applicationCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function signedOutResponse() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/signed-out', 'Cache-Control': 'no-store', 'Set-Cookie': applicationCookie('', 0) },
  });
}

function requestUsesOrigin(request, origin) {
  try { return new URL(request.url).origin === origin; } catch { return false; }
}

function sameOriginPost(request, origin) {
  return requestUsesOrigin(request, origin) && request.headers.get('origin') === origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site';
}

/**
 * Return the verified Serve identity only when this is explicitly configured as
 * a localhost-only Tailscale Serve deployment. No forwarded-address or account
 * header is consulted outside this mode.
 */
export function tailnetIdentity(request, config, { remoteAddress } = {}) {
  if (!configured(config) || !isLoopback(remoteAddress)) return null;
  const login = canonicalLogin(request?.headers?.get?.('tailscale-user-login'));
  if (!login) return null; // Funnel, a tagged device, and direct callers all land here.
  return {
    id: `tailnet:${login}`,
    login,
    name: safeDisplayName(request.headers.get('tailscale-user-name')),
  };
}

/**
 * Check an 8-hour Tailnet-auth cookie against the current verified Serve
 * identity. The optional fourth argument exists solely for deterministic tests.
 */
export function sessionMatchesIdentity(cookie, config, identity, { now = Date.now } = {}) {
  const checkedIdentity = validIdentity(identity);
  const nowMs = currentTime(now);
  if (!checkedIdentity || nowMs === null) return false;
  const details = sessionDetails(cookie, config, nowMs);
  return !!details && details.user.id === checkedIdentity.id;
}

/**
 * Handles local Tailscale Serve sign-in and same-origin, identity-bound logout.
 * Authorization remains in resolveActor/review_roles: this module never turns a
 * login string into an owner grant or a display-name based invitation.
 */
export async function tailnetAuthResponse(request, config, { db = null, remoteAddress, now = Date.now } = {}) {
  const settings = configured(config);
  if (!settings) return failure(503, 'Authentication is unavailable.');

  let path;
  try { path = new URL(request.url).pathname; } catch { return failure(404, 'Not found'); }
  if (path === '/auth/callback') return failure(404, 'Not found');
  if (path !== '/auth/login' && path !== '/auth/logout' && path !== '/auth/logout-all') return failure(404, 'Not found');

  if (path === '/auth/login') {
    if (request.method !== 'GET') return failure(405, 'Method not allowed');
    if (!requestUsesOrigin(request, settings.origin)) return failure(403, 'Request denied.');
    const identity = tailnetIdentity(request, config, { remoteAddress });
    if (!identity) return failure(401, 'Authentication required.');
    const issuedAt = currentTime(now);
    if (issuedAt === null) return failure(503, 'Authentication is unavailable.');
    const issuedSeconds = Math.floor(issuedAt / 1_000);
    const header = encoded({ alg: 'HS256', typ: 'JWT' });
    const payload = encoded({
      appId: settings.appId,
      openId: identity.id,
      name: identity.name,
      iat: issuedSeconds,
      ddIat: issuedAt,
      exp: issuedSeconds + SESSION_MAX_AGE_SECONDS,
    });
    const token = `${header}.${payload}.${signature(`${header}.${payload}`, settings.secret)}`;
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Cache-Control': 'no-store', 'Set-Cookie': applicationCookie(token, SESSION_MAX_AGE_SECONDS) },
    });
  }

  if (request.method !== 'POST') return failure(405, 'Method not allowed');
  if (!sameOriginPost(request, settings.origin)) return failure(403, 'Request denied.');
  const identity = tailnetIdentity(request, config, { remoteAddress });
  if (!identity) return failure(401, 'Authentication required.');
  const nowMs = currentTime(now);
  if (nowMs === null) return failure(503, 'Authentication is unavailable.');
  const details = sessionDetails(cookieValue(request), config, nowMs);
  if (!details) return signedOutResponse();
  // A stolen/copied cookie cannot be used by a different currently verified
  // Tailscale identity to revoke the original user's current sessions.
  if (details.user.id !== identity.id) return failure(403, 'Request denied.');
  if (!db) return failure(503, 'Authentication is unavailable.');

  try {
    if (path === '/auth/logout-all') await revokeAllSessions(db, details.user.id, { now: nowMs });
    else await revokeSession(db, {
      token: details.token,
      userId: details.user.id,
      expiresAt: details.expiresAt,
    }, { now: nowMs });
    return signedOutResponse();
  } catch (error) {
    if (error instanceof SessionStoreError) return failure(503, 'Authentication is unavailable.');
    return failure(503, 'Authentication is unavailable.');
  }
}
