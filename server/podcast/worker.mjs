import {assertPodcastRenderAllowed, PodcastPolicyError} from './policy.mjs';
import {approvedReportRevision, PodcastReportAdapterError} from './report-adapter.mjs';
import {validatePodcastScript, PodcastValidationError} from './validation.mjs';

export class PodcastWorkerError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/**
 * Validates all provenance and human gates without touching ElevenLabs, ffmpeg, or storage.
 * The future agent feature must supply this adapter and database repository explicitly.
 */
export async function preflightPodcastEpisode({episode, reportAdapter, castIds}) {
  if (!episode || typeof episode !== 'object' || typeof episode.id !== 'string' || typeof episode.reportRevisionId !== 'string' || typeof episode.scriptJson !== 'string')
    throw new PodcastWorkerError('invalid_episode');
  if (episode.status !== 'script_approved') throw new PodcastWorkerError('script_not_approved');
  if (episode.languageReviewRequired === true && !episode.languageReviewerId) throw new PodcastWorkerError('language_review_not_approved');
  if (!['ready', 'waived'].includes(episode.recitationStatus)) throw new PodcastWorkerError('recitation_not_ready');
  if (episode.recitationStatus === 'ready' && !episode.recitationAssetId) throw new PodcastWorkerError('recitation_asset_missing');
  let script;
  try { script = JSON.parse(episode.scriptJson); } catch { throw new PodcastWorkerError('invalid_script_json'); }
  if (script.episode_id !== episode.id || script.report_revision_id !== episode.reportRevisionId || script.language !== episode.language)
    throw new PodcastWorkerError('episode_script_binding_mismatch');
  const report = await approvedReportRevision(reportAdapter, episode.reportRevisionId);
  const validation = validatePodcastScript(script, {castIds, approvedClaimIds: report.claimIds});
  return Object.freeze({episodeId: episode.id, report, script, validation});
}

/**
 * No scheduler calls this function in the foundation. Even if an operator changes an environment
 * variable prematurely, a missing explicitly wired repository/provider/store still fails closed.
 */
export function createPodcastWorker({env = process.env, repository, reportAdapter, elevenlabs, audioStore, castIds} = {}) {
  return Object.freeze({
    async renderEpisode(episodeId) {
      try {
        assertPodcastRenderAllowed(env, episodeId);
        if (!repository || typeof repository.getEpisode !== 'function' || !elevenlabs || !audioStore)
          throw new PodcastWorkerError('podcast_worker_not_wired');
        const episode = await repository.getEpisode({episodeId});
        return await preflightPodcastEpisode({episode, reportAdapter, castIds});
      } catch (error) {
        if (error instanceof PodcastPolicyError || error instanceof PodcastReportAdapterError || error instanceof PodcastValidationError || error instanceof PodcastWorkerError) throw error;
        throw new PodcastWorkerError('podcast_preflight_unavailable');
      }
    },
  });
}
