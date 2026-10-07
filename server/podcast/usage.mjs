// Durable, global credit reservation for the future one-at-a-time worker. Provider calls must
// reserve a conservative estimated credit amount before submitting audio/text upstream.
const OPERATIONS = Object.freeze({
  tts: {count: 'tts_requests', characters: 'tts_characters'},
  stt: {count: 'stt_requests', characters: null},
  music: {count: 'music_requests', characters: null},
  sound: {count: 'sound_requests', characters: null},
});

export class PodcastUsageError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const changed = result => Number(result?.meta?.changes ?? result?.changes ?? 0);
const utcDate = () => new Date().toISOString().slice(0, 10);
const nonnegativeInteger = value => Number.isInteger(value) && value >= 0 && value <= 10_000_000;
const decimal = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10_000_000 ? Number(value) : null;

function operationDefinition(operation) {
  const definition = OPERATIONS[operation];
  if (!definition) throw new PodcastUsageError('invalid_podcast_operation');
  return definition;
}

/**
 * An atomic conditional UPDATE ensures two processes cannot overbook a daily cap. The estimate
 * must be conservative; response metadata is recorded separately after the provider returns.
 */
export async function reservePodcastCredits(db, {dailyCreditCap, operation, characterCount = 0, estimatedCredits, date = utcDate()} = {}) {
  if (!db?.prepare || !nonnegativeInteger(dailyCreditCap) || dailyCreditCap < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new PodcastUsageError('podcast_credit_cap_not_configured');
  const definition = operationDefinition(operation);
  const credits = decimal(estimatedCredits);
  if (credits === null || credits < 0.0001 || credits > dailyCreditCap || !nonnegativeInteger(characterCount))
    throw new PodcastUsageError('invalid_podcast_credit_reservation');
  const now = new Date().toISOString();
  await db.prepare('INSERT IGNORE INTO podcast_usage_daily (usage_date,tts_requests,tts_characters,stt_requests,music_requests,sound_requests,provider_credits,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(date, 0, 0, 0, 0, 0, 0, now).run();
  const characterUpdate = definition.characters ? `, ${definition.characters}=${definition.characters}+?` : '';
  const characterCheck = definition.characters ? ` AND ${definition.characters}+?<=10000000` : '';
  const values = [now, 1];
  if (definition.characters) values.push(characterCount);
  values.push(credits, date, 1);
  if (definition.characters) values.push(characterCount);
  values.push(credits, dailyCreditCap);
  const result = await db.prepare(`UPDATE podcast_usage_daily SET updated_at=?, ${definition.count}=${definition.count}+?${characterUpdate}, provider_credits=provider_credits+? WHERE usage_date=? AND ${definition.count}+?<=10000000${characterCheck} AND provider_credits+?<=?`)
    .bind(...values).run();
  if (changed(result) !== 1) throw new PodcastUsageError('podcast_daily_credit_cap_reached');
  return Object.freeze({
    date, operation, characterCount, estimatedCredits: credits,
    async release() {
      const reverse = [new Date().toISOString(), 1];
      if (definition.characters) reverse.push(characterCount);
      reverse.push(credits, date);
      await db.prepare(`UPDATE podcast_usage_daily SET updated_at=?, ${definition.count}=GREATEST(0,${definition.count}-?)${definition.characters ? `, ${definition.characters}=GREATEST(0,${definition.characters}-?)` : ''}, provider_credits=GREATEST(0,provider_credits-?) WHERE usage_date=?`)
        .bind(...reverse).run();
    },
  });
}

export async function recordPodcastProviderJob(db, {id, episodeId, lineId = null, stage, operation, modelId = null, voiceId = null, cacheKey = null, characterCount = null, providerCredits = null, providerRequestId = null, status, attemptCount = 0, errorCode = null} = {}) {
  if (!db?.prepare || !/^[A-Za-z0-9-]{16,64}$/.test(id) || !/^[A-Za-z0-9_-]{1,96}$/.test(episodeId) ||
      (lineId !== null && !/^[A-Za-z0-9_-]{1,96}$/.test(lineId)) || !/^[a-z_]{2,32}$/.test(stage) || !OPERATIONS[operation] ||
      !/^(queued|processing|ready|failed)$/.test(status) || !nonnegativeInteger(attemptCount)) throw new PodcastUsageError('invalid_podcast_job_metadata');
  for (const value of [modelId, voiceId, cacheKey, providerRequestId, errorCode]) if (value !== null && (typeof value !== 'string' || value.length > 128 || /[\r\n\0]/.test(value))) throw new PodcastUsageError('invalid_podcast_job_metadata');
  if (characterCount !== null && !nonnegativeInteger(characterCount)) throw new PodcastUsageError('invalid_podcast_job_metadata');
  if (providerCredits !== null && decimal(providerCredits) === null) throw new PodcastUsageError('invalid_podcast_job_metadata');
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO podcast_jobs (id,episode_id,line_id,stage,provider_operation,model_id,voice_id,cache_key,character_count,provider_credits,provider_request_id,status,attempt_count,error_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, episodeId, lineId, stage, operation, modelId, voiceId, cacheKey, characterCount, providerCredits, providerRequestId, status, attemptCount, errorCode, now, now).run();
}
