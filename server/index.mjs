import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
import { publicReadingAllowed, publicReadEnabled } from './public-read.mjs';
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
  ['/quran/study', 'quran-study.html'],
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
const ANONYMOUS_RATE_COOKIE = '__Host-dd_public_rate';
const ANONYMOUS_RATE_SECONDS = 30 * 60;
const PUBLIC_ORIGIN = 'https://dragondawwa.org';
const sitemapPaths = ['/', '/about', '/quran', '/library', '/resources', '/research', '/mosque', '/mosques', '/events', '/contact', '/privacy', '/terms', '/sources', '/accessibility'];
const pageMetadata = new Map([
  ['/', ['Dragon Dawwa · Knowledge with humility', 'A source-aware multilingual space for careful learning, public records, and published resources.']],
  ['/about', ['About Dragon Dawwa', 'Learn how Dragon Dawwa distinguishes sources, interpretation, and editorial review.']],
  ['/quran', ['Qur’an reader · Dragon Dawwa', 'Read Quran content from the configured Quran Foundation source when it is available.']],
  ['/quran/study', ['Study a Quranic ayah · Dragon Dawwa', 'Study a selected Quranic ayah with named source translations, footnotes, tafsir and recitation when available.']],
  ['/library', ['Published library · Dragon Dawwa', 'Source-linked readings published through the Dragon Dawwa editorial workflow.']],
  ['/resources', ['Curated resources · Dragon Dawwa', 'Verified outbound learning resources from their original publishers.']],
  ['/research', ['Research · Dragon Dawwa', 'Source-limited public research and government-directory context for Anuradhapura.']],
  ['/mosque', ['Mosque profile · Dragon Dawwa', 'A source-limited public directory profile for Jamia Kadheeja Jummah Mosque.']],
  ['/mosques', ['Mosque directory · Dragon Dawwa', 'A preserved government-directory view of listed Anuradhapura mosques.']],
  ['/events', ['Published events · Dragon Dawwa', 'Confirmed events published by Dragon Dawwa, with honest empty states when none are available.']],
  ['/contact', ['Contact · Dragon Dawwa', 'Public contact information and the boundary between browsing and protected accounts.']],
  ['/privacy', ['Privacy · Dragon Dawwa', 'Privacy information for Dragon Dawwa public pages and protected accounts.']],
  ['/terms', ['Terms · Dragon Dawwa', 'Terms and source-use information for Dragon Dawwa public pages.']],
  ['/sources', ['Sources · Dragon Dawwa', 'Source and attribution information for Dragon Dawwa visitor pages.']],
  ['/accessibility', ['Accessibility · Dragon Dawwa', 'Accessibility information for Dragon Dawwa visitor pages.']],
]);
export function rateLimited(key, max, span = 60000, entries = rate, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry || entry.until <= now) { entries.set(key, { count: 1, until: now + span }); return false; }
  entry.count++;
  if (entries.size > 5000) for (const [id, value] of entries) if (value.until < now) entries.delete(id);
  return entry.count > max;
}
function requestCookie(req, name) {
  let value = null;
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1 || part.slice(0, at).trim() !== name) continue;
    if (value !== null) return null;
    value = part.slice(at + 1).trim();
  }
  return value;
}
function anonymousRateSignature(token, config = process.env) {
  return createHmac('sha256', config.REVIEW_SESSION_SECRET || '')
    .update('dragon-dawwa-public-rate-v1\0').update(token).digest('base64url');
}
function validAnonymousRateToken(req, config = process.env) {
  const raw = requestCookie(req, ANONYMOUS_RATE_COOKIE);
  const parts = raw?.split('.') || [];
  if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]{24}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  const expected = Buffer.from(anonymousRateSignature(parts[1], config));
  const supplied = Buffer.from(parts[2]);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? parts[1] : null;
}
export function anonymousRateCookie(config = process.env, random = randomBytes) {
  const token = random(18).toString('base64url');
  const value = `v1.${token}.${anonymousRateSignature(token, config)}`;
  return `${ANONYMOUS_RATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ANONYMOUS_RATE_SECONDS}`;
}
export function anonymousRateIdentity(req, config = process.env) {
  const token = validAnonymousRateToken(req, config);
  // A forged or absent token uses a deliberately small shared bucket. Ordinary
  // browsers receive a signed, opaque token on their first public HTML page,
  // so one visitor cannot exhaust another visitor's normal read quota.
  return token ? { id: `anonymous:${token}`, seeded: true } : { id: 'anonymous:unseeded', seeded: false };
}
function secureHeaders(indexable = false) {
  return {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': tailnetMode || googleMode ? 'no-referrer' : 'strict-origin-when-cross-origin',
    ...(indexable ? {} : { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }),
    // Embedded Manus Preview permits its Dashboard; Google and tailnet endpoints permit no framing.
    'Content-Security-Policy': `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${tailnetMode || googleMode ? "'none'" : 'https://manus.im https://www.manus.im'}; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https://verses.quran.com https://verses.quran.foundation https://mirrors.quranicaudio.com; connect-src 'self'`,
    ...(tailnetMode || googleMode ? { 'X-Frame-Options': 'DENY' } : {}),
    ...(googleMode ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
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
function canonicalPath(pathname) {
  const normalized = pathname === '/index.html' ? '/' : pathname.replace(/\.html$/, '') || '/';
  return new Map([['/learn', '/library'], ['/participate', '/contact']]).get(normalized) || normalized;
}
function publicHead(pathname) {
  const canonical = canonicalPath(pathname);
  const [title, description] = pageMetadata.get(canonical) || ['Dragon Dawwa', 'Published visitor content from Dragon Dawwa.'];
  const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  // This query-specific client-rendered study view has no server-rendered verse;
  // never index an empty shell as though it were a distinct ayah document.
  if (canonical === '/quran/study') return `<meta name="dd-public-page" content="true"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${PUBLIC_ORIGIN}/quran"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">`;
  return `<meta name="dd-public-page" content="true"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${PUBLIC_ORIGIN}${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${PUBLIC_ORIGIN}${canonical}"><meta property="og:site_name" content="Dragon Dawwa"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">`;
}
async function fileResponse(filename, status = 200, {readonlyMosque = false, publicPage = false, publicAsset = false, pathname = '/'} = {}) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(filename) || filename.includes('..') || filename.startsWith('/')) return simple('Not found', 404);
  try {
    const bytes = await readFile(path.join(root, filename));
    let content = bytes;
    if (filename.endsWith('.html')) {
      let html = bytes.toString('utf8').replace(/<head>/i, `<head>${publicPage ? publicHead(pathname) : '<meta name="robots" content="noindex,nofollow">'}<script src="/frame-guard.js"></script>`);
      if (readonlyMosque && filename === 'mosque.html') {
        html = html.replace(/<section class="community-section" id="correction">[\s\S]*?<\/section>/,
          '<section class="community-section" id="correction"><p lang="en">Public correction intake is not enabled. The cited government record remains available through its original source; no public submission is stored here.</p></section>');
      }
      content = Buffer.from(html);
    }
    return new Response(content, { status, headers: {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': publicPage ? 'public, max-age=0, must-revalidate' : publicAsset ? 'public, max-age=3600' : 'private, no-store',
      ...(publicPage ? {'X-DD-Public-Page': '1'} : {}),
    } });
  } catch (error) { if (error.code === 'ENOENT') return simple('Not found', 404); throw error; }
}
export async function handle(req) {
  const url = new URL(req.url || '/', origin);
  const pathname = url.pathname;
  const publicLaunch = publicReadEnabled(process.env);
  if (pathname === '/healthz') {
    if (googleMode) await database().prepare('SELECT 1 AS ok').first();
    return simple('ready', 200);
  }
  if (googleMode && !canonicalGoogleHost(req.headers.host, origin)) return simple('Unknown host.', 421);
  if (pathname.length > 1 && pathname.endsWith('/') && ['GET', 'HEAD'].includes(req.method)) {
    const slashless = pathname.replace(/\/+$/, '');
    if (publicReadingAllowed(req.method, slashless, process.env))
      return new Response(null, { status: 308, headers: { Location: slashless + url.search, 'Cache-Control': 'public, max-age=0, must-revalidate' } });
  }
  if (pathname === '/robots.txt') {
    const text = publicLaunch
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /staff\nDisallow: /operations\nDisallow: /member\nDisallow: /study\nDisallow: /auth/\nDisallow: /login\nDisallow: /recover\nDisallow: /signed-out\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n';
    return simple(text, 200, {'Content-Type': 'text/plain; charset=utf-8'});
  }
  if (pathname === '/sitemap.xml') {
    if (!publicLaunch || !['GET', 'HEAD'].includes(req.method)) return simple('Not found', 404);
    const entries = sitemapPaths.map(route => `<url><loc>${PUBLIC_ORIGIN}${route}</loc></url>`).join('');
    return new Response(req.method === 'HEAD' ? null : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
      headers: {'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate'},
    });
  }
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
    const logoutPost = req.method === 'POST' && (pathname === '/auth/logout' || pathname === '/auth/logout-all');
    const formBytes = logoutPost ? await body(req, 2048) : null;
    const incoming = new Request(origin + req.url, {
      method: req.method, headers: req.headers,
      body: formBytes?.length ? formBytes : undefined,
    });
    if (tailnetMode) return tailnetAuthResponse(incoming, process.env, { db: database(), remoteAddress: req.socket.remoteAddress });
    if (googleMode) {
      if (pathname === '/auth/login' || pathname === '/auth/callback') return googleAuthResponse(incoming, process.env, { db: database() });
      return authResponse(incoming, process.env, { db: database() });
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
  const visitorRead = !tailnetMode && !verifiedActor && publicReadingAllowed(req.method, pathname, process.env);
  if (!verifiedActor && !visitorRead) {
    if (user) return simple('Access revoked', 403);
    return pathname.startsWith('/api/') ? Response.json({ error: 'sign_in_required' }, { status: 401 }) : new Response(null, { status: 302, headers: { Location: googleMode ? '/login' : '/auth/login', 'Cache-Control': 'no-store' } });
  }
  const visitorIdentity = visitorRead ? anonymousRateIdentity(req, process.env) : null;
  const actor = visitorRead ? { id: visitorIdentity.id, role: 'visitor', name: '' } : verifiedActor;
  if (['/admin', '/admin.html', '/operations', '/operations.html', '/staff', '/staff.html'].includes(pathname) && actor.role === 'reader')
    return simple('Staff access only', 403);
  if (pathname.startsWith('/api/')) {
    const limit = pathname === '/api/participation' || pathname === '/api/corrections' ? 8 : visitorRead && !visitorIdentity.seeded ? 24 : 120;
    if (rateLimited(actor.id + ':' + pathname.split('/').slice(0, 3).join('/'), limit))
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
  let filename = pages.get(pathname);
  if (/^\/library\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'library.html';
  if (/^\/mosques\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'mosques.html';
  if (/^\/events\/[a-zA-Z0-9-]{1,64}$/.test(pathname)) filename = 'events.html';
  if (!filename && /^\/(?:assets|data)\/[a-zA-Z0-9_./-]+$/.test(pathname)) filename = pathname.slice(1);
  if (!filename && /^\/[a-zA-Z0-9_-]+\.(?:js|css|svg|png)$/.test(pathname)) filename = pathname.slice(1);
  if (!filename) return simple('Not found', 404);
  const publicRoute = publicReadingAllowed('GET', pathname, process.env);
  const response = await fileResponse(filename, 200, {
    readonlyMosque: publicRoute && filename === 'mosque.html',
    publicPage: publicRoute && filename.endsWith('.html'),
    publicAsset: publicRoute && !filename.endsWith('.html'),
    pathname,
  });
  if (visitorIdentity && !visitorIdentity.seeded && req.method === 'GET' && publicRoute && filename.endsWith('.html'))
    response.headers.append('Set-Cookie', anonymousRateCookie(process.env));
  return response;
}

// Importing the handler for local denial tests never opens a listener or runs
// migrations. The real app entrypoint always verifies its schema before serving.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifySchema();
  const server = http.createServer(async (req, res) => {
    try {
      const response = await handle(req);
      const indexable = response.headers.get('X-DD-Public-Page') === '1';
      response.headers.delete('X-DD-Public-Page');
      const headers = { ...Object.fromEntries(response.headers), ...secureHeaders(indexable) };
      const cookies = response.headers.getSetCookie?.();
      if (cookies?.length) headers['set-cookie'] = cookies;
      res.writeHead(response.status, headers);
      if (req.method === 'HEAD') res.end(); else res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      // Never log raw query strings, request bodies, database DSNs, session cookies or PII.
      console.error('[review] request failure', { type: error.name || 'Error', status: error.status || 503 });
      res.writeHead(error.status === 413 ? 413 : 503, { ...secureHeaders(false), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: error.status === 413 ? 'too_large' : 'temporarily_unavailable' }));
    }
  });
  const bindHost = process.env.REVIEW_BIND_HOST === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0';
  server.listen(port, bindHost, () => console.log(`[review] ready on port ${port}; ${process.env.DD_PUBLIC_READ_MODE === 'approved-public-readonly' ? 'approved public read-only mode' : 'private application login required'}`));
}
