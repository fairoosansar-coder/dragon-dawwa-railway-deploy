// This is the only point where the later Hadith Research Agents implementation may bind
// podcast work to report revisions. It implements the supplied getApprovedRevision contract
// without guessing report tables. Withdrawn or superseded revisions must return null.
export class PodcastReportAdapterError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export const REPORT_ADAPTER_CONTRACT = Object.freeze({
  requiredMethod: 'getApprovedRevision',
  input: Object.freeze(['reportRevisionId']),
  output: Object.freeze(['id', 'status', 'claimIds', 'qualifiedReviewerId', 'approvedAt']),
});

export function assertReportAdapter(adapter) {
  if (!adapter || typeof adapter.getApprovedRevision !== 'function') throw new PodcastReportAdapterError('report_adapter_not_connected');
  return adapter;
}

export async function approvedReportRevision(adapter, reportRevisionId) {
  if (typeof reportRevisionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(reportRevisionId))
    throw new PodcastReportAdapterError('invalid_report_revision_id');
  const report = await assertReportAdapter(adapter).getApprovedRevision({reportRevisionId});
  if (!report || report.id !== reportRevisionId || report.status !== 'approved' ||
      typeof report.qualifiedReviewerId !== 'string' || !report.qualifiedReviewerId ||
      typeof report.approvedAt !== 'string' || !Array.isArray(report.claimIds) || !report.claimIds.length)
    throw new PodcastReportAdapterError('report_revision_not_approved');
  const claims = new Set(report.claimIds);
  if (claims.size !== report.claimIds.length || [...claims].some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(id)))
    throw new PodcastReportAdapterError('invalid_report_claims');
  return Object.freeze({id: report.id, claimIds: claims, qualifiedReviewerId: report.qualifiedReviewerId, approvedAt: report.approvedAt});
}
