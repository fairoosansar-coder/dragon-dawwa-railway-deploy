import test from 'node:test';
import assert from 'node:assert/strict';
import {studyResponse} from '../server/study.mjs';
import {createQuranAiProvider, QuranAiError} from '../server/quran-ai.mjs';
import {createGeminiStudyProvider, GeminiStudyError} from '../server/gemini-study.mjs';
import {actorOne, actorTwo, createStudyDatabase, evidence, environment, geminiMock, quranMock, request, seedProfile, wavFixture} from '../tests/study-fixtures.mjs';

function setup(options = {}) {
  const {db, sql} = createStudyDatabase();
  seedProfile(sql, actorOne);
  seedProfile(sql, actorTwo, 'ta');
  const quran = options.quran || quranMock(options.evidence || evidence());
  const geminiState = options.geminiState || geminiMock(options.geminiOptions);
  const env = environment({db, quran, gemini: geminiState.provider, ...options.env});
  return {db, sql, quran, gemini: geminiState, env};
}

test('Quran.ai MCP fixture follows the current live schema/order and uses only read-only tools', async () => {
  const calls = [];
  const client = {
    async connect() { calls.push({name: 'connect'}); },
    async close() { calls.push({name: 'close'}); },
    async listTools() {
      calls.push({name: 'listTools'});
      return {tools: ['fetch_grounding_rules', 'list_editions', 'search_quran', 'fetch_quran', 'fetch_translation', 'fetch_tafsir'].map(name => ({name, annotations: {readOnlyHint: true}}))};
    },
    async callTool({name, arguments: args}) {
      calls.push({name, args});
      if (name === 'fetch_grounding_rules') return {content: [{type: 'text', text: 'Grounding instructions: '+('source first; '.repeat(500))+'<grounding_nonce>fixture-nonce</grounding_nonce>'}]};
      if (name === 'list_editions') {
        const fixture = args.edition_type === 'quran' ? {editions: [{id: 'ar-uthmani-hafs', title: 'Uthmani Hafs'}]} :
          args.edition_type === 'translation' ? {editions: [{id: 'en-fixture', title: 'English Fixture'}]} : {editions: [{id: 'en-tafsir-fixture', title: 'English Fixture Tafsir'}]};
        return {structuredContent: fixture};
      }
      const edition = name === 'fetch_quran' ? 'ar-uthmani-hafs' : name === 'fetch_translation' ? 'en-fixture' : 'en-tafsir-fixture';
      return {structuredContent: {
        ayahs: [args.ayahs],
        results: {[edition]: [{ayah: args.ayahs, text: `${name} exact fixture text`, citation_url: name === 'fetch_quran' ? null : `https://quran.com/1/1?edition=${edition}`}]},
        pagination: {total: 1}, warnings: [], grounding_rules: null,
      }};
    },
  };
  const provider = createQuranAiProvider({}, {clientFactory: () => client, transportFactory: () => ({})});
  const packet = await provider.retrieve({verse: '1:1', question: '', language: 'ta'});
  assert.equal(packet.sources[0].edition, 'ar-uthmani-hafs');
  assert.deepEqual(calls.filter(call => call.name === 'list_editions').map(call => call.args), [{edition_type: 'quran'}, {edition_type: 'translation'}, {edition_type: 'tafsir'}]);
  const toolNames = calls.filter(call => call.args).map(call => call.name);
  assert.deepEqual(toolNames, ['fetch_grounding_rules', 'list_editions', 'list_editions', 'list_editions', 'fetch_quran', 'fetch_translation', 'fetch_tafsir']);
  for (const call of calls.filter(call => ['fetch_quran', 'fetch_translation', 'fetch_tafsir'].includes(call.name))) assert.equal(call.args.grounding_nonce, 'fixture-nonce');
  assert.equal(calls.some(call => call.name === 'search_quran' || call.name === 'submit_feedback'), false);
});

test('free-form question searches a discovered read-only verse then fetches named canonical editions rather than using snippets', async () => {
  const calls = [];
  const client = {async connect() {}, async close() {}, async listTools() { return {tools: ['fetch_grounding_rules', 'list_editions', 'search_quran', 'fetch_quran', 'fetch_translation', 'fetch_tafsir'].map(name => ({name, annotations: {readOnlyHint: true}}))}; }, async callTool({name, arguments: args}) {
    calls.push({name, args});
    if (name === 'fetch_grounding_rules') return {content: [{type: 'text', text: '<grounding_nonce>fixture-nonce</grounding_nonce>'}]};
    if (name === 'list_editions') return {structuredContent: {editions: [{id: args.edition_type === 'quran' ? 'ar-uthmani-hafs' : args.edition_type === 'translation' ? 'en-fixture' : 'en-tafsir-fixture', title: args.edition_type === 'quran' ? 'Arabic Quran' : args.edition_type === 'translation' ? 'English translation' : 'English tafsir', language: args.edition_type === 'quran' ? 'ar' : 'en'}]}};
    if (name === 'search_quran') return {structuredContent: {results: [{rank: 1, ayah_key: '1:1', text: 'untrusted search snippet'}], grounding_rules: null}};
    const edition = name === 'fetch_quran' ? 'ar-uthmani-hafs' : name === 'fetch_translation' ? 'en-fixture' : 'en-tafsir-fixture';
    return {structuredContent: {results: {[edition]: [{ayah:'1:1', text:`${name} canonical fixture text`}]}, grounding_rules: null}};
  }};
  const provider = createQuranAiProvider({}, {clientFactory: () => client, transportFactory: () => ({})});
  const result = await provider.retrieve({question: 'What is mercy?', language: 'en'});
  assert.equal(result.verse, '1:1');
  assert.equal(result.discovery, 'semantic_search');
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources.some(source => source.quote.includes('untrusted search snippet')), false);
  assert.deepEqual(calls.filter(item=>item.name.startsWith('fetch_') && item.name !== 'fetch_grounding_rules').map(item=>item.name), ['fetch_quran','fetch_translation','fetch_tafsir']);
  assert.equal(calls.find(item=>item.name==='search_quran').args.grounding_nonce, 'fixture-nonce');
});

test('Gemini unary Interactions speech reads only an observed audio/wav step and keeps the API key out of the URL', async () => {
  const bytes=Buffer.alloc(44);bytes.write('RIFF',0,'ascii');bytes.write('WAVE',8,'ascii');
  const fetcher=async (url,options)=>{
    assert.equal(url.includes('mock-key'),false);
    assert.equal(options.headers['x-goog-api-key'],'mock-key');
    return Response.json({steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:bytes.toString('base64')}]}]});
  };
  const provider=createGeminiStudyProvider({GEMINI_API_KEY:'mock-key',STUDY_LIVE_CANARY:'true',STUDY_LIVE_CANARY_USER_ID:'fixture-user'},{id:'fixture-user'},fetcher);
  const output=await provider.synthesize({text:'Short fixture text.',language:'en',voice:'Kore'});
  assert.ok(output.bytes.equals(bytes));
  assert.equal(output.model,'gemini-3.8-flash-lite-tts');
});

test('generation stores only its structured answer/source packet, keeps history owner-only, and exposes the exact contract', async () => {
  const f = setup();
  const generated = await request(studyResponse, '/api/study/generate', actorOne, {question: 'A private fixture question', verse: '1:1', language: 'ta', saveHistory: true}, f.env);
  assert.equal(generated.status, 201);
  assert.deepEqual(Object.keys(generated.data).sort(), ['disclosure', 'generatedAt', 'id', 'language', 'paragraphs', 'sources']);
  assert.equal(generated.data.language, 'ta');
  assert.match(generated.data.disclosure, /AI-generated study explanation/);
  assert.match(generated.data.disclosure, /not a verified translation of tafsir/);
  assert.equal(f.quran.calls.length, 1);
  assert.equal(JSON.stringify(f.quran.calls[0]).includes(actorOne.id), false);
  assert.match(f.gemini.calls.explain[0].prompt, /UNTRUSTED SOURCE DATA/);
  const columns = f.sql.prepare('PRAGMA table_info(study_responses)').all().map(row => row.name);
  assert.equal(columns.includes('question'), false);
  const privateCitation = generated.data.sources.find(source => source.url.startsWith('/api/study/evidence/'));
  assert.ok(privateCitation, 'a missing provider citation must resolve through private stored evidence, not the MCP homepage');
  const evidenceResponse = await request(studyResponse, privateCitation.url, actorOne, undefined, f.env);
  assert.equal(evidenceResponse.status, 200);
  assert.equal(evidenceResponse.data.source.id, privateCitation.id);
  assert.equal(evidenceResponse.data.source.quote, privateCitation.quote);
  assert.equal(typeof evidenceResponse.data.retrievedAt, 'string');
  assert.equal((await request(studyResponse, privateCitation.url, actorTwo, undefined, f.env)).status, 404);
  const own = await request(studyResponse, '/api/study/history?limit=20', actorOne, undefined, f.env);
  const other = await request(studyResponse, '/api/study/history?limit=20', actorTwo, undefined, f.env);
  assert.equal(own.data.items.length, 1);
  assert.equal(other.data.items.length, 0);
  const report = await request(studyResponse, '/api/study/report', actorOne, {responseId: generated.data.id, reason: 'citation'}, f.env);
  assert.equal(report.status, 201);
  assert.deepEqual(report.data, {status: 'received'});
  const forgedReport = await request(studyResponse, '/api/study/report', actorTwo, {responseId: generated.data.id, reason: 'citation'}, f.env);
  assert.equal(forgedReport.status, 404);
});

test('citation membership is strict and provider failures release the atomic text reservation', async () => {
  const bad = geminiMock({explanation: {paragraphs: ['Synthetic'], citationIds: ['not-in-packet'], inference: true}});
  const f = setup({geminiState: bad});
  const invalid = await request(studyResponse, '/api/study/generate', actorOne, {question: 'Fixture', verse: '1:1', language: 'en', saveHistory: false}, f.env);
  assert.equal(invalid.status, 503);
  assert.deepEqual(invalid.data, {error: 'invalid_model_response'});
  const counters = f.sql.prepare('SELECT text_requests,text_input_chars FROM study_usage_daily').all();
  assert.deepEqual(counters.map(row => ({text_requests: row.text_requests, text_input_chars: row.text_input_chars})), [{text_requests: 0, text_input_chars: 0}, {text_requests: 0, text_input_chars: 0}]);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM study_responses').get().n, 0);
});

test('normal runtime refuses Google generation until an explicit controlled canary is configured', async () => {
  const {db, sql} = createStudyDatabase();
  seedProfile(sql, actorOne);
  const env = {DB: db, MANUS_JWT_SECRET: 'synthetic-study-secret-with-at-least-sixteen-characters', QURAN_PROVIDER: quranMock()};
  const output = await request(studyResponse, '/api/study/generate', actorOne, {question: 'Fixture', verse: '1:1', language: 'en', saveHistory: false}, env);
  assert.equal(output.status, 503);
  assert.deepEqual(output.data, {error: 'provider_not_enabled'});
  assert.equal(sql.prepare('SELECT SUM(text_requests) AS n FROM study_usage_daily').get().n, 0);
});

test('private study availability stays off without the exact owner canary, key, usable limit and profile', async () => {
  const f = setup();
  const path = '/api/study/availability';
  const available = async (env, actor = actorOne) => (await request(studyResponse, path, actor, undefined, env)).data;
  assert.deepEqual(await available(f.env), {enabled: false});
  const live = {...f.env, STUDY_LIVE_CANARY: 'true', STUDY_LIVE_CANARY_USER_ID: actorOne.id,
    GEMINI_API_KEY: 'synthetic-only', STUDY_USAGE_LIMITS: {studyRequestsPerDay: 2, speechRequestsPerDay: 0, maxConcurrentJobs: 0}};
  assert.deepEqual(await available(live), {enabled: true});
  assert.deepEqual(await available(live, actorTwo), {enabled: false});
  assert.deepEqual(await available({...live, GEMINI_API_KEY: ''}), {enabled: false});
  assert.deepEqual(await available({...live, STUDY_USAGE_LIMITS: {studyRequestsPerDay: 0}}), {enabled: false});
  const noProfile = setup();
  noProfile.sql.prepare('DELETE FROM member_profiles WHERE user_id=?').run(actorOne.id);
  assert.deepEqual(await available({...live, DB: noProfile.db}), {enabled: false});
  assert.equal((await request(studyResponse, path, null, undefined, live)).status, 401);
  assert.equal((await studyResponse(new Request('https://study.test' + path, {method: 'POST'}), live, actorOne)).status, 405);
});

test('narration is idempotent, private, WAV-only, and durable job state reaches ready once', async () => {
  const f = setup();
  const generated = await request(studyResponse, '/api/study/generate', actorOne, {question: 'zzprivatequestiontoken', verse: '1:1', language: 'en', saveHistory: false}, f.env);
  const first = await request(studyResponse, '/api/study/narrate', actorOne, {responseId: generated.data.id}, f.env);
  const second = await request(studyResponse, '/api/study/narrate', actorOne, {responseId: generated.data.id}, f.env);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.data, second.data);
  assert.equal(f.gemini.calls.synthesize.length, 1);
  assert.match(f.gemini.calls.synthesize[0].text, /Synthetic explanation/);
  assert.equal(f.gemini.calls.synthesize[0].text.includes('zzprivatequestiontoken'), false, 'narration does not accept or include arbitrary client question text');
  const job = f.sql.prepare('SELECT status,attempt_count FROM study_audio_jobs').get();
  assert.deepEqual({status: job.status, attempt_count: job.attempt_count}, {status: 'ready', attempt_count: 1});
  const ownAudio = await request(studyResponse, first.data.audioUrl, actorOne, undefined, f.env);
  assert.equal(ownAudio.status, 200);
  assert.equal(ownAudio.response.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(Buffer.from(await ownAudio.response.arrayBuffer()), wavFixture());
  const otherAudio = await request(studyResponse, first.data.audioUrl, actorTwo, undefined, f.env);
  assert.equal(otherAudio.status, 404);
});

test('a failed audio job allows at most two explicit user-triggered attempts, not automatic retries', async () => {
  const failure = new GeminiStudyError('provider_unavailable', 503);
  const f = setup({geminiOptions: {synthesizeError: failure}});
  const generated = await request(studyResponse, '/api/study/generate', actorOne, {question: 'Fixture', verse: '1:1', language: 'en', saveHistory: false}, f.env);
  assert.equal((await request(studyResponse, '/api/study/narrate', actorOne, {responseId: generated.data.id}, f.env)).status, 503);
  assert.equal((await request(studyResponse, '/api/study/narrate', actorOne, {responseId: generated.data.id}, f.env)).status, 503);
  const exhausted = await request(studyResponse, '/api/study/narrate', actorOne, {responseId: generated.data.id}, f.env);
  assert.equal(exhausted.status, 429);
  assert.deepEqual(exhausted.data, {error: 'audio_retry_exhausted'});
  assert.equal(f.gemini.calls.synthesize.length, 2);
  const job = f.sql.prepare('SELECT status,attempt_count FROM study_audio_jobs').get();
  assert.deepEqual({status: job.status, attempt_count: job.attempt_count}, {status: 'failed', attempt_count: 2});
});

test('transcription accepts only bounded WebM and returns text for the grounded generate path', async () => {
  const f = setup();
  const form = new FormData();
  form.set('audio', new File([Buffer.from('fixture-webm')], 'study-question.webm', {type: 'audio/webm'}));
  form.set('language', 'en');
  const headers = {origin: 'https://study.test', 'sec-fetch-site': 'same-origin'};
  const response = await studyResponse(new Request('https://study.test/api/study/transcribe', {method: 'POST', headers, body: form}), f.env, actorOne);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {transcript: 'Synthetic transcription'});
  assert.equal(f.gemini.calls.transcribe.length, 1);
  const wrong = await studyResponse(new Request('https://study.test/api/study/transcribe', {method: 'POST', headers: {...headers, 'content-type': 'audio/ogg'}, body: Buffer.from('fixture')}), f.env, actorOne);
  assert.equal(wrong.status, 415);
});

test('Google rate limiting and transport timeout fail closed without revealing its protected API key', async () => {
  const env = {GEMINI_API_KEY: 'synthetic-do-not-log', STUDY_LIVE_CANARY: 'true', STUDY_LIVE_CANARY_USER_ID: actorOne.id, STUDY_GEMINI_TIMEOUT_MS: '1000'};
  const observed = [];
  const denied = createGeminiStudyProvider(env, actorOne, async (url, init) => {
    observed.push({url, header: init.headers['x-goog-api-key']});
    return new Response('{}', {status: 429});
  });
  await assert.rejects(denied.explain({prompt: 'synthetic fixture only'}), error => error instanceof GeminiStudyError && error.code === 'provider_rate_limited' && error.status === 429);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].header, 'synthetic-do-not-log');
  assert.equal(observed[0].url.includes('synthetic-do-not-log'), false);
  const hanging = createGeminiStudyProvider(env, actorOne, async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})), {once: true});
  }));
  await assert.rejects(hanging.explain({prompt: 'synthetic fixture only'}), error => error instanceof GeminiStudyError && error.code === 'provider_timeout' && error.status === 503);
});

test('a bare Gemini enable flag without an exact verified-account ID denies every paid request', async () => {
  let networkCalls = 0;
  const provider = createGeminiStudyProvider({GEMINI_API_KEY:'synthetic-do-not-log', STUDY_LIVE_CANARY:'true'}, actorOne, async () => {networkCalls++; throw new Error('must not reach network');});
  await assert.rejects(provider.explain({prompt:'synthetic fixture only'}), error => error instanceof GeminiStudyError && error.code === 'provider_not_enabled');
  assert.equal(networkCalls,0);
});

test('Quran.ai outage returns an honest source error before reserving a Google request', async () => {
  const f = setup({quran: {async retrieve() { throw new QuranAiError('source_timeout', 503); }}});
  const result = await request(studyResponse, '/api/study/generate', actorOne, {question: 'Synthetic fixture', verse: '1:1', language: 'ta', saveHistory: false}, f.env);
  assert.equal(result.status, 503);
  assert.deepEqual(result.data, {error: 'source_timeout'});
  assert.equal(f.gemini.calls.explain.length, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM study_usage_daily').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM study_responses').get().n, 0);
});

console.log('Study checks use SQLite and controlled mock MCP/Gemini providers only. They do not invoke Quran.ai or paid Google generation, do not verify Google account privacy/tier, and do not prove native-language quality or live private-audio playback.');
