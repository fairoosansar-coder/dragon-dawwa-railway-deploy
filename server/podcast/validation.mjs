// Validation is deliberately deterministic. It does not ask a model to decide whether a
// line is factual, safe, or religiously valid.
const TAGS = new Set([
  '[warmly]', '[calmly]', '[curious]', '[confidently]', '[cheerfully]', '[excited]',
  '[skeptical]', '[nervous]', '[happy]', '[seriously]', '[slowly]', '[softly]',
  '[dramatically]', '[laughs softly]', '[chuckles]', '[interrupting]', '[jumping in]',
  '[pause]', '[long pause]',
]);
const LANGUAGES = new Set(['en', 'ta', 'si']);
const SFX = new Set(['page_turn', 'cup_down', 'chair_shift']);
const REACTIONS = new Set(['hmm', 'yes', 'oh', 'okay', 'chuckle', 'alhamdulillah', 'mashaallah', 'subhanallah']);
const ARABIC = /[\u0600-\u06FF\uFDF0-\uFDFF]/u;
const HONORIFIC_ABBREVIATION = /(?:\(ஸல்\)|\(ரலி\)|\(ரஹ்\)|ﷺ|\(\s*p\.?\s*b\.?\s*u\.?\s*h\.?\s*\))/iu;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/;
const LINE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const REQUIRED_CAST_SIZE = 6;

export class PodcastValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const invalid = code => { throw new PodcastValidationError(code); };
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, required, optional, code) {
  if (!isObject(value)) invalid(code);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) invalid(code);
  for (const key of required) if (!(key in value)) invalid(code);
}

function identifier(value, expression, code) {
  if (typeof value !== 'string' || !expression.test(value)) invalid(code);
  return value;
}

function castSet(castIds) {
  const out = castIds instanceof Set ? castIds : new Set(castIds || []);
  if (out.size !== REQUIRED_CAST_SIZE || [...out].some(value => !/^[a-z][a-z0-9_]{1,31}$/.test(value))) invalid('invalid_cast_configuration');
  return out;
}

function claimSet(claimIds) {
  const out = claimIds instanceof Set ? claimIds : new Set(claimIds || []);
  if (!out.size || [...out].some(value => !IDENTIFIER.test(value))) invalid('invalid_claim_configuration');
  return out;
}

export function assertNoArabicText(value) {
  if (typeof value !== 'string' || ARABIC.test(value)) invalid('arabic_tts_rejected');
}

export function stripPerformanceTags(value) {
  if (typeof value !== 'string') invalid('invalid_line_text');
  return value.replace(/\[[^\]]*\]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function validateText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 900) invalid('invalid_line_text');
  assertNoArabicText(text);
  if (HONORIFIC_ABBREVIATION.test(text)) invalid('abbreviated_honorific_rejected');
  const tags = [...text.matchAll(/\[[^\]]*\]/gu)].map(match => match[0]);
  if (tags.length !== (text.match(/\[/g) || []).length || tags.length !== (text.match(/\]/g) || []).length) invalid('invalid_performance_tag');
  for (const tag of tags) {
    if (!TAGS.has(tag)) invalid(/whisper/i.test(tag) ? 'whisper_tag_rejected' : 'invalid_performance_tag');
  }
  if (!stripPerformanceTags(text)) invalid('invalid_line_text');
}

function validateReaction(value, cast) {
  if (!Array.isArray(value) || value.length > 1) invalid('invalid_reaction');
  if (!value.length) return 0;
  exactKeys(value[0], ['speaker', 'clip', 'at'], [], 'invalid_reaction');
  if (typeof value[0].speaker !== 'string' || !cast.has(value[0].speaker)) invalid('unknown_reaction_speaker');
  if (typeof value[0].clip !== 'string' || !REACTIONS.has(value[0].clip)) invalid('invalid_reaction_clip');
  if (typeof value[0].at !== 'number' || !Number.isFinite(value[0].at) || value[0].at < 0.2 || value[0].at > 0.9) invalid('invalid_reaction_timing');
  return 1;
}

/**
 * Checks the immutable JSON contract before any provider/storage call. Every spoken line is
 * required to cite an approved claim: this is stricter than the brief, intentionally avoiding
 * an unimplementable AI determination of which prose is factual.
 */
export function validatePodcastScript(script, {castIds, approvedClaimIds} = {}) {
  const cast = castSet(castIds);
  const claims = claimSet(approvedClaimIds);
  exactKeys(script, ['episode_id', 'report_revision_id', 'language', 'title', 'segments', 'recitation_after_line'], [], 'invalid_script');
  identifier(script.episode_id, LINE_IDENTIFIER, 'invalid_episode_id');
  identifier(script.report_revision_id, IDENTIFIER, 'invalid_report_revision_id');
  if (typeof script.language !== 'string' || !LANGUAGES.has(script.language)) invalid('invalid_language');
  if (typeof script.title !== 'string' || !script.title.trim() || script.title.length > 240) invalid('invalid_title');
  if (!Array.isArray(script.segments) || !script.segments.length || script.segments.length > 100) invalid('invalid_segments');

  const lineIds = new Set();
  const segmentIds = new Set();
  const speakersUsed = new Set();
  let sfxCount = 0;
  let reactionCount = 0;
  for (const segment of script.segments) {
    exactKeys(segment, ['id', 'lines'], [], 'invalid_segment');
    identifier(segment.id, LINE_IDENTIFIER, 'invalid_segment_id');
    if (segmentIds.has(segment.id)) invalid('duplicate_segment_id');
    segmentIds.add(segment.id);
    if (!Array.isArray(segment.lines) || !segment.lines.length || segment.lines.length > 200) invalid('invalid_segment_lines');
    for (const line of segment.lines) {
      exactKeys(line, ['id', 'speaker', 'text', 'overlap_prev', 'claim_ids'], ['sfx_before', 'reactions'], 'invalid_line');
      identifier(line.id, LINE_IDENTIFIER, 'invalid_line_id');
      if (lineIds.has(line.id)) invalid('duplicate_line_id');
      lineIds.add(line.id);
      if (typeof line.speaker !== 'string' || !cast.has(line.speaker)) invalid('unknown_speaker');
      speakersUsed.add(line.speaker);
      validateText(line.text);
      if (typeof line.overlap_prev !== 'boolean') invalid('invalid_overlap');
      if (line.sfx_before !== undefined) {
        if (typeof line.sfx_before !== 'string' || !SFX.has(line.sfx_before)) invalid('invalid_sfx');
        sfxCount++;
      }
      if (!Array.isArray(line.claim_ids) || !line.claim_ids.length || line.claim_ids.length > 12) invalid('missing_claim_id');
      const cited = new Set();
      for (const claimId of line.claim_ids) {
        identifier(claimId, IDENTIFIER, 'invalid_claim_id');
        if (cited.has(claimId) || !claims.has(claimId)) invalid('claim_not_approved');
        cited.add(claimId);
      }
      reactionCount += line.reactions === undefined ? 0 : validateReaction(line.reactions, cast);
    }
  }
  // Pipeline precedence: a research two-voice draft is never a direct render script. Every
  // renderable script must use all six database-approved cast seats.
  if (speakersUsed.size !== REQUIRED_CAST_SIZE) invalid('six_voice_cast_required');
  if (sfxCount > 4) invalid('too_many_sfx');
  if (typeof script.recitation_after_line !== 'string' || !lineIds.has(script.recitation_after_line)) invalid('invalid_recitation_slot');
  return Object.freeze({lineCount: lineIds.size, sfxCount, reactionCount, lineIds: new Set(lineIds)});
}

function canonical(value) {
  return Array.from(String(value).normalize('NFKC').toLocaleLowerCase())
    .filter(char => !/[\p{P}\p{S}\s]/u.test(char)).join('');
}

function distance(left, right) {
  const row = Array.from({length: right.length + 1}, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return row[right.length];
}

export function lineTranscriptSimilarity(scriptText, transcript) {
  const expected = canonical(stripPerformanceTags(scriptText));
  const heard = canonical(transcript);
  if (!expected || !heard) return 0;
  return 1 - distance(expected, heard) / Math.max(expected.length, heard.length);
}

export function assertLineTranscriptMatch(scriptText, transcript, threshold = 0.85) {
  const similarity = lineTranscriptSimilarity(scriptText, transcript);
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1 || similarity < threshold) invalid('line_transcript_mismatch');
  return similarity;
}

export function assertReactionSpacing(reactionStarts) {
  const starts = [...reactionStarts].sort((a, b) => a - b);
  if (starts.some(value => !Number.isFinite(value) || value < 0)) invalid('invalid_reaction_timing');
  for (let index = 1; index < starts.length; index++) if (starts[index] - starts[index - 1] < 20) invalid('reaction_spacing_rejected');
  return starts;
}
