import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertLineTranscriptMatch} from './validation.mjs';

const run = promisify(execFile);

export class PodcastQaError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function verifyLineQa({scriptText, transcript, threshold = 0.85}) {
  return assertLineTranscriptMatch(scriptText, transcript, threshold);
}

function measurement(text, expression) {
  const match = expression.exec(text);
  return match ? Number(match[1]) : NaN;
}

export function parseEbur128(output) {
  const loudness = measurement(output, /(?:Integrated loudness:|\n\s*I:)\s*(-?\d+(?:\.\d+)?)\s*LUFS/i);
  const peak = measurement(output, /(?:True peak:|\n\s*(?:True )?Peak:)\s*(-?\d+(?:\.\d+)?)\s*dB(?:TP|FS)/i);
  if (!Number.isFinite(loudness) || !Number.isFinite(peak)) throw new PodcastQaError('loudness_measurement_unavailable');
  return {integratedLufs: loudness, truePeakDbtp: peak};
}

export function assertBroadcastLoudness(measurements) {
  if (!measurements || Math.abs(Number(measurements.integratedLufs) + 16) > 1 || Number(measurements.truePeakDbtp) > -1)
    throw new PodcastQaError('mix_loudness_rejected');
  return measurements;
}

export async function measureLoudness(file) {
  try {
    const {stderr} = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {maxBuffer: 2 * 1024 * 1024});
    return assertBroadcastLoudness(parseEbur128(stderr));
  } catch (error) {
    if (error instanceof PodcastQaError) throw error;
    throw new PodcastQaError('loudness_measurement_unavailable');
  }
}

export function parseSilences(output) {
  const starts = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const ends = [...output.matchAll(/silence_end:\s*([\d.]+)/g)].map(match => Number(match[1]));
  if (starts.length !== ends.length || starts.some(value => !Number.isFinite(value)) || ends.some(value => !Number.isFinite(value))) throw new PodcastQaError('silence_measurement_unavailable');
  return starts.map((start, index) => ({start, end: ends[index], duration: ends[index] - start}));
}

function permittedByRecitation(silence, windows) {
  return windows.some(window => silence.start >= window.start && silence.end <= window.end);
}

export function assertNoUnexpectedLongSilence(silences, recitationWindows = []) {
  const long = silences.filter(silence => !Number.isFinite(silence.duration) || silence.duration > 3.5);
  if (long.some(silence => !permittedByRecitation(silence, recitationWindows))) throw new PodcastQaError('unexpected_long_silence');
  return silences;
}

export async function detectSilences(file, {noiseDb = -45, recitationWindows = []} = {}) {
  if (!Number.isFinite(noiseDb) || noiseDb > -10 || noiseDb < -90) throw new PodcastQaError('invalid_silence_threshold');
  try {
    const {stderr} = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=0.1`, '-f', 'null', '-'], {maxBuffer: 2 * 1024 * 1024});
    return assertNoUnexpectedLongSilence(parseSilences(stderr), recitationWindows);
  } catch (error) {
    if (error instanceof PodcastQaError) throw error;
    throw new PodcastQaError('silence_measurement_unavailable');
  }
}

export function assertMixCompleteness({lineIds, lineStorageKeys, requiredAssetIds, assetStorageKeys, recitationStatus, recitationStorageKey}) {
  if (!(lineIds instanceof Set) || !(lineStorageKeys instanceof Map) || !(requiredAssetIds instanceof Set) || !(assetStorageKeys instanceof Map)) throw new PodcastQaError('invalid_completeness_input');
  for (const id of lineIds) if (!lineStorageKeys.get(id)) throw new PodcastQaError('line_clip_missing');
  for (const id of requiredAssetIds) if (!assetStorageKeys.get(id)) throw new PodcastQaError('required_asset_missing');
  if (recitationStatus === 'ready' && !recitationStorageKey) throw new PodcastQaError('recitation_asset_missing');
  if (!['ready', 'waived'].includes(recitationStatus)) throw new PodcastQaError('recitation_not_ready');
  return true;
}
