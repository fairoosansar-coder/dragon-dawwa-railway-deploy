import {createHash} from 'node:crypto';
import {assertNoArabicText} from './validation.mjs';

const API = 'https://api.elevenlabs.io';
const MAX_TIMEOUT_MS = 180_000;

export class ElevenLabsPodcastError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

function configuredKey(value) {
  if (typeof value !== 'string' || value.length < 16) throw new ElevenLabsPodcastError('elevenlabs_not_configured');
  return value;
}

function costHeader(headers) {
  // `character-cost` is documented generation metadata. Other endpoints may not expose a
  // comparable cost header, so unknown stays null rather than being invented.
  const raw = headers.get('character-cost') || headers.get('x-character-cost') || headers.get('credit-cost');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requestId(headers) {
  const value = headers.get('request-id') || headers.get('x-request-id');
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null;
}

function providerFailure(status) {
  if (status === 401 || status === 403) return new ElevenLabsPodcastError('elevenlabs_not_authorized', status);
  if (status === 429) return new ElevenLabsPodcastError('elevenlabs_rate_limited', status);
  return new ElevenLabsPodcastError(`elevenlabs_http_${status}`, status >= 500 ? 503 : 502);
}

function vocalOnlyPrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.length < 8 || prompt.length > 4_100) throw new ElevenLabsPodcastError('invalid_music_prompt', 400);
  // Require explicit negative constraints rather than rejecting their literal words inside a
  // compliant instruction such as "no instruments".
  if (!/\bvocal(?:-only|s)?\b/i.test(prompt) || !/\bno\s+(?:instruments?|percussion)\b/i.test(prompt) ||
      !/\bno\s+drums?\b/i.test(prompt) || !/\bno\s+lyrics?\b/i.test(prompt))
    throw new ElevenLabsPodcastError('vocal_only_music_required', 400);
  return prompt;
}

/** A cache key contains no secret; it is safe to store as an opaque identifier. */
export function podcastLineCacheKey({language, speaker, voiceId, modelId = 'eleven_v4', text}) {
  assertNoArabicText(text);
  for (const value of [language, speaker, voiceId, modelId]) if (typeof value !== 'string' || !value) throw new ElevenLabsPodcastError('invalid_cache_input', 400);
  return createHash('sha256').update(`${language}\0${speaker}\0${voiceId}\0${modelId}\0${text}`).digest('hex');
}

/**
 * Server-only provider client. It returns only bytes and non-content metadata; callers are
 * responsible for daily-cap reservation and job logging before a request is made.
 */
export function createElevenLabsPodcastClient({apiKey = process.env.ELEVENLABS_API_KEY, fetcher = fetch, baseUrl = API, timeoutMs = MAX_TIMEOUT_MS} = {}) {
  if (typeof fetcher !== 'function') throw new ElevenLabsPodcastError('invalid_fetcher', 500);
  const timeout = Number.isInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= MAX_TIMEOUT_MS ? timeoutMs : MAX_TIMEOUT_MS;

  async function postAudio(path, body, query = '') {
    let response;
    try {
      response = await fetcher(`${baseUrl}${path}${query}`, {
        method: 'POST',
        headers: {'xi-api-key': configuredKey(apiKey), 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ElevenLabsPodcastError('elevenlabs_timeout');
      throw new ElevenLabsPodcastError('elevenlabs_unavailable');
    }
    if (!response.ok) throw providerFailure(response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4) throw new ElevenLabsPodcastError('elevenlabs_invalid_audio');
    return {bytes, requestId: requestId(response.headers), credits: costHeader(response.headers)};
  }

  return Object.freeze({
    async textToSpeech({voiceId, text, modelId = 'eleven_v4', languageCode}) {
      if (typeof voiceId !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(voiceId)) throw new ElevenLabsPodcastError('invalid_voice_id', 400);
      if (modelId !== 'eleven_v4') throw new ElevenLabsPodcastError('invalid_tts_model', 400);
      assertNoArabicText(text);
      if (typeof text !== 'string' || !text.trim() || text.length > 900) throw new ElevenLabsPodcastError('invalid_tts_text', 400);
      if (languageCode !== undefined && !['en', 'ta', 'si'].includes(languageCode)) throw new ElevenLabsPodcastError('invalid_tts_language', 400);
      return postAudio(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        text, model_id: modelId, ...(languageCode ? {language_code: languageCode} : {}),
      }, '?output_format=mp3_44100_128');
    },

    async soundEffect({prompt, seconds, loop = false, modelId = 'eleven_text_to_sound_v2'}) {
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2_000 || !Number.isInteger(seconds) || seconds < 1 || seconds > 22 || typeof loop !== 'boolean' || modelId !== 'eleven_text_to_sound_v2')
        throw new ElevenLabsPodcastError('invalid_sound_effect_request', 400);
      return postAudio('/v1/sound-generation', {text: prompt, duration_seconds: seconds, prompt_influence: 0.3, loop, model_id: modelId});
    },

    async music({prompt, lengthMs, modelId = 'music_v2_5'}) {
      if (!Number.isInteger(lengthMs) || lengthMs < 3_000 || lengthMs > 600_000 || modelId !== 'music_v2_5') throw new ElevenLabsPodcastError('invalid_music_request', 400);
      return postAudio('/v1/music', {prompt: vocalOnlyPrompt(prompt), music_length_ms: lengthMs, model_id: modelId}, '?output_format=mp3_44100_128');
    },

    async transcribe(mp3Buffer, languageCode) {
      if (!Buffer.isBuffer(mp3Buffer) || mp3Buffer.length < 4 || mp3Buffer.length > 32 * 1024 * 1024 || !['en', 'ta', 'si'].includes(languageCode))
        throw new ElevenLabsPodcastError('invalid_transcription_input', 400);
      const form = new FormData();
      form.append('model_id', 'scribe_v2');
      form.append('language_code', languageCode);
      form.append('file', new Blob([mp3Buffer], {type: 'audio/mpeg'}), 'line.mp3');
      let response;
      try {
        response = await fetcher(`${baseUrl}/v1/speech-to-text`, {
          method: 'POST', headers: {'xi-api-key': configuredKey(apiKey)}, body: form, signal: AbortSignal.timeout(timeout),
        });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ElevenLabsPodcastError('elevenlabs_timeout');
        throw new ElevenLabsPodcastError('elevenlabs_unavailable');
      }
      if (!response.ok) throw providerFailure(response.status);
      let body;
      try { body = await response.json(); } catch { throw new ElevenLabsPodcastError('elevenlabs_invalid_transcript'); }
      if (typeof body?.text !== 'string' || body.text.length > 10_000) throw new ElevenLabsPodcastError('elevenlabs_invalid_transcript');
      return {text: body.text, requestId: requestId(response.headers), credits: costHeader(response.headers), modelId: 'scribe_v2'};
    },
  });
}
