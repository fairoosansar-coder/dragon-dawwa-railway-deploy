// Quran Foundation credentials and access tokens remain in this server module.
const environments = {
  prelive: { auth: 'https://prelive-oauth2.quran.foundation', api: 'https://apis-prelive.quran.foundation' },
  production: { auth: 'https://oauth2.quran.foundation', api: 'https://apis.quran.foundation' }
};
export class QuranError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
export function createQuranClient(config, fetcher = (url, init) => globalThis.fetch(url, init), now = Date.now) {
  const environment = config.QURAN_ENVIRONMENT || 'prelive';
  const host = environments[environment];
  let token, tokenExpires = 0, pendingToken, bootstrapValue, bootstrapExpires = 0, pendingBootstrap;
  const cache = new Map();
  function configured() {
    if (!host || !config.QURAN_CLIENT_ID || !config.QURAN_CLIENT_SECRET) throw new QuranError('not_configured', 503);
  }
  async function accessToken() {
    configured();
    if (token && now() < tokenExpires) return token;
    if (pendingToken) return pendingToken;
    pendingToken = (async () => {
      const basic = globalThis.btoa(config.QURAN_CLIENT_ID + ':' + config.QURAN_CLIENT_SECRET);
      const r = await fetcher(host.auth + '/oauth2/token', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&scope=content'
      });
      if (!r.ok) throw new QuranError(r.status === 401 || r.status === 403 ? 'access_pending' : 'provider_unavailable', r.status === 429 ? 429 : 502);
      const d = await r.json();
      if (typeof d.access_token !== 'string' || !Number.isFinite(d.expires_in) || d.expires_in <= 0) throw new QuranError('provider_unavailable');
      token = d.access_token; tokenExpires = now() + Math.max(0, d.expires_in - 60) * 1000;
      return token;
    })();
    try { return await pendingToken; } finally { pendingToken = null; }
  }
  async function content(path) {
    configured();
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await accessToken();
      const r = await fetcher(host.api + '/content/api/v4/' + path, {
        headers: { 'x-auth-token': t, 'x-client-id': config.QURAN_CLIENT_ID },
        redirect: 'manual', signal: AbortSignal.timeout(15000)
      });
      if (r.status === 401 && attempt === 0) { token = null; tokenExpires = 0; continue; }
      if (!r.ok) throw new QuranError(r.status === 403 ? 'access_pending' : r.status === 429 ? 'rate_limited' : 'provider_unavailable', r.status === 429 ? 429 : 502);
      const d = await r.json();
      if (d.success === false) throw new QuranError('provider_unavailable');
      return d;
    }
    throw new QuranError('access_pending');
  }
  async function bootstrap() {
    if (bootstrapValue && now() < bootstrapExpires) return bootstrapValue;
    if (pendingBootstrap) return pendingBootstrap;
    pendingBootstrap = (async () => {
      const [c, t, a] = await Promise.all([content('chapters'), content('resources/translations'), content('resources/recitations')]);
      if (!Array.isArray(c.chapters) || !c.chapters.length || !Array.isArray(t.translations) || !Array.isArray(a.recitations)) throw new QuranError('provider_unavailable');
      bootstrapValue = {
        environment,
        chapters: c.chapters.map(x => ({ id: x.id, name: x.name_simple, arabic: x.name_arabic, verses: x.verses_count })),
        translations: t.translations.filter(x => ['english','tamil','sinhala','sinhalese'].includes(x.language_name?.toLowerCase()) && x.slug !== 'transliteration').map(x => ({ id: x.id, name: x.name, author: x.author_name, language: x.language_name })),
        recitations: a.recitations.map(x => ({ id: x.id, name: x.reciter_name, style: x.style }))
      };
      bootstrapExpires = now() + 300000;
      return bootstrapValue;
    })();
    try { return await pendingBootstrap; } finally { pendingBootstrap = null; }
  }
  async function verses(params) {
    const allowed = new Set(['chapter','page','translation','recitation']);
    for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new QuranError('invalid_request', 400);
    function number(key, fallback, max) {
      const value = params.get(key) ?? String(fallback);
      if (!/^\d{1,6}$/.test(value) || Number(value) < 1 || Number(value) > max) throw new QuranError('invalid_request', 400);
      return Number(value);
    }
    const chapter = number('chapter', 1, 114), page = number('page', 1, 15);
    const translation = params.has('translation') ? number('translation', 0, 999999) : null;
    const recitation = params.has('recitation') ? number('recitation', 0, 999999) : null;
    const data = await bootstrap();
    if (!data.chapters.some(x => x.id === chapter) || translation && !data.translations.some(x => x.id === translation) || recitation && !data.recitations.some(x => x.id === recitation)) throw new QuranError('unavailable_resource', 400);
    const query = new URLSearchParams({ fields: 'text_uthmani', per_page: '20', page: String(page) });
    if (translation) query.set('translations', String(translation));
    if (recitation) query.set('audio', String(recitation));
    const path = 'verses/by_chapter/' + chapter + '?' + query;
    const cached = cache.get(path);
    if (cached && now() < cached.expires) return cached.value;
    const d = await content(path);
    if (!Array.isArray(d.verses) || !d.pagination) throw new QuranError('provider_unavailable');
    const value = {
      environment, chapter, translation, recitation,
      verses: d.verses.map(v => ({ key: v.verse_key, arabic: v.text_uthmani, translations: (v.translations || []).filter(x => x.resource_id === translation).map(x => ({ id: x.resource_id, text: x.text })), audio: audioUrl(v.audio?.url) })),
      pagination: { current: d.pagination.current_page, next: d.pagination.next_page, total: d.pagination.total_pages, count: d.pagination.total_records }
    };
    if (value.verses.some(x => typeof x.arabic !== 'string' || !/^\d{1,3}:\d{1,3}$/.test(x.key))) throw new QuranError('provider_unavailable');
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    cache.set(path, { value, expires: now() + 300000 });
    return value;
  }
  return { bootstrap, verses };
}
export function audioUrl(path) {
  if (typeof path !== 'string') return null;
  try {
    const url = new URL(path.startsWith('//') ? 'https:' + path : path, 'https://verses.quran.com/');
    return url.protocol === 'https:' && ['verses.quran.com','verses.quran.foundation','mirrors.quranicaudio.com'].includes(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
let client, previousConfig;
export async function quranResponse(request, config) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'GET') return send({ error: 'method_not_allowed' }, 405);
  const url = new URL(request.url);
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return send({ error: 'forbidden' }, 403);
  try {
    const values = [config.QURAN_CLIENT_ID, config.QURAN_CLIENT_SECRET, config.QURAN_ENVIRONMENT];
    if (!client || values.some((x, i) => x !== previousConfig[i])) { client = createQuranClient(config); previousConfig = values; }
    if (url.pathname === '/api/quran/bootstrap' && !url.search) return send(await client.bootstrap());
    if (url.pathname === '/api/quran/verses') return send(await client.verses(url.searchParams));
    return send({ error: 'not_found' }, 404);
  } catch (e) {
    const knownProblem = /Illegal invocation/.test(e?.message || '') ? 'fetch_binding' : /redirect/i.test(e?.message || '') ? 'redirect_mode' : /AbortSignal/.test(e?.message || '') ? 'timeout_api' : /different request|request.*context/i.test(e?.message || '') ? 'request_context' : /timeout/i.test(e?.name || '') ? 'timeout' : 'unclassified';
    console.error('[quran]', JSON.stringify({ code: e instanceof QuranError ? e.code : 'runtime_error', errorType: e?.name, knownProblem }));
    return send({ error: e instanceof QuranError ? e.code : 'provider_unavailable' }, e instanceof QuranError ? e.status : 502);
  }
}
