// Podcast rendering is opt-in twice: an explicit bounded mode plus the prerequisite
// approvals. A present API key can never enable a worker by itself.
const MODES = new Set(['disabled', 'cost_measurement', 'production']);

export class PodcastPolicyError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const yes = value => value === 'true';
const integer = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : 0;
};

export function podcastPolicy(env = process.env, episodeId = null) {
  const mode = MODES.has(env.PODCAST_RENDER_MODE) ? env.PODCAST_RENDER_MODE : 'disabled';
  const creditCap = integer(env.PODCAST_DAILY_CREDIT_CAP);
  const storageProvider = typeof env.PODCAST_AUDIO_STORE_PROVIDER === 'string' &&
    /^[a-z][a-z0-9_-]{1,31}$/.test(env.PODCAST_AUDIO_STORE_PROVIDER)
    ? env.PODCAST_AUDIO_STORE_PROVIDER : null;
  const measurementEpisodeId = typeof env.PODCAST_COST_MEASUREMENT_EPISODE_ID === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(env.PODCAST_COST_MEASUREMENT_EPISODE_ID)
    ? env.PODCAST_COST_MEASUREMENT_EPISODE_ID : null;

  const common = {
    mode,
    creditCap,
    storageProvider,
    reportAdapterConnected: yes(env.PODCAST_REPORT_ADAPTER_CONNECTED),
    storageApproved: yes(env.PODCAST_AUDIO_STORE_APPROVED),
    ffmpegWorkerApproved: yes(env.PODCAST_FFMPEG_WORKER_APPROVED),
    canRender: false,
    reason: 'podcast_disabled',
  };
  if (mode === 'disabled') return common;
  if (mode === 'cost_measurement') {
    if (!yes(env.PODCAST_COST_MEASUREMENT_APPROVED)) return {...common, reason: 'cost_measurement_not_approved'};
    if (!measurementEpisodeId || episodeId !== measurementEpisodeId) return {...common, reason: 'measurement_episode_not_authorized'};
  }
  if (mode === 'production' && !yes(env.PODCAST_PRODUCTION_APPROVED))
    return {...common, reason: 'production_not_approved'};
  if (!storageProvider || !common.storageApproved) return {...common, reason: 'private_storage_not_approved'};
  if (!common.reportAdapterConnected) return {...common, reason: 'report_adapter_not_connected'};
  if (!common.ffmpegWorkerApproved) return {...common, reason: 'ffmpeg_worker_not_approved'};
  if (creditCap < 1) return {...common, reason: 'daily_credit_cap_not_configured'};
  return {...common, canRender: true, reason: null};
}

export function assertPodcastRenderAllowed(env, episodeId) {
  const policy = podcastPolicy(env, episodeId);
  if (!policy.canRender) throw new PodcastPolicyError(policy.reason);
  return policy;
}
