// Google Gemini adapter for the study feature. It contains no secret logging and performs
// no automatic retry: a user-triggered request is the only retry boundary.
const TEXT_MODELS = new Set(['gemini-3.1-flash-lite', 'gemini-3.8-flash']);
const TTS_MODELS = new Set(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_NARRATION_CHARS = 2_500;
const DEFAULT_TIMEOUT_MS = 12_000;

export class GeminiStudyError extends Error {
  constructor(code = 'provider_unavailable', status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status) => { throw new GeminiStudyError(code, status); };
const clip = (value, length) => String(value || '').replace(/\u0000/g, '').trim().slice(0, length);

function configuredModel(value, allowed, fallback) {
  const model = value || fallback;
  if (!allowed.has(model)) fail('provider_model_unavailable', 503);
  return model;
}

function liveCanaryAllowed(env, actor) {
  if (env.STUDY_LIVE_CANARY !== 'true') return false;
  const allowedUser = env.STUDY_LIVE_CANARY_USER_ID;
  return typeof allowedUser === 'string' && allowedUser.length > 0 && allowedUser === actor?.id;
}

function deadline(fetcher, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetcher(url, {...init, signal: controller.signal}).catch(error => {
    if (error?.name === 'AbortError') throw new GeminiStudyError('provider_timeout', 503);
    throw new GeminiStudyError('provider_unavailable', 503);
  }).finally(() => clearTimeout(timer));
}

async function googleJson(fetcher, url, init, timeoutMs) {
  const response = await deadline(fetcher, url, init, timeoutMs);
  if (response.status === 429) fail('provider_rate_limited', 429);
  if (!response.ok) fail('provider_unavailable', 503);
  try { return await response.json(); } catch { fail('provider_invalid_response', 503); }
}

function responseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map(part => part?.text).filter(value => typeof value === 'string').join('\n') : '';
  if (!text || text.length > 30_000) fail('provider_invalid_response', 503);
  try { return JSON.parse(text); } catch { fail('provider_invalid_response', 503); }
}

function audioBase64(payload) {
  // Verified Google Interactions unary response: steps[].content[] contains an
  // audio part with {type:'audio',mime_type:'audio/wav',data:'<base64>'}.
  // Refuse unrelated text, metadata or silent PCM instead of guessing a data field.
  if (!Array.isArray(payload?.steps)) return null;
  for (const step of payload.steps) {
    if (!Array.isArray(step?.content)) continue;
    for (const part of step.content) {
      if (part?.type === 'audio' && part?.mime_type === 'audio/wav' && typeof part?.data === 'string') return part.data;
    }
  }
  return null;
}

function isWav(bytes) {
  return bytes.length >= 44 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE';
}

export const EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['paragraphs', 'citationIds', 'inference'],
  properties: {
    paragraphs: {type: 'array', minItems: 1, maxItems: 4, items: {type: 'string', minLength: 1, maxLength: 900}},
    citationIds: {type: 'array', minItems: 1, maxItems: 6, items: {type: 'string', minLength: 1, maxLength: 140}},
    inference: {type: 'boolean'},
  },
};

export const TRANSCRIPT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['transcript'],
  properties: {transcript: {type: 'string', minLength: 1, maxLength: 600}},
};

/**
 * The returned provider has three deliberately separate operations. In normal operation they
 * require both a configured API key and the explicit owner-controlled live-canary switch. Tests
 * pass a mock provider into studyResponse instead, so no user-cost generation occurs in checks.
 */
export function createGeminiStudyProvider(env = {}, actor = null, fetcher = globalThis.fetch) {
  const timeoutMs = Math.max(1_000, Math.min(Number(env.STUDY_GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 20_000));
  const enabled = liveCanaryAllowed(env, actor);
  const apiKey = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '';
  const requireLive = () => {
    if (!enabled) fail('provider_not_enabled', 503);
    if (!apiKey) fail('provider_not_configured', 503);
  };
  const textModel = configuredModel(env.GEMINI_TEXT_MODEL, TEXT_MODELS, 'gemini-3.1-flash-lite');
  const ttsModel = configuredModel(env.GEMINI_TTS_MODEL, TTS_MODELS, 'gemini-3.8-flash-lite-tts');

  return {
    textModel,
    ttsModel,
    async explain({prompt}) {
      requireLive();
      const payload = await googleJson(fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(textModel)}:generateContent`,
        {
          method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
          body: JSON.stringify({
            contents: [{role: 'user', parts: [{text: prompt}]}],
            generationConfig: {temperature: 0.2, maxOutputTokens: 1_800, responseMimeType: 'application/json', responseJsonSchema: EXPLANATION_SCHEMA},
          }),
        }, timeoutMs);
      return responseText(payload);
    },
    async synthesize({text, language, voice}) {
      requireLive();
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_NARRATION_CHARS) fail('invalid_narration', 400);
      if (!['en', 'ta', 'si'].includes(language) || typeof voice !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(voice)) fail('provider_invalid_response', 503);
      const payload = await googleJson(fetcher, 'https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
        body: JSON.stringify({
          model: ttsModel,
          input: [{type: 'user_input', content: [{type: 'text', text, annotations: [{type: 'speech_metadata', style: 'Clear, calm, respectful teacher. Moderate pace and natural pauses. Do not perform or imitate Quran recitation.'}]}]}],
          response_format: {type: 'audio'},
          generation_config: {speech_config: [{voice}]},
        }),
      }, timeoutMs);
      const encoded = audioBase64(payload);
      if (!encoded || encoded.length > Math.ceil(MAX_AUDIO_BYTES * 1.4)) fail('provider_invalid_audio', 503);
      let bytes;
      try { bytes = Buffer.from(encoded, 'base64'); } catch { fail('provider_invalid_audio', 503); }
      if (!isWav(bytes) || bytes.length > MAX_AUDIO_BYTES) fail('provider_invalid_audio', 503);
      return {bytes, model: ttsModel};
    },
    async transcribe({bytes, mimeType}) {
      requireLive();
      if (!Buffer.isBuffer(bytes) || !mimeType?.startsWith('audio/webm') || bytes.length < 1 || bytes.length > MAX_TRANSCRIPT_BYTES)
        fail('invalid_audio_upload', 400);
      const payload = await googleJson(fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(textModel)}:generateContent`,
        {
          method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
          body: JSON.stringify({
            contents: [{role: 'user', parts: [
              {text: 'Transcribe this short audio exactly. Return only JSON matching the schema. Do not answer the question or add religious guidance.'},
              {inlineData: {mimeType, data: bytes.toString('base64')}},
            ]}],
            generationConfig: {temperature: 0, responseMimeType: 'application/json', responseJsonSchema: TRANSCRIPT_SCHEMA},
          }),
        }, timeoutMs);
      const parsed = responseText(payload);
      const transcript = clip(parsed?.transcript, 600);
      if (!transcript) fail('provider_invalid_response', 503);
      return {transcript, model: textModel};
    },
  };
}

export const GEMINI_LIMITS = {MAX_AUDIO_BYTES, MAX_TRANSCRIPT_BYTES, MAX_NARRATION_CHARS, TEXT_MODELS, TTS_MODELS};
