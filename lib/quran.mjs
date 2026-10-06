// Quran Foundation credentials and access tokens remain in this server module.
const environments = {
  prelive: { auth: 'https://prelive-oauth2.quran.foundation', api: 'https://apis-prelive.quran.foundation' },
  production: { auth: 'https://oauth2.quran.foundation', api: 'https://apis.quran.foundation' }
};
const verseAudioHosts = ['verses.quran.com', 'verses.quran.foundation', 'mirrors.quranicaudio.com'];
const wordAudioHosts = ['audio.qurancdn.com', ...verseAudioHosts];
const chapterAudioHosts = ['download.quranicaudio.com', ...verseAudioHosts];
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
      const [c, t, a, tafsirResult, chapterRecitersResult] = await Promise.all([
        content('chapters'), content('resources/translations'), content('resources/recitations'),
        content('resources/tafsirs').catch(() => null),
        content('resources/chapter_reciters').catch(() => null),
      ]);
      if (!Array.isArray(c.chapters) || !c.chapters.length || !Array.isArray(t.translations) || !Array.isArray(a.recitations)) throw new QuranError('provider_unavailable');
      bootstrapValue = {
        environment,
        chapters: c.chapters.map(x => {
          const chapter = { id: x.id, name: x.name_simple, arabic: x.name_arabic, verses: x.verses_count };
          if (typeof x.revelation_place === 'string') chapter.revelationPlace = x.revelation_place;
          if (typeof x.translated_name?.name === 'string') chapter.translatedName = x.translated_name.name;
          return chapter;
        }),
        translations: t.translations.filter(x => ['english','tamil','sinhala','sinhalese'].includes(x.language_name?.toLowerCase()) && x.slug !== 'transliteration').map(x => ({ id: x.id, name: x.name, author: x.author_name, language: x.language_name })),
        recitations: a.recitations.map(x => ({ id: x.id, name: x.reciter_name, style: x.style })),
        tafsirs: (tafsirResult?.tafsirs || []).filter(x => ['english','tamil','sinhala','sinhalese','arabic'].includes(x.language_name?.toLowerCase()))
          .map(x => ({ id: x.id, name: x.name, author: x.author_name, language: x.language_name })),
        tafsirCatalogueAvailable: Array.isArray(tafsirResult?.tafsirs),
        // Chapter-reciter IDs are a distinct QF catalogue from verse recitation IDs.
        chapterReciters: (Array.isArray(chapterRecitersResult?.reciters) ? chapterRecitersResult.reciters : []).filter(x => Number.isInteger(x?.id) && x.id > 0 && x.id <= 999999 && typeof x.name === 'string' && x.name.trim())
          .map(x => ({ id: x.id, name: x.name, style: typeof x.style === 'string' ? x.style : typeof x.style?.name === 'string' ? x.style.name : null })),
        chapterRecitersAvailable: Array.isArray(chapterRecitersResult?.reciters),
      };
      bootstrapExpires = now() + 300000;
      return bootstrapValue;
    })();
    try { return await pendingBootstrap; } finally { pendingBootstrap = null; }
  }
  async function verses(params) {
    const allowed = new Set(['chapter','page','translation','recitation','script','words']);
    for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new QuranError('invalid_request', 400);
    function number(key, fallback, max) {
      const value = params.get(key) ?? String(fallback);
      if (!/^\d{1,6}$/.test(value) || Number(value) < 1 || Number(value) > max) throw new QuranError('invalid_request', 400);
      return Number(value);
    }
    const chapter = number('chapter', 1, 114), page = number('page', 1, 15);
    const translation = params.has('translation') ? number('translation', 0, 999999) : null;
    const recitation = params.has('recitation') ? number('recitation', 0, 999999) : null;
    const script = params.get('script');
    const scriptFields = { uthmani: 'text_uthmani', indopak: 'text_indopak', tajweed: 'text_uthmani_tajweed' };
    if (script !== null && !Object.hasOwn(scriptFields, script)) throw new QuranError('invalid_request', 400);
    const words = params.get('words');
    if (words !== null && words !== '1') throw new QuranError('invalid_request', 400);
    const data = await bootstrap();
    if (!data.chapters.some(x => x.id === chapter) || translation && !data.translations.some(x => x.id === translation) || recitation && !data.recitations.some(x => x.id === recitation)) throw new QuranError('unavailable_resource', 400);
    const fields = script && script !== 'uthmani' ? `text_uthmani,${scriptFields[script]}` : 'text_uthmani';
    const query = new URLSearchParams({ fields, per_page: '20', page: String(page) });
    if (translation) query.set('translations', String(translation));
    if (recitation) query.set('audio', String(recitation));
    if (words) { query.set('words', 'true'); query.set('word_fields', 'text_uthmani'); }
    const path = 'verses/by_chapter/' + chapter + '?' + query;
    const cached = cache.get(path);
    if (cached && now() < cached.expires) return cached.value;
    const d = await content(path);
    if (!Array.isArray(d.verses) || !d.pagination) throw new QuranError('provider_unavailable');
    const value = {
      environment, chapter, translation, recitation,
      verses: d.verses.map(v => mapVerse(v, translation, script, scriptFields[script], words === '1')),
      pagination: { current: d.pagination.current_page, next: d.pagination.next_page, total: d.pagination.total_pages, count: d.pagination.total_records }
    };
    value.script = script;
    value.wordsAvailable = words === '1' && d.verses.length > 0 && d.verses.every(v => Array.isArray(v?.words));
    if (value.verses.some(x => !hasArabicText(x.arabic) || !/^\d{1,3}:\d{1,3}$/.test(x.key))) throw new QuranError('provider_unavailable');
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    cache.set(path, { value, expires: now() + 300000 });
    return value;
  }
  function mapVerse(source, translation, script, scriptField, includeWords) {
    const verse = {
      key: source?.verse_key,
      arabic: source?.text_uthmani,
      scriptText: null,
      scriptAvailable: false,
      words: [],
      pageNumber: null,
      juzNumber: null,
      hizbNumber: null,
      translations: (source?.translations || []).filter(x => x.resource_id === translation).map(x => ({ id: x.resource_id, text: x.text })),
      audio: audioUrl(source?.audio?.url),
    };
    const metadata = [
      ['pageNumber', source?.page_number, 1, 604],
      ['juzNumber', source?.juz_number, 1, 30],
      ['hizbNumber', source?.hizb_number, 1, 60],
    ];
    for (const [name, value, min, max] of metadata) if (Number.isInteger(value) && value >= min && value <= max) verse[name] = value;
    if (script && hasArabicText(source?.[scriptField])) { verse.scriptText = source[scriptField]; verse.scriptAvailable = true; }
    if (includeWords && Array.isArray(source?.words)) {
      verse.words = source.words.slice(0, 80).map(word => mapWord(word)).filter(Boolean);
    }
    return verse;
  }
  function mapWord(source) {
    if (!source || typeof source !== 'object') return null;
    const word = { position: null, text: null, meaning: null, meaningLanguage: null, transliteration: null, audio: null };
    if (Number.isInteger(source.position) && source.position > 0 && source.position <= 1000) word.position = source.position;
    if (typeof source.text_uthmani === 'string') word.text = source.text_uthmani;
    if (typeof source.translation?.text === 'string') word.meaning = source.translation.text;
    if (typeof source.translation?.language_name === 'string') word.meaningLanguage = source.translation.language_name;
    if (typeof source.transliteration?.text === 'string') word.transliteration = source.transliteration.text;
    const audio = wordAudioUrl(source.audio_url);
    if (audio) word.audio = audio;
    return Object.values(word).some(value => value !== null) ? word : null;
  }
  function hasArabicText(text) {
    if (typeof text !== 'string' || text.length > 4096) return false;
    return /\p{Script=Arabic}/u.test(text.replace(/<[^>]*>/g,''));
  }
  async function chapterInfo(params) {
    const allowed = new Set(['chapter']);
    for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new QuranError('invalid_request', 400);
    const raw = params.get('chapter');
    if (!/^\d{1,3}$/.test(raw || '') || Number(raw) < 1 || Number(raw) > 114) throw new QuranError('invalid_request', 400);
    const chapter = Number(raw), data = await bootstrap();
    if (!data.chapters.some(x => x.id === chapter)) throw new QuranError('unavailable_resource', 400);
    const path = `chapters/${chapter}/info?language=en&include_resources=true`;
    let entry = cache.get(path);
    if (!entry || now() >= entry.expires) {
      const response = await content(path).catch(() => null);
      const source = response?.chapter_info;
      // short_text is provider content; the frontend treats it as untrusted HTML/text.
      if (Number(source?.chapter_id) !== chapter || typeof source?.short_text !== 'string' || !source.short_text.trim() || source.short_text.length > 2000 || typeof source?.source !== 'string' || !source.source.trim() || source.source.length > 2000) {
        entry = { value: { chapter, description: null, source: null, available: false }, expires: now() + 300000 };
      } else {
        entry = { value: { chapter, description: source.short_text, source: source.source, available: true }, expires: now() + 300000 };
      }
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(path, entry);
    }
    return entry.value;
  }
  async function chapterAudio(params) {
    const allowed = new Set(['chapter','reciter']);
    for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new QuranError('invalid_request', 400);
    const validNumber = (name, max) => {
      const raw = params.get(name);
      if (!/^\d{1,6}$/.test(raw || '') || Number(raw) < 1 || Number(raw) > max) throw new QuranError('invalid_request', 400);
      return Number(raw);
    };
    const chapter = validNumber('chapter', 114), reciter = validNumber('reciter', 999999);
    const data = await bootstrap();
    if (!data.chapters.some(x => x.id === chapter)) throw new QuranError('unavailable_resource', 400);
    if (!data.chapterRecitersAvailable) return { audio: null, reciter: null, available: false };
    const reciterSource = data.chapterReciters.find(x => x.id === reciter);
    if (!reciterSource) throw new QuranError('unavailable_resource', 400);
    const path = `chapter_recitations/${reciter}/${chapter}`;
    let entry = cache.get(path);
    if (!entry || now() >= entry.expires) {
      const response = await content(path).catch(() => null);
      const audio = chapterAudioUrl(response?.audio_file?.audio_url);
      entry = { value: { audio, reciter: reciterSource, available: Boolean(audio) }, expires: now() + 300000 };
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(path, entry);
    }
    return entry.value;
  }
  async function navigate(params) {
    const allowed = new Set(['unit','number']);
    for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new QuranError('invalid_request', 400);
    const unit = params.get('unit'), number = params.get('number');
    const definitions = {page:{path:'by_page',max:604,field:'page_number'},juz:{path:'by_juz',max:30,field:'juz_number'},hizb:{path:'by_hizb',max:60,field:'hizb_number'}};
    if (!Object.hasOwn(definitions,unit) || !/^[1-9]\d{0,2}$/.test(number || '') || Number(number) > definitions[unit].max) throw new QuranError('invalid_request',400);
    const path = `verses/${definitions[unit].path}/${number}?per_page=1&page=1`;
    let entry = cache.get(path);
    if (!entry || now() >= entry.expires) {
      const data = await content(path);
      const verse = data?.verses?.[0];
      const match = /^(\d{1,3}):(\d{1,3})$/.exec(verse?.verse_key || '');
      if (!match || Number(verse[definitions[unit].field]) !== Number(number)) throw new QuranError('provider_unavailable');
      const chapter = Number(match[1]), ayah = Number(match[2]), catalogue = await bootstrap();
      if (!catalogue.chapters.some(item => item.id === chapter && ayah >= 1 && ayah <= item.verses)) throw new QuranError('provider_unavailable');
      entry = {value:{key:verse.verse_key,chapter,page:Math.ceil(ayah/20),unit,number:Number(number)},expires:now()+300000};
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(path,entry);
    }
    return entry.value;
  }
  async function ayah(params) {
    const allowed = new Set(['key', 'translation', 'recitation', 'tafsir']);
    for (const [name] of params) if (!allowed.has(name) || params.getAll(name).length !== 1) throw new QuranError('invalid_request', 400);
    const key = params.get('key') || '';
    const match = /^(\d{1,3}):(\d{1,3})$/.exec(key);
    if (!match || match[1] !== String(Number(match[1])) || match[2] !== String(Number(match[2]))) throw new QuranError('invalid_request', 400);
    const data = await bootstrap();
    const chapter = data.chapters.find(x => x.id === Number(match[1]));
    if (!chapter || Number(match[2]) < 1 || Number(match[2]) > chapter.verses) throw new QuranError('invalid_request', 400);
    const choice = (name, list) => {
      const raw = params.get(name);
      if (raw === null || raw === '') return null;
      if (!/^[1-9]\d{0,5}$/.test(raw) || !list.some(x => x.id === Number(raw))) throw new QuranError('unavailable_resource', 400);
      return Number(raw);
    };
    const translation = choice('translation', data.translations);
    const recitation = choice('recitation', data.recitations);
    const tafsir = choice('tafsir', data.tafsirs);
    const query = new URLSearchParams({ fields: 'text_uthmani' });
    if (translation) query.set('translations', String(translation));
    if (recitation) query.set('audio', String(recitation));
    const path = `verses/by_key/${key}?${query}`;
    let verse = cache.get(path);
    if (!verse || now() >= verse.expires) {
      const response = await content(path);
      const source = response.verse;
      if (source?.verse_key !== key || typeof source.text_uthmani !== 'string') throw new QuranError('provider_unavailable');
      verse = { value: {
        key, arabic: source.text_uthmani, chapter: chapter.id, chapterName: chapter.name,
        page: Math.ceil(Number(match[2]) / 20),
        translation: (source.translations || []).find(x => x.resource_id === translation)?.text || null,
        audio: audioUrl(source.audio?.url),
      }, expires: now() + 300000 };
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      cache.set(path, verse);
    }
    const [notesResponse, tafsirResponse] = await Promise.all([
      translation ? content(`quran/translations/${translation}?verse_key=${key}&foot_notes=true`).catch(() => null) : Promise.resolve({ translations: [] }),
      tafsir ? content(`quran/tafsirs/${tafsir}?verse_key=${key}`).catch(() => null) : Promise.resolve({ tafsirs: [] }),
    ]);
    const translationEntry = notesResponse?.translations?.find(x => x.verse_key === key && x.resource_id === translation);
    const translationText = translationEntry?.text || verse.value.translation || '';
    // QF translation HTML references its separate footnote endpoint using
    // <sup foot_note=254690>1</sup>; never accept arbitrary footnote IDs from a user.
    const references = [...translationText.matchAll(/<sup\b([^>]*)>([\s\S]*?)<\/sup>/gi)]
      .map(match => {
        const id = /\bfoot_note\s*=\s*(?:"([1-9]\d{0,7})"|'([1-9]\d{0,7})'|([1-9]\d{0,7}))/i.exec(match[1]);
        const label = match[2].replace(/<[^>]*>/g, '').trim();
        return id && /^\d{1,2}$/.test(label) ? {sourceId:id[1] || id[2] || id[3],label} : null;
      }).filter(Boolean).filter((reference,index,all) => all.findIndex(other => other.sourceId === reference.sourceId) === index);
    const included = references.slice(0, 8);
    const directNotes = translationEntry?.foot_notes || {};
    const referenced = await Promise.all(included.map(async reference => {
      const direct = directNotes[reference.sourceId];
      if (typeof direct === 'string' && direct.length <= 10000) return {id:reference.label,text:direct};
      const path = `foot_notes/${reference.sourceId}`;
      let note = cache.get(path);
      try {
        if (!note || now() >= note.expires) {
          const response = await content(path);
          const source = response.foot_note;
          if (String(source?.id) !== reference.sourceId || typeof source.text !== 'string' || source.text.length > 10000) return null;
          note = {value:source.text,expires:now() + 300000};
          if (cache.size >= 24) cache.delete(cache.keys().next().value);
          cache.set(path,note);
        }
        return {id:reference.label,text:note.value};
      } catch { return null; }
    }));
    const footnotes = references.length ? referenced.filter(Boolean) : Object.entries(directNotes)
      .filter(([id,text]) => /^\d{1,6}$/.test(id) && typeof text === 'string' && text.length <= 10000)
      .slice(0, 8).map(([id,text]) => ({id,text}));
    const footnotesIncomplete = references.length > included.length || referenced.some(note => note === null) ||
      (!references.length && Object.keys(directNotes).length > 8);
    const tafsirEntry = tafsirResponse?.tafsirs?.find(x => x.resource_id === tafsir && (!x.verse_key || x.verse_key === key));
    const commentary = typeof tafsirEntry?.text === 'string' && tafsirEntry.text.length <= 250000 ? tafsirEntry.text : null;
    return {
      ...verse.value,
      translation: translationText,
      translationSource: data.translations.find(x => x.id === translation) || null,
      footnotes, footnotesAvailable: references.length ? footnotes.length > 0 : Boolean(notesResponse),
      footnotesIncomplete,
      tafsir: commentary, tafsirSource: data.tafsirs.find(x => x.id === tafsir) || null,
      tafsirAvailable: Boolean(tafsirResponse),
      reciter: data.recitations.find(x => x.id === recitation) || null,
    };
  }
  return { bootstrap, verses, ayah, chapterInfo, chapterAudio, navigate };
}
export function audioUrl(path) {
  if (typeof path !== 'string') return null;
  try {
    const url = new URL(path.startsWith('//') ? 'https:' + path : path, 'https://verses.quran.com/');
    return url.protocol === 'https:' && !url.port && verseAudioHosts.includes(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function wordAudioUrl(path) {
  if (typeof path !== 'string') return null;
  try {
    const url = new URL(path.startsWith('//') ? 'https:' + path : path, 'https://audio.qurancdn.com/');
    return url.protocol === 'https:' && !url.port && wordAudioHosts.includes(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function chapterAudioUrl(path) {
  if (typeof path !== 'string' || !/^https:\/\//i.test(path)) return null;
  try {
    const url = new URL(path);
    return url.protocol === 'https:' && !url.port && chapterAudioHosts.includes(url.hostname) && !url.username && !url.password ? url.href : null;
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
    if (url.pathname === '/api/quran/ayah') return send(await client.ayah(url.searchParams));
    if (url.pathname === '/api/quran/chapter') return send(await client.chapterInfo(url.searchParams));
    if (url.pathname === '/api/quran/chapter-audio') return send(await client.chapterAudio(url.searchParams));
    if (url.pathname === '/api/quran/navigate') return send(await client.navigate(url.searchParams));
    return send({ error: 'not_found' }, 404);
  } catch (e) {
    const knownProblem = /Illegal invocation/.test(e?.message || '') ? 'fetch_binding' : /redirect/i.test(e?.message || '') ? 'redirect_mode' : /AbortSignal/.test(e?.message || '') ? 'timeout_api' : /different request|request.*context/i.test(e?.message || '') ? 'request_context' : /timeout/i.test(e?.name || '') ? 'timeout' : 'unclassified';
    console.error('[quran]', JSON.stringify({ code: e instanceof QuranError ? e.code : 'runtime_error', errorType: e?.name, knownProblem }));
    return send({ error: e instanceof QuranError ? e.code : 'provider_unavailable' }, e instanceof QuranError ? e.status : 502);
  }
}
