import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifiedRequestUser, authResponse } from './auth.mjs';
import { tailnetAuthResponse, tailnetIdentity, tailnetSessionCookie, sessionMatchesIdentity } from './tailnet-auth.mjs';
import { googleAuthResponse, googleModeConfig, canonicalGoogleHost, publicLoginPage, publicExitPage } from './google-auth.mjs';
import { publicPolicyPage } from './public-policies.mjs';
import { database, verifySchema } from './db.mjs';
import { resolveActor, accessResponse } from './access.mjs';
import { memberResponse } from './member.mjs';
import { manageResponse, validateSafeSetting } from './manage.mjs';
import { studyResponse, configUsageLimits } from './study.mjs';
import { GEMINI_LIMITS } from './gemini-study.mjs';
import { publicReadingAllowed } from './public-read.mjs';
import { quranResponse } from '../lib/quran.mjs';
import { editorialResponse } from '../lib/editorial.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const tailnetMode = process.env.AUTH_PROVIDER === 'tailscale-serve';
const googleMode = process.env.AUTH_PROVIDER === 'google-oidc';
if (tailnetMode && (process.env.REVIEW_BIND_HOST !== '127.0.0.1' ||
    !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(process.env.REVIEW_PUBLIC_ORIGIN || '') ||
    !process.env.REVIEW_APP_ID || (process.env.REVIEW_SESSION_SECRET || '').length < 32 ||
    process.env.EDITORIAL_OWNER_ID || process.env.REVIEW_OWNER_ID || process.env.DD_PUBLIC_READ_MODE))
  throw new Error('Private tailnet mode is not safely configured.');
if (googleMode) googleModeConfig(process.env);
if (process.env.REVIEW_DB_TRANSPORT === 'railway-internal-wireguard' && process.env.REVIEW_DB_ROLE !== 'app')
  throw new Error('Railway web service requires the non-DDL app database role.');
const origin = process.env.REVIEW_PUBLIC_ORIGIN || 'http://127.0.0.1:3000';
const port = Number(process.env.PORT || 3000);
const pages = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/quran', 'quran.html'], ['/quran.html', 'quran.html'],
  ['/study', 'study.html'], ['/study.html', 'study.html'],
  ['/research', 'research.html'], ['/research.html', 'research.html'],
  ['/mosques', 'mosques.html'], ['/mosques.html', 'mosques.html'],
  ['/learn', 'library.html'], ['/library', 'library.html'], ['/library.html', 'library.html'],
  ['/resources', 'resources.html'], ['/resources.html', 'resources.html'],
  ['/member', 'member.html'], ['/member.html', 'member.html'],
  ['/staff', 'staff.html'], ['/staff.html', 'staff.html'],
  ['/admin', 'admin.html'], ['/admin.html', 'admin.html'],
  ['/operations', 'operations.html'], ['/operations.html', 'operations.html'],
  ['/mosque', 'mosque.html'], ['/mosque.html', 'mosque.html'],
  ['/events', 'events.html'], ['/events.html', 'events.html'],
  ['/about', 'about.html'], ['/about.html', 'about.html'],
  ['/participate', 'participate.html'], ['/participate.html', 'participate.html'], ['/contact', 'participate.html'],
  ['/privacy', 'privacy.html'], ['/terms', 'terms.html'], ['/sources', 'sources.html'], ['/accessibility', 'accessibility.html'],
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const rate = new Map();
function limited(key, max, span = 60000) {
  const now = Date.now(), entry = rate.get(key);
  if (!entry || entry.until <= now) { rate.set(key, { count: 1, until: now + span }); return false; }
  entry.count++;
  if (rate.size > 5000) for (const [id, value] of rate) if (value.until < now) rate.delete(id);
  return entry.count > max;
}
const secureHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': tailnetMode || googleMode ? 'no-referrer' : 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  // Embedded Manus Preview permits its Dashboard; a private tailnet host permits no framing.
  'Content-Security-Policy': `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${tailnetMode || googleMode ? "'none'" : 'https://manus.im https://www.manus.im'}; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https://verses.quran.com https://verses.quran.foundation https://mirrors.quranicaudio.com; connect-src 'self'`,
  ...(tailnetMode || googleMode ? { 'X-Frame-Options': 'DENY' } : {}),
  ...(googleMode ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
};
function simple(text, status, extra = {}) { return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } }); }
async function body(req, max = 100000) {
  if (Number(req.headers['content-length'] || 0) > max) throw Object.assign(new Error('too_large'), { status: 413 });
  const parts = []; let bytes = 0;
  for await (const part of req) {
    bytes += part.length;
    if (bytes > max) throw Object.assign(new Error('too_large'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}
async function fileResponse(filename, status = 200, {readonlyMosque = false} = {}) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(filename) || filename.includes('..') || filename.startsWith('/')) return simple('Not found', 404);
  try {
    const bytes = await readFile(path.join(root, filename));
    let content = bytes;
    if (filename.endsWith('.html')) {
      let html = bytes.toString('utf8').replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow"><script src="/frame-guard.js"></script>');
      if (readonlyMosque && filename === 'mosque.html') {
        html = html.replace(/<section class="community-section" id="correction">[\s\S]*?<\/section>/,
          '<section class="community-section" id="correction"><p lang="en">Correction intake is limited to invited reviewers in this read-only phase. No public submission is stored.</p></section>');
      }
      content = Buffer.from(html);
    }
    return new Response(content, { status, headers: { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error.code === 'ENOENT') return simple('Not found', 404); throw error; }
}
export async function handle(req) {
  const url = new URL(req.url || '/', origin);
  const pathname = url.pathname;
  if (pathname === '/healthz') {
    if (googleMode) await database().prepare('SELECT 1 AS ok').first();
    return simple('ready', 200);
  }
  if (googleMode && !canonicalGoogleHost(req.headers.host, origin)) return simple('Unknown host.', 421);
  if (pathname === '/robots.txt') return simple('User-agent: *\nDisallow: /\n', 200);
  if (pathname === '/login' && googleMode) {
    if (!['GET', 'HEAD'].includes(req.method)) return simple('Method not allowed', 405);
    return publicLoginPage();
  }
  if (googleMode && (pathname === '/privacy' || pathname === '/terms'))
    return publicPolicyPage(pathname, req.method);
  if (pathname === '/manus-routes.json' && !googleMode) return fileResponse('manus-routes.json');
  if (pathname === '/recover' || pathname === '/signed-out') {
    if (!['GET', 'HEAD'].includes(req.method)) return simple('Method not allowed', 405);
    if (googleMode) return publicExitPage(pathname === '/recover');
    return fileResponse(pathname === '/recover'
      ? (tailnetMode ? 'tailnet-recovery.html' : 'recovery.html')
      : (tailnetMode ? 'tailnet-signed-out.html' : 'signed-out.html'));
  }
  if (pathname.startsWith('/auth/')) {
    if (!['GET', 'POST'].includes(req.method)) return simple('Method not allowed', 405);
    const incoming = new Request(origin + req.url, { method: req.method, headers: req.headers });
    if (tailnetMode) return tailnetAuthResponse(incoming, process.env, { db: database(), remoteAddress: req.socket.remoteAddress });
    if (googleMode) {
      if (pathname === '/auth/login' || pathname === '/auth/callback') return googleAuthResponse(incoming, process.env, { db: database() });
      const response = await authResponse(incoming, process.env, { db: database() });
      if (req.method === 'POST' && response.status === 403 &&
          (pathname === '/auth/logout' || pathname === '/auth/logout-all')) {
        // Temporary transport diagnostic: only categories, never headers or identity values.
        const supplied = req.headers.origin;
        const site = req.headers['sec-fetch-site'];
        const parsed = supplied && URL.canParse(supplied) ? new URL(supplied) : null;
        console.warn('[review] logout transport denied', {
          origin: supplied === undefined ? 'absent' : supplied === origin ? 'canonical' :
            supplied === 'null' ? 'opaque-null' : supplied === '' ? 'empty' :
            parsed?.origin === origin ? 'canonical-url-variant' :
            ['localhost', '127.0.0.1'].includes(parsed?.hostname) ? 'loopback' :
            parsed?.hostname?.endsWith('.railway.internal') ? 'railway-internal' : 'external-or-invalid',
          fetchSite: ['same-origin', 'same-site', 'cross-site', 'none'].includes(site) ? site : 'absent-or-other',
          referer: req.headers.referer === undefined ? 'absent' : 'present',
          fetchMode: req.headers['sec-fetch-mode'] === 'navigate' ? 'navigate' : 'other',
        });
      }
      return response;
    }
    return authResponse(incoming, process.env, { db: database(), previewProxyOrigin: `http://127.0.0.1:${port}` });
  }
  // The Sites-only identity headers are deliberately ignored. Every request is authenticated
  // by a signed, project-scoped Manus application session before accessing ANY page or API.
  const incoming = new Request(origin + req.url, { headers: req.headers });
  const serveIdentity = tailnetMode ? tailnetIdentity(incoming, process.env, { remoteAddress: req.socket.remoteAddress }) : null;
  const identityBound = !tailnetMode || (serveIdentity && sessionMatchesIdentity(tailnetSessionCookie(incoming), process.env, serveIdentity));
  const user = identityBound ? await verifiedRequestUser(incoming, process.env, database()) : null;
  if (pathname === '/api/review/identity' && req.method === 'GET' && user)
    return Response.json({ id: user.id, name: user.name }, { headers: { 'Cache-Control': 'private, no-store' } });
  // A verified-but-not-yet-invited tailnet account may see its own ID only,
  // never another member's records. The owner must grant this exact value.
  if (tailnetMode && pathname === '/api/review/identity' && req.method === 'GET' && serveIdentity)
    return Response.json({ id: serveIdentity.id, name: serveIdentity.name }, { headers: { 'Cache-Control': 'private, no-store' } });
  const verifiedActor = user ? await resolveActor(user, process.env) : null;
  const visitorRead = !tailnetMode && !googleMode && !verifiedActor && publicReadingAllowed(req.method, pathname, process.env);
  if (!verifiedActor && !visitorRead) {
    if (user) return simple('Access revoked', 403);
    return pathname.startsWith('/api/') ? Response.json({ error: 'sign_in_required' }, { status: 401 }) : new Response(null, { status: 302, headers: { Location: googleMode ? '/login' : '/auth/login', 'Cache-Control': 'no-store' } });
  }
  const actor = visitorRead ? { id: 'anonymous-visitor', role: 'visitor', name: '' } : verifiedActor;
  if (['/admin', '/admin.html', '/operations', '/operations.html', '/staff', '/staff.html'].includes(pathname) && actor.role === 'reader')
    return simple('Staff access only', 403);
  if (pathname.startsWith('/api/')) {
    if (limited(actor.id + ':' + pathname.split('/').slice(0, 3).join('/'), pathname === '/api/participation' || pathname === '/api/corrections' ? 8 : 120))
      return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
    const headers = new Headers(req.headers);
    for (const name of ['oai-authenticated-user-id', 'oai-authenticated-user-email', 'oai-authenticated-user-full-name', 'x-review-role']) headers.delete(name);
    headers.set('oai-authenticated-user-id', actor.id);
    headers.set('oai-authenticated-user-email', 'verified-session@review.invalid');
    if (!['GET', 'HEAD'].includes(req.method)) {
      // Manus Preview rewrites a browser's same-origin Origin header to the local
      // upstream. Normalize it only when Fetch Metadata still proves same-origin;
      // a cross-site POST (or an absent Origin/metadata pair) stays forbidden.
      const proxyOrigin = `http://127.0.0.1:${port}`;
      const proxyRewritten = req.headers.origin === proxyOrigin && req.headers['sec-fetch-site'] === 'same-origin';
      if ((req.headers.origin !== origin && !proxyRewritten) || req.headers['sec-fetch-site'] === 'cross-site')
        return Response.json({ error: 'same_origin_required' }, { status: 403 });
      headers.set('origin', origin);
    }
    const maxBody = pathname === '/api/study/transcribe' ? GEMINI_LIMITS.MAX_TRANSCRIPT_BYTES + 16_384 : 100_000;
    const bytes = req.method === 'GET' || req.method === 'HEAD' ? null : await body(req, maxBody);
    const request = new Request(origin + req.url, { method: req.method, headers, body: bytes?.length ? bytes : undefined });
    if (visitorRead && !publicReadingAllowed(req.method, pathname, process.env))
      return Response.json({ error: 'sign_in_required' }, { status: 401 });
    if (pathname === '/api/review/session' || pathname.startsWith('/api/admin/roles')) return accessResponse(request, actor, process.env);
    if (pathname.startsWith('/api/member/') || pathname === '/api/admin/members' || pathname === '/api/admin/member-audit')
      return memberResponse(request, { ...process.env, DB: database() }, actor);
    if (pathname === '/api/resources' || pathname === '/api/mosques' || pathname === '/api/mosque-overlays' ||
        pathname === '/api/admin/dashboard' || pathname === '/api/admin/audit' ||
        pathname === '/api/admin/resources' || pathname.startsWith('/api/admin/resources/') ||
        pathname === '/api/admin/mosque-corrections' || pathname.startsWith('/api/admin/mosque-corrections/') ||
        pathname === '/api/admin/intake' || pathname.startsWith('/api/admin/intake/') ||
        pathname === '/api/admin/settings' || pathname.startsWith('/api/admin/settings/') ||
        pathname === '/api/admin/study-usage' || pathname === '/api/admin/study-reports' || pathname.startsWith('/api/admin/study-reports/'))
      return manageResponse(request, {...process.env, DB: database()}, actor);
    if (pathname.startsWith('/api/study/')) {
      let configured = {studyRequestsPerDay: 0, speechRequestsPerDay: 0, maxConcurrentJobs: 0};
      const value = await database().prepare("SELECT value_json FROM management_settings WHERE setting_key='usageLimits'").first();
      if (value?.value_json) {
        try { configured = validateSafeSetting('usageLimits', JSON.parse(value.value_json)); } catch { /* malformed owner setting never raises hard limits */ }
      }
      return studyResponse(request, { ...process.env, DB: database(), STUDY_USAGE_LIMITS: configUsageLimits(configured) }, actor);
    }
    if (pathname.startsWith('/api/quran/')) return quranResponse(request, { ...process.env, QURAN_ENVIRONMENT: process.env.QURAN_ENVIRONMENT || 'production' });
    if (pathname.startsWith('/api/admin/documents') || pathname === '/api/admin/session' || pathname === '/api/content' || pathname.startsWith('/api/content/')) {
      const env = { ...process.env, DB: database(), EDITORIAL_OWNER_ID: actor.role === 'owner' ? actor.id : (process.env.EDITORIAL_OWNER_ID || process.env.REVIEW_OWNER_ID || ''), EDITORIAL_ROLES: actor.role === 'reader' || actor.role === 'owner' || actor.role === 'visitor' ? '{}' : JSON.stringify({ [actor.id]: actor.role }) };
      return editorialResponse(request, env);
    }
    if (pathname === '/api/events' || pathname.startsWith('/api/admin/events') || pathname === '/api/participation' || pathname === '/api/corrections' || pathname.startsWith('/api/admin/submissions')) {
      const { communityResponse } = await import('./community.mjs');
      return communityResponse(request, { DB: database() }, actor);
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (!['GET', 'HEAD'].includes(req.method)) return simple('Method not allowed', 405);
  if (pathname.length > 1 && pathname.endsWith('/')) return new Response(null, { status: 308, headers: { Location: pathname.replace(/\/+$/, '') } });
  let filename = pages.get(pathname);
  if (/^\/library\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'library.html';
  if (/^\/mosques\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'mosques.html';
  if (/^\/events\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'events.html';
  if (!filename && /^\/(?:assets|data)\/[a-zA-Z0-9_./-]+$/.test(pathname)) filename = pathname.slice(1);
  if (!filename && /^\/[a-zA-Z0-9_-]+\.(?:js|css|svg|png)$/.test(pathname)) filename = pathname.slice(1);
  return filename ? fileResponse(filename, 200, {readonlyMosque: visitorRead}) : simple('Not found', 404);
}

// Importing the handler for local denial tests never opens a listener or runs
// migrations. The real app entrypoint always verifies its schema before serving.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifySchema();
  const server = http.createServer(async (req, res) => {
    try {
      const response = await handle(req);
      const headers = { ...Object.fromEntries(response.headers), ...secureHeaders };
      const cookies = response.headers.getSetCookie?.();
      if (cookies?.length) headers['set-cookie'] = cookies;
      res.writeHead(response.status, headers);
      if (req.method === 'HEAD') res.end(); else res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      // Never log raw query strings, request bodies, database DSNs, session cookies or PII.
      console.error('[review] request failure', { type: error.name || 'Error', status: error.status || 503 });
      res.writeHead(error.status === 413 ? 413 : 503, { ...secureHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error.status === 413 ? 'too_large' : 'temporarily_unavailable' }));
    }
  });
  const bindHost = process.env.REVIEW_BIND_HOST === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0';
  server.listen(port, bindHost, () => console.log(`[review] ready on port ${port}; ${process.env.DD_PUBLIC_READ_MODE === 'approved-public-readonly' ? 'approved public read-only mode' : 'private application login required'}`));
}
