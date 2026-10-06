import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSessionActive, revokeAllSessions, revokeSession, SessionStoreError } from './session.mjs';

const COOKIE = 'webdev_app_session';
const NONCE_COOKIE = 'dd_oauth_nonce';

function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => {
    const at = part.indexOf('=');
    return at < 0 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
  }).filter(([key]) => key));
}
function applicationSession(request, config) {
  if (config.AUTH_PROVIDER !== 'google-oidc') return cookies(request)[COOKIE];
  let found = false, result = null;
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== COOKIE) continue;
    if (found) return null;
    found = true;
    result = part.slice(at + 1).trim();
  }
  return result;
}

function encoded(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function signature(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }
function verificationKeys(config) {
  if (config.AUTH_PROVIDER === 'tailscale-serve' || config.AUTH_PROVIDER === 'google-oidc')
    return { appId: config.REVIEW_APP_ID, secret: config.REVIEW_SESSION_SECRET };
  return { appId: config.MANUS_PROJECT_ID, secret: config.MANUS_JWT_SECRET };
}

export function verifySession(token, config) {
  return sessionDetails(token, config)?.user || null;
}

function sessionDetails(token, config, nowMs = Date.now()) {
  const { appId, secret } = verificationKeys(config);
  if (!token || !secret || !appId || token.length > 8000) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || (header.typ && header.typ !== 'JWT')) return null;
    const expected = Buffer.from(signature(parts[0] + '.' + parts[1], secret));
    const actual = Buffer.from(parts[2]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const now = Math.floor(nowMs / 1000);
    if (claims.appId !== appId || typeof claims.openId !== 'string' || !claims.openId || claims.openId.length > 200 ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > Number.MAX_SAFE_INTEGER / 1000 ||
        (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > now + 60)) ||
        (claims.ddIat !== undefined && (!Number.isSafeInteger(claims.ddIat) || claims.ddIat < 0 || claims.ddIat > nowMs + 60_000))) return null;
    const issuedAt = claims.ddIat === undefined ? (Number.isSafeInteger(claims.iat) ? claims.iat * 1000 : 0) : claims.ddIat;
    return {
      user: { id: claims.openId, name: typeof claims.name === 'string' ? claims.name.slice(0, 150) : '' },
      token,
      issuedAt,
      expiresAt: claims.exp * 1000,
    };
  } catch { return null; }
}

export function requestUser(request, config) {
  return verifySession(applicationSession(request, config), config);
}

/**
 * Persistent revocation-aware session verification. Pass the review DB on
 * every protected request; database failures deliberately fail closed.
 */
export async function verifiedRequestUser(request, config, db, { now = Date.now } = {}) {
  const details = sessionDetails(applicationSession(request, config), config, now());
  if (!details) return null;
  const active = await isSessionActive(db, {
    token: details.token,
    userId: details.user.id,
    issuedAt: details.issuedAt,
    expiresAt: details.expiresAt,
  }, { now: now() });
  return active ? details.user : null;
}

function applicationCookie(origin, name, value, maxAge, config = {}) {
  const local = origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:');
  const firstParty = config.AUTH_PROVIDER === 'google-oidc';
  return `${name}=${value}; Path=/; HttpOnly; ${local || firstParty ? 'SameSite=Lax' : 'SameSite=None'}${local ? '' : '; Secure'}; Max-Age=${maxAge}`;
}

function publicOrigin(config) {
  const origin = config.REVIEW_PUBLIC_ORIGIN;
  if (!origin || !URL.canParse(origin)) return null;
  const parsed = new URL(origin);
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
      !['https:', 'http:'].includes(parsed.protocol) ||
      (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname))) return null;
  return parsed.origin;
}

function redirect(location, headers = {}) { return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } }); }
function failure(message, status) { return new Response(message, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } }); }

export function logoutFormToken(request, config) {
  if (config.AUTH_PROVIDER !== 'google-oidc') return null;
  const token = applicationSession(request, config);
  if (!sessionDetails(token, config)) return null;
  return createHmac('sha256', config.REVIEW_SESSION_SECRET)
    .update('dragon-dawwa-logout-form-v1\0').update(token).digest('base64url');
}

async function validLogoutFormProof(request, config) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded') ||
      Number(request.headers.get('content-length') || 0) > 2048) return false;
  const text = await request.text();
  if (text.length > 2048) return false;
  const values = new URLSearchParams(text).getAll('logout_csrf');
  const expected = logoutFormToken(request, config);
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0]) || !expected) return false;
  return timingSafeEqual(Buffer.from(values[0]), Buffer.from(expected));
}

async function sameOriginPost(request, origin, previewProxyOrigin, config) {
  const supplied = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const previewRewritten = previewProxyOrigin && supplied === previewProxyOrigin && fetchSite === 'same-origin';
  if (fetchSite === 'cross-site') return false;
  if (supplied === origin || previewRewritten) return true;
  // Some first-party browser form navigations arrive at Railway with Origin:
  // null. Fetch Metadata alone is insufficient: require a proof bound to this
  // exact HttpOnly session, delivered only by the protected session endpoint.
  if (config.AUTH_PROVIDER !== 'google-oidc' || ![null, 'null'].includes(supplied) ||
      fetchSite !== 'same-origin' || request.headers.get('sec-fetch-mode') !== 'navigate') return false;
  return validLogoutFormProof(request, config);
}

function signedOutResponse(origin, config) {
  const headers = new Headers({ Location: '/signed-out', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', applicationCookie(origin, COOKIE, '', 0, config));
  headers.append('Set-Cookie', applicationCookie(origin, NONCE_COOKIE, '', 0, config));
  return new Response(null, { status: 303, headers });
}

/**
 * Handles OAuth GET routes plus POST-only, same-origin logout routes. For
 * logout pass `{ db, previewProxyOrigin }`; the parent router provides the
 * exact local Preview origin only after Fetch Metadata has proved same-origin.
 */
export async function authResponse(request, config, { db = null, previewProxyOrigin = null, now = Date.now } = {}) {
  const path = new URL(request.url).pathname;
  const origin = publicOrigin(config);
  const googleMode = config.AUTH_PROVIDER === 'google-oidc';
  if (!origin || (googleMode ? !config.REVIEW_APP_ID || !config.REVIEW_SESSION_SECRET : !config.MANUS_PROJECT_ID || !config.MANUS_JWT_SECRET))
    return failure('Sign-in is not configured for this review environment.', 503);
  if (path === '/auth/logout' || path === '/auth/logout-all') {
    if (request.method !== 'POST') return failure('Method not allowed', 405);
    if (!await sameOriginPost(request, origin, googleMode ? null : previewProxyOrigin, config)) return failure('Same-origin request required.', 403);
    const details = sessionDetails(applicationSession(request, config), config, now());
    if (!details || details.expiresAt <= now()) return signedOutResponse(origin, config);
    if (!db) return failure('Session logout is temporarily unavailable. Please retry.', 503);
    try {
      if (path === '/auth/logout-all') await revokeAllSessions(db, details.user.id, { now: now() });
      else await revokeSession(db, { token: details.token, userId: details.user.id, expiresAt: details.expiresAt }, { now: now() });
      return signedOutResponse(origin, config);
    } catch (error) {
      if (error instanceof SessionStoreError) return failure('Session logout is temporarily unavailable. Please retry.', 503);
      return failure('Session logout is temporarily unavailable. Please retry.', 503);
    }
  }
  if (googleMode) return failure('Not found', 404);
  if (!config.MANUS_OAUTH_PORTAL_URL || !config.MANUS_OAUTH_API_URL)
    return failure('Sign-in is not configured for this review environment.', 503);
  if (path === '/auth/login') {
    if (request.method !== 'GET') return failure('Method not allowed', 405);
    const nonce = randomBytes(32).toString('base64url');
    const redirectUri = origin + '/auth/callback';
    const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64');
    const portal = new URL(config.MANUS_OAUTH_PORTAL_URL.replace(/\/+$/, '') + '/app-auth');
    portal.searchParams.set('appId', config.MANUS_PROJECT_ID);
    portal.searchParams.set('redirectUri', redirectUri);
    portal.searchParams.set('state', state);
    portal.searchParams.set('responseType', 'code');
    return redirect(portal.href, { 'Set-Cookie': applicationCookie(origin, NONCE_COOKIE, nonce, 600) });
  }
  if (path !== '/auth/callback') return failure('Not found', 404);
  if (request.method !== 'GET') return failure('Method not allowed', 405);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const supplied = url.searchParams.get('state');
  const expectedNonce = cookies(request)[NONCE_COOKIE];
  let state;
  try { state = JSON.parse(Buffer.from(supplied || '', 'base64').toString('utf8')); } catch { return failure('Sign-in state is invalid. Please try again.', 400); }
  if (!code || code.length > 2048 || !expectedNonce || !/^[A-Za-z0-9_-]{43}$/.test(expectedNonce) ||
      state.nonce !== expectedNonce || state.redirectUri !== origin + '/auth/callback') return failure('Sign-in state is invalid. Please try again.', 400);
  try {
    const api = config.MANUS_OAUTH_API_URL.replace(/\/+$/, '');
    const tokenResult = await fetch(api + '/webdev.v1.WebDevAuthPublicService/ExchangeToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ clientId: config.MANUS_PROJECT_ID, grantType: 'authorization_code', code, redirectUri: state.redirectUri }),
    });
    if (!tokenResult.ok) return failure('Sign-in could not be completed. Please retry.', 401);
    const token = await tokenResult.json();
    if (typeof token.accessToken !== 'string' || !token.accessToken) return failure('Sign-in could not be completed. Please retry.', 401);
    const identityResult = await fetch(api + '/webdev.v1.WebDevAuthPublicService/GetUserInfo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ accessToken: token.accessToken }),
    });
    if (!identityResult.ok) return failure('Identity could not be verified. Please retry.', 401);
    const identity = await identityResult.json();
    if (typeof identity.openId !== 'string' || !identity.openId || identity.openId.length > 200) return failure('Identity could not be verified. Please retry.', 401);
    const issuedAt = now();
    const nowSeconds = Math.floor(issuedAt / 1000);
    const head = encoded({ alg: 'HS256', typ: 'JWT' });
    const payload = encoded({ appId: config.MANUS_PROJECT_ID, openId: identity.openId, name: identity.name || '', iat: nowSeconds, ddIat: issuedAt, exp: nowSeconds + 8 * 3600 });
    const signed = `${head}.${payload}.${signature(`${head}.${payload}`, config.MANUS_JWT_SECRET)}`;
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', applicationCookie(origin, NONCE_COOKIE, '', 0));
    headers.append('Set-Cookie', applicationCookie(origin, COOKIE, signed, 8 * 3600));
    return new Response(null, { status: 302, headers });
  } catch {
    return failure('Sign-in is temporarily unavailable. Please retry.', 503);
  }
}
