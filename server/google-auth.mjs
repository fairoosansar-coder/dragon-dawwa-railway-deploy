// Railway HTTPS browser authentication. Only a verified Google subject with an
// existing database role receives an application session; no email auto-invites.
import * as oidc from 'openid-client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ISSUER = 'https://accounts.google.com';
const PROJECT = '786918bd-4ce1-4075-b763-93c7c6f729a1';
const ENVIRONMENT = '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66';
const FLOW_COOKIE = '__Host-dd_oidc_flow';
const SESSION_COOKIE = 'webdev_app_session';
const FLOW_MS = 10 * 60 * 1000;
const SESSION_SECONDS = 8 * 60 * 60;
const ROLES = new Set(['owner', 'reader', 'author', 'reviewer', 'publisher']);
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.railway\.app$/;
const OWNER_APEX = 'dragondawwa.org';
let cachedClient;
let cachedKey;
let cachedAt = 0;

export function googleModeConfig(env = process.env) {
  const value = env.REVIEW_PUBLIC_ORIGIN || '';
  let url;
  try { url = new URL(value); } catch { throw new Error('Google HTTPS review mode is not safely configured.'); }
  // An owner-login pilot must not depend on a separate Quran Foundation account.
  // Both absent means the existing /api/quran/* client returns 503 not_configured;
  // a partially provisioned pair is never accepted as working provider access.
  const quranClientPair = Boolean(env.QURAN_CLIENT_ID) === Boolean(env.QURAN_CLIENT_SECRET);
  if (env.AUTH_PROVIDER !== 'google-oidc' || env.RAILWAY_PROJECT_ID !== PROJECT ||
      env.RAILWAY_ENVIRONMENT_ID !== ENVIRONMENT || env.REVIEW_DB_TRANSPORT !== 'railway-internal-wireguard' ||
      env.REVIEW_DB_ROLE !== 'app' || env.REVIEW_BIND_HOST !== '0.0.0.0' ||
      env.MANUS_WEBDEV_PROJECT_ID || env.MANUS_ADDON_PREVIEW_PUBLIC_ORIGIN || env.MANUS_ADDON_RUNTIME_PUBLIC_ORIGIN ||
      env.DD_PUBLIC_READ_MODE || env.EDITORIAL_OWNER_ID || env.REVIEW_OWNER_ID ||
      url.protocol !== 'https:' || !(DOMAIN.test(url.hostname) || url.hostname === OWNER_APEX) ||
      url.port || url.username || url.password ||
      value !== url.origin || env.GOOGLE_OIDC_ISSUER !== ISSUER ||
      typeof env.GOOGLE_OIDC_CLIENT_ID !== 'string' || !env.GOOGLE_OIDC_CLIENT_ID || env.GOOGLE_OIDC_CLIENT_ID.length > 512 ||
      typeof env.GOOGLE_OIDC_CLIENT_SECRET !== 'string' || env.GOOGLE_OIDC_CLIENT_SECRET.length < 16 || env.GOOGLE_OIDC_CLIENT_SECRET.length > 4096 ||
      typeof env.REVIEW_APP_ID !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(env.REVIEW_APP_ID) ||
      typeof env.REVIEW_SESSION_SECRET !== 'string' || env.REVIEW_SESSION_SECRET.length < 32 || env.REVIEW_SESSION_SECRET.length > 4096 ||
      typeof env.DD_DELETION_AUDIT_SECRET !== 'string' || env.DD_DELETION_AUDIT_SECRET.length < 32 ||
      typeof env.STUDY_USAGE_SECRET !== 'string' || env.STUDY_USAGE_SECRET.length < 32 ||
      !quranClientPair ||
      env.QURAN_ENVIRONMENT !== 'production')
    throw new Error('Google HTTPS review mode is not safely configured.');
  return { origin: url.origin, appId: env.REVIEW_APP_ID, secret: env.REVIEW_SESSION_SECRET,
    clientId: env.GOOGLE_OIDC_CLIENT_ID, clientSecret: env.GOOGLE_OIDC_CLIENT_SECRET };
}

export function canonicalGoogleHost(host, origin) {
  return typeof host === 'string' && host === new URL(origin).host;
}

function cookie(name, value, seconds, path = '/') {
  return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function cookieValue(request, name) {
  let result = null;
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1 || part.slice(0, index).trim() !== name) continue;
    if (result !== null) return null; // ambiguous duplicate cookies fail closed
    result = part.slice(index + 1).trim();
  }
  return result && result.length <= 3072 ? result : null;
}
function key(secret) { return createHash('sha256').update('dd-google-oidc-flow-v1\0').update(secret).digest(); }
function seal(data, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}
function unseal(raw, secret) {
  if (!raw || raw.length > 3072) return null;
  const parts = raw.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8'));
  } catch { return null; }
}
function flowHeader(value, seconds = 0) { return cookie(FLOW_COOKIE, value, seconds); }
function reply(message, status = 503, extra = {}) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}
function clearFlow(response) { response.headers.append('Set-Cookie', flowHeader('')); return response; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
export function googleSubjectId(sub) {
  if (typeof sub !== 'string' || sub.length < 1 || sub.length > 255) return null;
  return 'google:' + createHash('sha256').update(ISSUER).update('\0').update(sub).digest('base64url');
}
function uninvitedResponse(id) {
  const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitation required · Dragon Dawwa</title></head><body><main style="font:1.1rem system-ui;max-width:42rem;margin:8vh auto;padding:1.5rem;color:#173f35"><h1>Invitation required</h1><p>Your identity was verified, but this account has not been invited. No application session was created. Give this non-secret account reference to the owner through a private channel:</p><p><code style="overflow-wrap:anywhere">${escapeHtml(id)}</code></p><p><a href="/login">Back to sign in</a></p></main></body></html>`;
  return new Response(content, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export function publicLoginPage() {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private sign in · Dragon Dawwa</title></head><body><main style="font:1.1rem system-ui;max-width:42rem;margin:8vh auto;padding:1.5rem;color:#173f35"><p>DRAGON DAWWA</p><h1>Private member sign in</h1><p>Only people invited by the owner can open the learning area. This login page is available on the internet; the study library, account details and all application data are not public.</p><p><a href="/auth/login" style="display:inline-block;background:#165345;color:#fff;padding:.8rem 1.2rem;border-radius:.4rem">Continue with Google</a></p><p>Use the Google account whose reference the owner invited. A Google login by itself does not grant access.</p><p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></main></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export function publicExitPage(recovery = false) {
  const text = recovery ? 'Ask the owner to restore your invitation or recover your Google account with Google. Dragon Dawwa cannot reset Google credentials.' : 'Your Dragon Dawwa session ended. Your separate Google session may remain signed in; sign out of Google too on a shared device.';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${recovery ? 'Account help' : 'Signed out'} · Dragon Dawwa</title></head><body><main style="font:1.1rem system-ui;max-width:42rem;margin:8vh auto;padding:1.5rem;color:#173f35"><h1>${recovery ? 'Account help' : 'Signed out'}</h1><p>${text}</p><p><a href="/login">Return to sign in</a></p></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function clientFor(settings, library, discover) {
  if (discover) return discover(settings);
  const cacheKey = `${settings.clientId}\0${settings.clientSecret}`;
  if (cachedClient && cacheKey === cachedKey && Date.now() - cachedAt < 10 * 60_000) return cachedClient;
  // HTTPS-only discovery and JWT signature validation are provided by the
  // maintained openid-client library; never accept the browser's ID claims.
  const config = await library.discovery(new URL(ISSUER), settings.clientId, settings.clientSecret, undefined, {
    execute: [library.enableNonRepudiationChecks],
    [library.customFetch]: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });
  cachedClient = config; cachedKey = cacheKey; cachedAt = Date.now();
  return config;
}

/** Dependency injection of the OIDC network call supports offline denial tests. */
export async function googleAuthResponse(request, env = process.env, { db, now = Date.now, library = oidc, discover } = {}) {
  let settings;
  try { settings = googleModeConfig(env); } catch { return reply('Sign-in is not configured.', 503); }
  let url;
  try { url = new URL(request.url); } catch { return reply('Not found.', 404); }
  if (url.origin !== settings.origin) return reply('Request denied.', 403);
  if (url.pathname === '/auth/login') {
    if (request.method !== 'GET') return reply('Method not allowed.', 405);
    try {
      const state = library.randomState();
      const nonce = library.randomNonce();
      const verifier = library.randomPKCECodeVerifier();
      const challenge = await library.calculatePKCECodeChallenge(verifier);
      const client = await clientFor(settings, library, discover);
      const redirect = library.buildAuthorizationUrl(client, {
        response_type: 'code', redirect_uri: settings.origin + '/auth/callback', scope: 'openid email profile',
        state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
      });
      if (redirect.protocol !== 'https:' || redirect.hostname !== 'accounts.google.com') return reply('Sign-in is unavailable.', 503);
      const issuedAt = now();
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) return reply('Sign-in is unavailable.', 503);
      return new Response(null, { status: 302, headers: { Location: redirect.href, 'Cache-Control': 'no-store',
        'Set-Cookie': flowHeader(seal({ state, nonce, verifier, issuedAt }, settings.secret), 600) } });
    } catch { return reply('Sign-in is temporarily unavailable.', 503); }
  }
  if (url.pathname !== '/auth/callback') return reply('Not found.', 404);
  if (request.method !== 'GET') return reply('Method not allowed.', 405);
  const flow = unseal(cookieValue(request, FLOW_COOKIE), settings.secret);
  const elapsed = now() - flow?.issuedAt;
  if (!flow || !Number.isSafeInteger(flow.issuedAt) || elapsed < 0 || elapsed > FLOW_MS ||
      typeof flow.state !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(flow.state) ||
      typeof flow.nonce !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(flow.nonce) ||
      typeof flow.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(flow.verifier) ||
      url.searchParams.get('state') !== flow.state || url.searchParams.getAll('state').length !== 1 ||
      url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code') || url.searchParams.get('code').length > 2048 ||
      url.searchParams.has('error') || url.search.length > 4096)
    return clearFlow(reply('Sign-in could not be verified. Please try again.', 400));
  if (!db?.prepare) return clearFlow(reply('Sign-in is temporarily unavailable.', 503));
  try {
    const client = await clientFor(settings, library, discover);
    const tokens = await library.authorizationCodeGrant(client, url, {
      expectedState: flow.state, expectedNonce: flow.nonce, pkceCodeVerifier: flow.verifier, idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || (claims.iss !== ISSUER && claims.iss !== 'accounts.google.com') ||
        !googleSubjectId(claims.sub) || claims.email_verified !== true ||
        typeof claims.email !== 'string' || claims.email.length > 320)
      return clearFlow(reply('Identity could not be verified.', 401));
    const id = googleSubjectId(claims.sub);
    const row = await db.prepare('SELECT role,disabled FROM review_roles WHERE user_id=?').bind(id).first();
    if (!row || Number(row.disabled) || !ROLES.has(row.role)) return clearFlow(uninvitedResponse(id));
    const issuedAt = now();
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) return clearFlow(reply('Sign-in is temporarily unavailable.', 503));
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ appId: settings.appId, openId: id,
      name: typeof claims.name === 'string' ? claims.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 150) : '',
      iat: Math.floor(issuedAt / 1000), ddIat: issuedAt, exp: Math.floor(issuedAt / 1000) + SESSION_SECONDS })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const token = `${signingInput}.${createHmac('sha256', settings.secret).update(signingInput).digest('base64url')}`;
    const response = new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', flowHeader(''));
    response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_SECONDS));
    return response;
  } catch { return clearFlow(reply('Sign-in is temporarily unavailable.', 503)); }
}
