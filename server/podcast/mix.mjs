import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertReactionSpacing} from './validation.mjs';

const run = promisify(execFile);
export const MIX_CONSTANTS = Object.freeze({
  GAP: 0.3, OVERLAP: 0.25, SFX_LEAD: 0.8, RECITATION_PAD: 1.2,
  REACTION_DB: -8, SFX_DB: -10, ROOM_TONE_DB: -46,
});
const VOICE_FX = [
  'aformat=channel_layouts=mono', 'highpass=f=80', 'equalizer=f=4000:t=q:w=1:g=2',
  'acompressor=threshold=-20dB:ratio=3:attack=10:release=200', 'deesser',
  'aecho=0.8:0.6:35:0.12',
].join(',');

export class PodcastMixError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function finiteDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 14_400) throw new PodcastMixError('invalid_audio_duration');
  return duration;
}

export async function durationOf(file) {
  try {
    const {stdout} = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {maxBuffer: 1024 * 1024});
    return finiteDuration(stdout.trim());
  } catch { throw new PodcastMixError('audio_duration_unavailable'); }
}

export async function assertFfmpeg6() {
  try {
    const {stdout} = await run('ffmpeg', ['-version'], {maxBuffer: 16_384});
    const match = /^ffmpeg version\s+(\d+)\./m.exec(stdout);
    if (!match || Number(match[1]) < 6) throw new PodcastMixError('ffmpeg_6_required');
    return Number(match[1]);
  } catch (error) {
    if (error instanceof PodcastMixError) throw error;
    throw new PodcastMixError('ffmpeg_unavailable');
  }
}

function asset(files, name) {
  const value = files?.assets?.[name];
  if (typeof value !== 'string' || !value) throw new PodcastMixError('required_asset_missing');
  return value;
}

function lineFile(files, id) {
  const value = files?.lines?.[id];
  if (typeof value !== 'string' || !value) throw new PodcastMixError('line_clip_missing');
  return value;
}

function reactionFile(files, speaker, clip) {
  const value = files?.reactions?.[speaker]?.[clip];
  if (typeof value !== 'string' || !value) throw new PodcastMixError('reaction_clip_missing');
  return value;
}

/** Builds deterministic placement; it does not inspect text or make creative decisions. */
export async function buildTimeline(script, files, seats, duration = durationOf) {
  const items = [];
  const intro = asset(files, 'intro');
  const sting = asset(files, 'sting');
  const introLen = finiteDuration(await duration(intro));
  const stingLen = finiteDuration(await duration(sting));
  items.push({file: intro, start: 0, kind: 'music', gainDb: -3});
  let cursor = Math.max(0, introLen - 4);
  const reactionStarts = [];

  for (const [segmentIndex, segment] of script.segments.entries()) {
    if (segmentIndex > 0) {
      items.push({file: sting, start: cursor + MIX_CONSTANTS.GAP, kind: 'music', gainDb: -4});
      cursor += MIX_CONSTANTS.GAP + stingLen + MIX_CONSTANTS.GAP;
    }
    for (const line of segment.lines) {
      const file = lineFile(files, line.id);
      const length = finiteDuration(await duration(file));
      const start = line.overlap_prev ? Math.max(0, cursor - MIX_CONSTANTS.GAP - MIX_CONSTANTS.OVERLAP) : cursor;
      if (line.sfx_before) items.push({file: asset(files, line.sfx_before), start: Math.max(0, start - MIX_CONSTANTS.SFX_LEAD), kind: 'sfx', gainDb: MIX_CONSTANTS.SFX_DB});
      const pan = Number(seats?.[line.speaker]);
      items.push({file, start, kind: 'voice', pan: Number.isFinite(pan) ? pan : 0, gainDb: 0});
      for (const reaction of line.reactions || []) {
        const reactionStart = start + length * reaction.at;
        reactionStarts.push(reactionStart);
        items.push({file: reactionFile(files, reaction.speaker, reaction.clip), start: reactionStart, kind: 'voice', pan: Number(seats?.[reaction.speaker]) || 0, gainDb: MIX_CONSTANTS.REACTION_DB});
      }
      cursor = start + length + MIX_CONSTANTS.GAP;
      if (line.id === script.recitation_after_line && files?.recitation) {
        const recitationLen = finiteDuration(await duration(files.recitation));
        items.push({file: files.recitation, start: cursor + MIX_CONSTANTS.RECITATION_PAD, kind: 'recitation', gainDb: 0});
        cursor += MIX_CONSTANTS.RECITATION_PAD + recitationLen + MIX_CONSTANTS.RECITATION_PAD;
      }
    }
  }
  assertReactionSpacing(reactionStarts);
  const outroStart = Math.max(0, cursor - 3);
  items.push({file: intro, start: outroStart, kind: 'music', gainDb: -6});
  return Object.freeze({items, total: outroStart + introLen + 1, reactionStarts});
}

function panFilter(pan) {
  const left = Math.min(1, Math.max(0, 1 - pan)).toFixed(2);
  const right = Math.min(1, Math.max(0, 1 + pan)).toFixed(2);
  return `pan=stereo|c0=${left}*c0|c1=${right}*c0`;
}

export async function renderTimeline({timeline, roomTone, outFile, meta}) {
  if (!timeline?.items?.length || !Number.isFinite(timeline.total) || typeof roomTone !== 'string' || !roomTone || typeof outFile !== 'string' || !outFile) throw new PodcastMixError('invalid_mix_request');
  if (typeof meta?.title !== 'string' || !meta.title.trim() || /[\r\n\0]/.test(meta.title) || typeof meta?.reviewer !== 'string' || /[\r\n\0]/.test(meta.reviewer || '')) throw new PodcastMixError('invalid_mix_metadata');
  await assertFfmpeg6();
  const args = ['-y', '-hide_banner'];
  for (const item of timeline.items) args.push('-i', item.file);
  args.push('-stream_loop', '-1', '-i', roomTone);
  const chains = timeline.items.map((item, index) => {
    const delay = Math.round(item.start * 1000);
    let effects;
    if (item.kind === 'voice') effects = `${VOICE_FX},${panFilter(item.pan || 0)}`;
    // The human recitation is deliberately dry: no music, echo, compressor, or de-essing.
    else if (item.kind === 'recitation') effects = 'aformat=channel_layouts=mono,highpass=f=70,pan=stereo|c0=c0|c1=c0';
    else effects = 'aformat=channel_layouts=stereo';
    return `[${index}:a]${effects},volume=${item.gainDb}dB,adelay=${delay}|${delay}[a${index}]`;
  });
  const roomIndex = timeline.items.length;
  const end = timeline.total.toFixed(2);
  chains.push(`[${roomIndex}:a]aformat=channel_layouts=stereo,atrim=0:${end},volume=${MIX_CONSTANTS.ROOM_TONE_DB}dB[room]`);
  chains.push(`${timeline.items.map((_, index) => `[a${index}]`).join('')}[room]amix=inputs=${timeline.items.length + 1}:normalize=0:duration=longest,atrim=0:${end},loudnorm=I=-16:TP=-1.5:LRA=11[out]`);
  try {
    await run('ffmpeg', [...args, '-filter_complex', chains.join(';'), '-map', '[out]', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-metadata', `title=${meta.title}`, '-metadata', 'artist=Dragon Dawwa - The Research Table', '-metadata', `comment=AI-researched; reviewed by ${meta.reviewer} on ${meta.reviewedOn || 'unrecorded'}`, outFile], {maxBuffer: 64 * 1024 * 1024});
  } catch { throw new PodcastMixError('mix_render_failed'); }
}
