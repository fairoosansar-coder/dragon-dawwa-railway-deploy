import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validatePodcastScript, PodcastValidationError, assertLineTranscriptMatch, assertReactionSpacing} from '../server/podcast/validation.mjs';
import {podcastLineCacheKey, createElevenLabsPodcastClient} from '../server/podcast/elevenlabs.mjs';
import {podcastPolicy} from '../server/podcast/policy.mjs';
import {memoryPrivateAudioStore, privateMp3Response, unavailablePrivateAudioStore, PodcastStorageError} from '../server/podcast/storage.mjs';
import {preflightPodcastEpisode, createPodcastWorker, PodcastWorkerError} from '../server/podcast/worker.mjs';
import {reservePodcastCredits, recordPodcastProviderJob, PodcastUsageError} from '../server/podcast/usage.mjs';
import {buildTimeline} from '../server/podcast/mix.mjs';
import {parseEbur128, assertBroadcastLoudness, parseSilences, assertNoUnexpectedLongSilence} from '../server/podcast/qa.mjs';
import {podcastAdminResponse} from '../server/podcast/api.mjs';

const cast = new Set(['amina', 'yusuf', 'hana', 'ibrahim', 'maryam', 'khalid']);
const claims = new Set(['claim-source-6306', 'claim-chain-6306']);

function script() {
  return {
    episode_id: 'bukhari-6306-ta', report_revision_id: 'report-revision-6306', language: 'ta', title: 'Synthetic Tamil fixture', recitation_after_line: 's1-02',
    segments: [{id: 's1', lines: [
      {id: 's1-01', speaker: 'yusuf', text: '[confidently] Synthetic sourced opening.', overlap_prev: false, sfx_before: 'page_turn', reactions: [{speaker: 'maryam', clip: 'oh', at: 0.7}], claim_ids: ['claim-source-6306']},
      {id: 's1-02', speaker: 'amina', text: '[calmly] Synthetic sourced response.', overlap_prev: false, claim_ids: ['claim-chain-6306']},
    ]}],
  };
}

function invalidation(mutator, expected) {
  const value = structuredClone(script()); mutator(value);
  assert.throws(() => validatePodcastScript(value, {castIds: cast, approvedClaimIds: claims}), error => error instanceof PodcastValidationError && error.code === expected);
}

test('podcast script accepts a fully cited permitted fixture and rejects every required forbidden condition before rendering', () => {
  const valid = validatePodcastScript(script(), {castIds: cast, approvedClaimIds: claims});
  assert.deepEqual({lineCount: valid.lineCount, sfxCount: valid.sfxCount, reactionCount: valid.reactionCount}, {lineCount: 2, sfxCount: 1, reactionCount: 1});
  invalidation(value => { value.segments[0].lines[0].text = '[whispering] prohibited'; }, 'whisper_tag_rejected');
  invalidation(value => { value.segments[0].lines[0].text = 'Arabic \u0627 is prohibited'; }, 'arabic_tts_rejected');
  invalidation(value => { value.segments[0].lines[0].text = 'Abbreviation (pbuh) is prohibited'; }, 'abbreviated_honorific_rejected');
  invalidation(value => { value.segments[0].lines[0].speaker = 'unknown'; }, 'unknown_speaker');
  invalidation(value => { value.segments[0].lines[0].claim_ids = ['claim-not-in-approved-report']; }, 'claim_not_approved');
  invalidation(value => { value.segments[0].lines[0].claim_ids = []; }, 'missing_claim_id');
  invalidation(value => { value.segments[0].lines[0].sfx_before = 'drum'; }, 'invalid_sfx');
  invalidation(value => { value.recitation_after_line = 'missing-line'; }, 'invalid_recitation_slot');
});

test('line transcript QA uses tag-free text and enforces the 85 percent threshold', () => {
  assert.ok(assertLineTranscriptMatch('[calmly] Exact source-grounded fixture.', 'Exact source grounded fixture') >= 0.85);
  assert.throws(() => assertLineTranscriptMatch('Exact source-grounded fixture.', 'Wrong unrelated words.'), error => error.code === 'line_transcript_mismatch');
  assert.deepEqual(assertReactionSpacing([1, 21, 41]), [1, 21, 41]);
  assert.throws(() => assertReactionSpacing([1, 20.9]), error => error.code === 'reaction_spacing_rejected');
});

test('render policy stays hard-off and the disabled worker makes zero provider calls', async () => {
  assert.deepEqual(podcastPolicy({}), {mode: 'disabled', creditCap: 0, storageProvider: null, reportAdapterConnected: false, storageApproved: false, ffmpegWorkerApproved: false, canRender: false, reason: 'podcast_disabled'});
  let calls = 0;
  const worker = createPodcastWorker({
    env: {PODCAST_RENDER_MODE: 'disabled'},
    repository: {async getEpisode() { calls++; return null; }},
    elevenlabs: {textToSpeech() { calls++; }}, audioStore: {}, castIds: cast,
  });
  await assert.rejects(worker.renderEpisode('bukhari-6306-ta'), error => error instanceof Error && error.code === 'podcast_disabled');
  assert.equal(calls, 0);
  const measurement = podcastPolicy({PODCAST_RENDER_MODE: 'cost_measurement', PODCAST_COST_MEASUREMENT_APPROVED: 'true', PODCAST_COST_MEASUREMENT_EPISODE_ID: 'bukhari-6306-ta', PODCAST_AUDIO_STORE_PROVIDER: 'r2', PODCAST_AUDIO_STORE_APPROVED: 'true', PODCAST_REPORT_ADAPTER_CONNECTED: 'true', PODCAST_FFMPEG_WORKER_APPROVED: 'true', PODCAST_DAILY_CREDIT_CAP: '100'}, 'bukhari-6306-ta');
  assert.equal(measurement.canRender, true);
  assert.equal(podcastPolicy({...measurement, PODCAST_RENDER_MODE: 'cost_measurement'}, 'another-episode').canRender, false);
});

test('preflight binds the script to an approved report and separate human gates without provider access', async () => {
  const episode = {id: 'bukhari-6306-ta', reportRevisionId: 'report-revision-6306', language: 'ta', scriptJson: JSON.stringify(script()), status: 'script_approved', languageReviewRequired: true, languageReviewerId: 'language-reviewer', recitationStatus: 'waived', recitationAssetId: null};
  const adapter = {async getApprovedRevision({reportRevisionId}) { return {id: reportRevisionId, status: 'approved', claimIds: [...claims], qualifiedReviewerId: 'hadith-reviewer', approvedAt: '2030-01-01T00:00:00.000Z'}; }};
  const result = await preflightPodcastEpisode({episode, reportAdapter: adapter, castIds: cast});
  assert.equal(result.validation.lineCount, 2);
  await assert.rejects(preflightPodcastEpisode({episode: {...episode, status: 'script_validated'}, reportAdapter: adapter, castIds: cast}), error => error instanceof PodcastWorkerError && error.code === 'script_not_approved');
  await assert.rejects(preflightPodcastEpisode({episode: {...episode, recitationStatus: 'ready'}, reportAdapter: adapter, castIds: cast}), error => error.code === 'recitation_asset_missing');
});

test('ElevenLabs client uses current verified endpoint/model fields under a local mock only', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url, options});
    if (url.endsWith('/v1/speech-to-text')) return Response.json({text: 'Synthetic transcript'}, {headers: {'request-id': 'stt-1'}});
    return new Response(Buffer.from('ID3synthetic'), {headers: {'character-cost': '12', 'request-id': 'tts-1'}});
  };
  const client = createElevenLabsPodcastClient({apiKey: 'synthetic-only-api-key', fetcher, baseUrl: 'https://provider.invalid'});
  const tts = await client.textToSpeech({voiceId: 'ql6Gx6v8qU9oflZLdTsZ', text: '[calmly] Synthetic.', languageCode: 'ta'});
  await client.music({prompt: 'vocal-only spiritual texture with no instruments, no drums, and no lyrics', lengthMs: 20_000});
  await client.soundEffect({prompt: 'quiet page turn', seconds: 2});
  const stt = await client.transcribe(Buffer.from('ID3synthetic'), 'ta');
  assert.equal(tts.credits, 12); assert.equal(stt.modelId, 'scribe_v2');
  assert.match(calls[0].url, /\/v1\/text-to-speech\/ql6Gx6v8qU9oflZLdTsZ\?output_format=mp3_44100_128$/);
  assert.equal(JSON.parse(calls[0].options.body).model_id, 'eleven_v4');
  assert.equal(JSON.parse(calls[1].options.body).model_id, 'music_v2_5');
  assert.equal(JSON.parse(calls[2].options.body).model_id, 'eleven_text_to_sound_v2');
  assert.match(calls[3].url, /\/v1\/speech-to-text$/);
  assert.equal(calls.some(call => call.url.includes('synthetic-only-api-key')), false);
  assert.throws(() => podcastLineCacheKey({language: 'ta', speaker: 'amina', voiceId: 'ql6Gx6v8qU9oflZLdTsZ', text: 'Arabic \u0627'}), error => error.code === 'arabic_tts_rejected');
  assert.equal(podcastLineCacheKey({language: 'ta', speaker: 'amina', voiceId: 'ql6Gx6v8qU9oflZLdTsZ', text: 'same'}), podcastLineCacheKey({language: 'ta', speaker: 'amina', voiceId: 'ql6Gx6v8qU9oflZLdTsZ', text: 'same'}));
});

test('private storage has opaque keys only and cannot fall back to a public URL', async () => {
  const store = memoryPrivateAudioStore();
  await store.put({key: 'podcasts/episodes/bukhari-6306-ta/final.mp3', bytes: Buffer.from('ID3fixture')});
  const response = await privateMp3Response(store, 'podcasts/episodes/bukhari-6306-ta/final.mp3');
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  await assert.rejects(unavailablePrivateAudioStore().get({key: 'podcasts/episodes/bukhari-6306-ta/final.mp3'}), error => error instanceof PodcastStorageError && error.code === 'private_storage_not_configured');
  await assert.rejects(store.get({key: 'https://public.invalid/podcast.mp3'}), error => error.code === 'invalid_storage_key');
  const migration = fs.readFileSync(new URL('../migrations/008_podcast_foundation.sql', import.meta.url), 'utf8');
  assert.equal(/audio_bytes\s+(?:MEDIUM)?BLOB/i.test(migration), false);
});

test('podcast migration creates metadata-only durable tables in an isolated SQLite rehearsal', () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec('PRAGMA foreign_keys=ON');
    for (const name of ['001_core.sql', '003_members.sql', '008_podcast_foundation.sql']) {
      const source = fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
        .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
      sql.exec(source);
    }
    const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'podcast_%' ORDER BY name").all().map(row => row.name);
    assert.deepEqual(tables, ['podcast_assets', 'podcast_episodes', 'podcast_jobs', 'podcast_line_cache', 'podcast_runtime_locks', 'podcast_usage_daily', 'podcast_voices']);
    const episodeColumns = sql.prepare('PRAGMA table_info(podcast_episodes)').all().map(row => row.name);
    assert.equal(episodeColumns.includes('final_storage_key'), true);
    assert.equal(episodeColumns.includes('audio_bytes'), false);
  } finally { sql.close(); }
});

test('podcast usage reserves a global daily cap before a call and records content-free provider metadata', async () => {
  const sql = new DatabaseSync(':memory:');
  const db = {prepare(query) {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async run() { const result = sql.prepare(query.replace(/INSERT IGNORE/gi, 'INSERT OR IGNORE').replace(/GREATEST\(/gi, 'MAX(')).run(...values); return {meta: {changes: Number(result.changes)}}; },
    };
    return statement;
  }};
  try {
    for (const name of ['001_core.sql', '003_members.sql', '008_podcast_foundation.sql']) sql.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n'));
    sql.prepare('INSERT INTO podcast_episodes (id,report_revision_id,language,title,script_json,script_hash,status,recitation_status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('bukhari-6306-ta', 'report-revision-6306', 'ta', 'Synthetic fixture', '{}', 'a'.repeat(64), 'script_approved', 'ready', 'owner', '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
    const reservation = await reservePodcastCredits(db, {dailyCreditCap: 20, operation: 'tts', characterCount: 100, estimatedCredits: 12, date: '2030-01-01'});
    await assert.rejects(reservePodcastCredits(db, {dailyCreditCap: 20, operation: 'tts', characterCount: 100, estimatedCredits: 9, date: '2030-01-01'}), error => error instanceof PodcastUsageError && error.code === 'podcast_daily_credit_cap_reached');
    await recordPodcastProviderJob(db, {id: 'podcast-job-0001', episodeId: 'bukhari-6306-ta', lineId: 's1-01', stage: 'line_render', operation: 'tts', modelId: 'eleven_v4', voiceId: 'ql6Gx6v8qU9oflZLdTsZ', cacheKey: 'b'.repeat(64), characterCount: 100, providerCredits: 12, providerRequestId: 'request-1', status: 'ready'});
    const row = Object.assign({}, sql.prepare('SELECT tts_requests,tts_characters,provider_credits FROM podcast_usage_daily').get());
    assert.deepEqual(row, {tts_requests: 1, tts_characters: 100, provider_credits: 12});
    assert.deepEqual(Object.assign({}, sql.prepare('SELECT model_id,voice_id,character_count,provider_credits FROM podcast_jobs').get()), {model_id: 'eleven_v4', voice_id: 'ql6Gx6v8qU9oflZLdTsZ', character_count: 100, provider_credits: 12});
    await reservation.release();
    assert.deepEqual(Object.assign({}, sql.prepare('SELECT tts_requests,tts_characters,provider_credits FROM podcast_usage_daily').get()), {tts_requests: 0, tts_characters: 0, provider_credits: 0});
  } finally { sql.close(); }
});

test('timeline preserves a dry recitation lane and QA parsers reject non-broadcast output', async () => {
  const files = {assets: {intro: 'intro.mp3', sting: 'sting.mp3', page_turn: 'page.mp3'}, lines: {'s1-01': 'one.mp3', 's1-02': 'two.mp3'}, reactions: {maryam: {oh: 'reaction.mp3'}}, recitation: 'human-recitation.mp3'};
  const times = new Map(Object.entries({ 'intro.mp3': 20, 'sting.mp3': 4, 'page.mp3': 1, 'one.mp3': 4, 'two.mp3': 5, 'reaction.mp3': 1, 'human-recitation.mp3': 7}));
  const timeline = await buildTimeline(script(), files, {amina: 0, yusuf: -0.25, maryam: 0.25}, async file => times.get(file));
  assert.ok(timeline.items.some(item => item.kind === 'recitation' && item.file === 'human-recitation.mp3'));
  assert.doesNotThrow(() => assertBroadcastLoudness(parseEbur128('Integrated loudness: -16.0 LUFS\nTrue peak: -1.2 dBTP')));
  assert.throws(() => assertBroadcastLoudness({integratedLufs: -13, truePeakDbtp: -0.5}), error => error.code === 'mix_loudness_rejected');
  const silences = parseSilences('silence_start: 1\nsilence_end: 2.0\nsilence_start: 10\nsilence_end: 14.0');
  assert.doesNotThrow(() => assertNoUnexpectedLongSilence(silences, [{start: 9, end: 15}]));
  assert.throws(() => assertNoUnexpectedLongSilence(silences), error => error.code === 'unexpected_long_silence');
});

test('owner-only status endpoint reports unavailable truthfully and exposes no render action', async () => {
  const owner = {id: 'owner', role: 'owner'};
  const response = await podcastAdminResponse(new Request('https://review.invalid/api/admin/podcast/availability'), {}, owner);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {enabled: false, renderMode: 'disabled', reason: 'podcast_disabled', reportAdapterConnected: false, privateStorageApproved: false, ffmpegWorkerApproved: false, dailyCreditCapConfigured: false, message: 'Podcast rendering is unavailable until owner-approved storage, report adapter, bounded cost authorization, assets and human gates are complete.'});
  assert.equal((await podcastAdminResponse(new Request('https://review.invalid/api/admin/podcast/availability'), {}, {id: 'reader', role: 'reader'})).status, 403);
});

console.log('Podcast checks use local mocks and synthetic nonreligious fixtures only. They make no ElevenLabs request, do not measure a production episode, and do not prove storage, report integration, human review, ffmpeg 6, private playback, or native-language quality.');
