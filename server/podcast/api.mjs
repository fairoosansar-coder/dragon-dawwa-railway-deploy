import {podcastPolicy} from './policy.mjs';

function response(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie'}});
}

/** This foundation exposes status only to the verified owner; it exposes no render or public media route. */
export async function podcastAdminResponse(request, env, actor) {
  if (!actor || actor.role !== 'owner') return response({error: 'forbidden'}, 403);
  const path = new URL(request.url).pathname;
  if (path !== '/api/admin/podcast/availability') return response({error: 'not_found'}, 404);
  if (request.method !== 'GET') return response({error: 'method_not_allowed'}, 405);
  const policy = podcastPolicy(env);
  return response({
    enabled: false,
    renderMode: policy.mode,
    reason: policy.reason || 'foundation_not_wired',
    reportAdapterConnected: policy.reportAdapterConnected,
    privateStorageApproved: policy.storageApproved,
    ffmpegWorkerApproved: policy.ffmpegWorkerApproved,
    dailyCreditCapConfigured: policy.creditCap > 0,
    message: 'Podcast rendering is unavailable until owner-approved storage, report adapter, bounded cost authorization, assets and human gates are complete.',
  });
}
