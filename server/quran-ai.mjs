// Quran.ai is consumed only as a server-side, read-only MCP client. No caller cookies,
// member IDs, contact values, Quran Foundation credentials, or arbitrary tool names travel upstream.
// SDK 1.30.0 exposes these classes as named ESM exports at the official pinned paths.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHash} from 'node:crypto';

const MCP_ORIGIN = 'https://mcp.quran.ai';
const READ_TOOLS = new Set(['fetch_grounding_rules', 'list_editions', 'search_quran', 'fetch_quran', 'fetch_translation', 'fetch_tafsir']);
const MAX_RANGE_AYAHS = 5;
const MAX_SOURCE_CHARS = 5_000;
const DEFAULT_TIMEOUT_MS = 9_000;

export class QuranAiError extends Error {
  constructor(code = 'source_unavailable', status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status) => { throw new QuranAiError(code, status); };
const clip = (value, length) => String(value || '').replace(/\u0000/g, '').trim().slice(0, length);

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return ''; }
}

function resultValue(result) {
  const structured = result?.structuredContent ?? result?.structured_content;
  if (structured !== undefined) return structured;
  const text = (Array.isArray(result?.content) ? result.content : [])
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text).join('\n');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {text}; }
}

function resultText(result, maximum = MAX_SOURCE_CHARS) {
  const content = (Array.isArray(result?.content) ? result.content : [])
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text).join('\n');
  const structured = result?.structuredContent ?? result?.structured_content;
  return clip(content || safeJson(structured), maximum);
}

function timeout(promise, milliseconds, abortController) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        abortController?.abort();
        reject(new QuranAiError('source_timeout', 503));
      }, milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function canonicalAyahRange(value) {
  if (typeof value !== 'string' || value.length > 24) fail('invalid_verse', 400);
  const match = value.trim().match(/^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!match) fail('invalid_verse', 400);
  const surah = Number(match[1]), first = Number(match[2]), last = Number(match[3] || match[2]);
  // The hosted source remains the authority for actual verse counts. These bounds prevent
  // broad or malformed retrieval before the request leaves this application.
  if (surah < 1 || surah > 114 || first < 1 || first > 300 || last < first || last > 300 || last - first + 1 > MAX_RANGE_AYAHS)
    fail('invalid_verse', 400);
  return `${surah}:${first}${last === first ? '' : `-${last}`}`;
}

function flattenEditions(value) {
  const output = [];
  const seen = new Set();
  const walk = (node, depth = 0) => {
    if (!node || depth > 7) return;
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (typeof node !== 'object') return;
    const id = node.id ?? node.edition_id ?? node.slug ?? node.key;
    if (typeof id === 'string' && /^[A-Za-z0-9._-]{1,160}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      output.push({
        id,
        title: clip(node.title ?? node.name ?? node.display_name ?? id, 220) || id,
        language: clip(node.language ?? node.language_code ?? node.lang ?? '', 32).toLowerCase(),
        type: clip(node.type ?? node.kind ?? node.category ?? node.edition_type ?? '', 64).toLowerCase(),
      });
    }
    for (const child of Object.values(node)) walk(child, depth + 1);
  };
  walk(value);
  return output;
}

function editionMatches(edition, type) {
  // A translation's descriptive title can contain "commentary" without being tafsir.
  // The live list_editions request type is authoritative, not fuzzy title matching.
  return edition.type === type;
}

function configuredEdition(editions, configured, kind) {
  if (!configured) return null;
  const found = editions.find(item => item.id === configured);
  if (!found) fail('source_edition_unavailable', 503);
  if (kind && !editionMatches(found, kind)) fail('source_edition_unavailable', 503);
  return found;
}

function chooseEdition(editions, config, language, kind) {
  const configured = configuredEdition(editions, kind === 'tafsir' ? config.STUDY_TAFSIR_EDITION : config[`STUDY_TRANSLATION_${language.toUpperCase()}`], kind);
  if (configured) return configured;
  const languageAliases = language === 'si' ? ['si', 'sinhala'] : language === 'ta' ? ['ta', 'tamil'] : ['en', 'english'];
  const candidates = editions.filter(item => editionMatches(item, kind));
  // Live-verified at 1:1: this named English tafsir returns a complete short passage;
  // English Ibn Kathir and Ma'arif passages are tens of thousands of characters.
  if (kind === 'tafsir') {
    const concise = candidates.find(item => item.id === 'en-tazkirul-quran');
    if (concise) return concise;
  }
  return candidates.find(item => languageAliases.some(alias => item.language === alias || item.title.toLowerCase().includes(alias))) ||
    (language !== 'en' ? candidates.find(item => item.language === 'en' || item.title.toLowerCase().includes('english')) : null) || null;
}

function chooseQuranEdition(editions, config) {
  const configured = configuredEdition(editions, config.STUDY_QURAN_EDITION);
  if (configured) return configured;
  // This is only a preference after live discovery; it is never used unless the current
  // upstream catalogue explicitly reports the current hosted default Arabic edition.
  const preferred = editions.find(item => item.type === 'quran' && item.id === 'ar-uthmani-hafs');
  if (preferred) return preferred;
  return editions.find(item => item.type === 'quran' && /arabic|\bar\b/.test(`${item.language} ${item.title}`.toLowerCase())) || null;
}

function rangeKeys(verse) {
  const match = verse.match(/^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!match) fail('source_unavailable', 503);
  const surah = Number(match[1]), first = Number(match[2]), last = Number(match[3] || match[2]);
  return Array.from({length: last - first + 1}, (_, index) => `${surah}:${first + index}`);
}

function citationUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !['quran.com', 'www.quran.com', 'mcp.quran.ai'].includes(url.hostname) || (url.hostname === 'mcp.quran.ai' && url.pathname === '/')) return null;
    return url.toString();
  } catch { return null; }
}

function source(id, category, edition, verse, result) {
  const value = resultValue(result);
  // Hosted MCP returns current rules in the envelope. Rules must have been supplied by the
  // dedicated first call; a non-null copy here makes the response/schema incompatible.
  if (!value || typeof value !== 'object' || value.grounding_rules !== null) fail('source_grounding_unavailable', 503);
  const editionResults = value?.results?.[edition.id];
  if (!Array.isArray(editionResults)) fail('source_unavailable', 503);
  const entries = rangeKeys(verse).map(ayah => {
    const entry = editionResults.find(item => item && (item.ayah === ayah || item.ayah_key === ayah || item.verse_key === ayah || Array.isArray(item.ayahs) && item.ayahs.includes(ayah)));
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) fail('source_unavailable', 503);
    return {text: entry.text.trim(), citationUrl: citationUrl(entry.citation_url)};
  });
  // Never render an MCP JSON envelope as a quotation and never silently truncate an exact quote.
  const quote = entries.map(entry => entry.text).join('\n');
  if (!quote || quote.length > 900) fail('source_quote_too_large', 503);
  const [surah, ayahPart] = verse.split(':');
  const fallback = category === 'quran' ? `https://quran.com/${surah}/${ayahPart.split('-')[0]}` : null;
  const hasProviderCitation = Boolean(entries.find(entry => entry.citationUrl));
  return {
    id,
    category,
    title: !hasProviderCitation && fallback ? `${edition.title} (verse context)` : edition.title,
    edition: edition.id,
    verse,
    // For a source without a provider-issued citation URL, study.mjs substitutes a private
    // stored-evidence endpoint. Quran.com is only a labelled verse-context fallback for Quran.
    url: entries.find(entry => entry.citationUrl)?.citationUrl || fallback,
    quote,
  };
}

function noErrorResult(result) {
  if (result?.isError) fail('source_unavailable', 503);
  return result;
}

/**
 * Create a narrowly scoped public Quran.ai MCP client. `deps` exists solely for controlled
 * fixtures: a production call uses the pinned SDK and the public upstream directly.
 */
export function createQuranAiProvider(config = {}, deps = {}) {
  const clientFactory = deps.clientFactory || (() => new Client({name: 'dragon-dawwa-study', version: '1.0.0'}));
  const transportFactory = deps.transportFactory || ((abortController) => new StreamableHTTPClientTransport(new URL(MCP_ORIGIN), {
    requestInit: {signal: abortController.signal},
    reconnectionOptions: {maxRetries: 0, initialReconnectionDelay: 250, maxReconnectionDelay: 500, reconnectionDelayGrowFactor: 1},
  }));
  const timeoutMs = Math.max(1_000, Math.min(Number(config.STUDY_QURAN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 15_000));

  return {
    async retrieve({verse, question, language}) {
      const abortController = new AbortController();
      const client = clientFactory();
      const transport = transportFactory(abortController);
      let phase = 'connect';
      const call = async (name, args) => {
        phase = name;
        if (!READ_TOOLS.has(name)) fail('source_unavailable', 503);
        try { return noErrorResult(await timeout(client.callTool({name, arguments: args}), timeoutMs, abortController)); }
        catch (error) {
          if (error instanceof QuranAiError) throw error;
          throw new QuranAiError('source_unavailable', 503);
        }
      };
      try {
        await timeout(client.connect(transport), timeoutMs, abortController);
        phase = 'list_tools';
        const listed = await timeout(client.listTools(), timeoutMs, abortController);
        for (const required of READ_TOOLS) {
          const tool = (listed?.tools || []).find(item => item?.name === required);
          if (!tool?.annotations?.readOnlyHint) fail('source_capability_unavailable', 503);
        }

        // Session ordering is deliberate: current grounding rules/nonce first, current edition
        // catalogue next, then canonical text/translation and only then tafsir.
        const grounding = await call('fetch_grounding_rules', {});
        const rules = resultText(grounding, 40_000);
        const nonceMatch = rules.match(/<grounding_nonce>\s*([^<\s]{1,500})\s*<\/grounding_nonce>/i);
        if (!nonceMatch) fail('source_grounding_unavailable', 503);
        const groundingNonce = nonceMatch[1];
        // The live schema requires the declared edition type; it does not accept the grounding
        // nonce on this discovery tool. Do not reuse stale edition IDs from old setup examples.
        const editionResults = [];
        for (const editionType of ['quran', 'translation', 'tafsir'])
          editionResults.push({editionType, result: await call('list_editions', {edition_type: editionType})});
        const editions = editionResults.flatMap(({editionType, result}) => flattenEditions(resultValue(result)).map(edition => ({
          ...edition,
          // Some current edition objects omit their own kind because list_editions already
          // scopes it. Preserve that authoritative request type for safe selection.
          type: edition.type || editionType,
        })));
        if (!editions.length) fail('source_edition_unavailable', 503);

        let selectedVerse = verse ? canonicalAyahRange(verse) : null;
        if (!selectedVerse) {
          if (typeof question !== 'string' || !question.trim() || question.length > 600) fail('source_search_unavailable', 503);
          // Search is discovery only: snippets never become quotations or tafsir. Fetch the
          // selected exact ayah from every canonical named edition before generation.
          const found = resultValue(await call('search_quran', {query: question.trim(), grounding_nonce: groundingNonce}));
          if (found?.grounding_rules !== null || !Array.isArray(found?.results)) fail('source_search_unavailable', 503);
          const candidate = found.results.find(item => typeof item?.ayah_key === 'string' && /^\d{1,3}:\d{1,3}$/.test(item.ayah_key));
          if (!candidate) fail('source_search_unavailable', 503);
          selectedVerse = canonicalAyahRange(candidate.ayah_key);
        }

        const quranEdition = chooseQuranEdition(editions, config);
        const translationEdition = chooseEdition(editions, config, language, 'translation');
        let tafsirEdition = chooseEdition(editions, config, 'en', 'tafsir');
        if (!quranEdition || !translationEdition || !tafsirEdition) fail('source_edition_unavailable', 503);

        const canonical = await call('fetch_quran', {ayahs: selectedVerse, editions: quranEdition.id, grounding_nonce: groundingNonce});
        const translation = await call('fetch_translation', {ayahs: selectedVerse, editions: translationEdition.id, grounding_nonce: groundingNonce});
        let tafsir = await call('fetch_tafsir', {ayahs: selectedVerse, editions: tafsirEdition.id, grounding_nonce: groundingNonce});
        let tafsirSource;
        let substitutedEdition = false;
        try {
          tafsirSource = source(`tafsir:${tafsirEdition.id}:${selectedVerse}`, 'tafsir', tafsirEdition, selectedVerse, tafsir);
        } catch (error) {
          if (!(error instanceof QuranAiError) || !['source_quote_too_large','source_unavailable'].includes(error.code) || config.STUDY_TAFSIR_EDITION) throw error;
          const alternate = editions.find(item => item.id === 'ar-muyassar' && item.type === 'tafsir');
          if (!alternate || alternate.id === tafsirEdition.id) throw error;
          tafsirEdition = alternate;
          tafsir = await call('fetch_tafsir', {ayahs: selectedVerse, editions: alternate.id, grounding_nonce: groundingNonce});
          tafsirSource = source(`tafsir:${alternate.id}:${selectedVerse}`, 'tafsir', alternate, selectedVerse, tafsir);
          substitutedEdition = true;
        }

        phase = 'assemble_sources';
        if (config.STUDY_SOURCE_DEBUG === 'true') {
          for (const [name, edition, result] of [['quran', quranEdition, canonical], ['translation', translationEdition, translation], ['tafsir', tafsirEdition, tafsir]]) {
            const value = resultValue(result);
            const items = value?.results?.[edition.id];
            console.error('[quran.ai] '+JSON.stringify({name, edition:edition.id, envelopeKeys:Object.keys(value||{}), resultKeys:Object.keys(value?.results||{}), matchesEdition:Array.isArray(items), firstFields:Array.isArray(items)&&items[0]?Object.keys(items[0]):[], firstReference:Array.isArray(items)&&items[0]?{ayah:items[0].ayah,ayahs:items[0].ayahs,range:items[0].range,passage:items[0].passage_ayah_range,quoteLength:items[0].text?.length}:null}));
          }
        }
        const sources = [
          source(`quran:${quranEdition.id}:${selectedVerse}`, 'quran', quranEdition, selectedVerse, canonical),
          source(`translation:${translationEdition.id}:${selectedVerse}`, 'translation', translationEdition, selectedVerse, translation),
          tafsirSource,
        ];
        return {
          verse: selectedVerse,
          discovery: verse ? 'selected_verse' : 'semantic_search',
          substitutedEdition,
          retrievedAt: new Date().toISOString(),
          sources,
          // This digest keys an exact, retrieved source/version packet without retaining a
          // member identifier or caller question in a cache key.
          sourceDigest: createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
        };
      } catch (error) {
        if (config.STUDY_SOURCE_DEBUG === 'true') console.error('[quran.ai] phase='+phase+' code='+(error instanceof QuranAiError ? error.code : 'provider_error'));
        throw error;
      } finally {
        abortController.abort();
        try { await client.close(); } catch { /* Connection cleanup must not replace a source result. */ }
      }
    },
  };
}
