import {createHash, randomUUID} from 'node:crypto';

const STAFF_ROLES = new Set(['owner', 'author', 'reviewer', 'publisher']);
const AUTHOR_ROLES = new Set(['owner', 'author', 'reviewer']);
const LANGUAGES = new Set(['en', 'ta', 'si']);
const REPORT_STATES = new Set(['draft', 'approved', 'withdrawn', 'superseded']);
const MAX_BODY_BYTES = 96_000;

class HadithProblem extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new HadithProblem(status, code); };
const rows = value => Array.isArray(value?.results) ? value.results : [];
const changed = value => Number(value?.meta?.changes ?? value?.changes ?? 0);
const now = () => new Date().toISOString();
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function response(data, status = 200) {
  return Response.json(data, {status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', Vary: 'Cookie',
  }});
}
function text(value, max, required = false, code = 'invalid_hadith_input') {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) fail(400, code);
  const clean = value.trim();
  if (required && !clean) fail(400, code);
  return clean;
}
function id(value, code = 'invalid_hadith_id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(value)) fail(400, code);
  return value;
}
function onlyKeys(value, allowed, code = 'invalid_hadith_input') {
  if (!isObject(value)) fail(400, code);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(400, code);
}
function sameOrigin(request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'same_origin_required');
}
async function jsonBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) fail(413, 'too_large');
  let value;
  try { value = await request.json(); } catch { fail(400, 'invalid_json'); }
  if (!isObject(value)) fail(400, 'invalid_json');
  return value;
}
function staff(actor) {
  if (!actor || typeof actor.id !== 'string' || !STAFF_ROLES.has(actor.role)) fail(403, 'forbidden');
  return actor;
}
function owner(actor) {
  if (!actor || actor.role !== 'owner') fail(403, 'forbidden');
  return actor;
}
function author(actor) {
  if (!actor || !AUTHOR_ROLES.has(actor.role)) fail(403, 'forbidden');
  return actor;
}
function reportView(row, claims = []) {
  return {
    id: row.id, reportKey: row.report_key, revisionNumber: Number(row.revision_number),
    supersedesReportId: row.supersedes_report_id || null, title: row.title,
    hadithReference: row.hadith_reference, language: row.language, status: row.status,
    createdBy: row.created_by, createdAt: row.created_at,
    qualifiedReviewerId: row.qualified_reviewer_id || null,
    reviewerAttestationId: row.reviewer_attestation_id || null,
    reviewerStatedBasis: row.reviewer_stated_basis || null,
    approvedAt: row.approved_at || null, withdrawnBy: row.withdrawn_by || null,
    withdrawnAt: row.withdrawn_at || null, withdrawalNote: row.withdrawal_note || null,
    claims: claims.map(row => ({id: row.id, order: Number(row.claim_order), claimText: row.claim_text,
      sourceBook: row.source_book, sourceReference: row.source_reference, edition: row.edition,
      checkedWording: row.checked_wording, namedGrader: row.named_grader,
      gradingReference: row.grading_reference, enteredStaffId: row.entered_staff_id, createdAt: row.created_at})),
  };
}
function contentDigest({title, hadithReference, language, claims}) {
  const field = (claim, camel, snake) => claim[camel] ?? claim[snake] ?? '';
  const payload = {title, hadithReference, language, claims: claims.map(claim => ({
    id: claim.id, order: Number(field(claim, 'claimOrder', 'claim_order')),
    claimText: field(claim, 'claimText', 'claim_text'), sourceBook: field(claim, 'sourceBook', 'source_book'),
    sourceReference: field(claim, 'sourceReference', 'source_reference'), edition: field(claim, 'edition', 'edition'),
    checkedWording: field(claim, 'checkedWording', 'checked_wording'), namedGrader: field(claim, 'namedGrader', 'named_grader'),
    gradingReference: field(claim, 'gradingReference', 'grading_reference'), enteredStaffId: field(claim, 'enteredStaffId', 'entered_staff_id'),
  }))};
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
async function reportDocument(db, reportId) {
  const row = await db.prepare('SELECT * FROM hadith_reports WHERE id=?').bind(id(reportId)).first();
  if (!row) fail(404, 'hadith_report_not_found');
  const claims = rows(await db.prepare('SELECT * FROM hadith_claims WHERE report_revision_id=? ORDER BY claim_order ASC').bind(row.id).all());
  return reportView(row, claims);
}
function claimInput(input) {
  onlyKeys(input, new Set(['claimText', 'sourceBook', 'sourceReference', 'edition', 'checkedWording', 'namedGrader', 'gradingReference']), 'invalid_hadith_claim');
  return {
    claimText: text(input.claimText, 4_000, true, 'invalid_hadith_claim'),
    sourceBook: text(input.sourceBook, 320, true, 'invalid_hadith_claim'),
    sourceReference: text(input.sourceReference, 500, true, 'invalid_hadith_claim'),
    edition: text(input.edition, 600, true, 'invalid_hadith_claim'),
    checkedWording: text(input.checkedWording, 20_000, true, 'invalid_hadith_claim'),
    namedGrader: text(input.namedGrader, 320, true, 'invalid_hadith_claim'),
    gradingReference: text(input.gradingReference, 600, true, 'invalid_hadith_claim'),
  };
}
function createInput(input) {
  onlyKeys(input, new Set(['reportKey', 'supersedesReportId', 'title', 'hadithReference', 'language', 'claims']), 'invalid_hadith_report');
  const language = text(input.language, 2, true, 'invalid_hadith_report');
  if (!LANGUAGES.has(language)) fail(400, 'invalid_hadith_report');
  if (!Array.isArray(input.claims) || input.claims.length < 1 || input.claims.length > 200) fail(400, 'invalid_hadith_claims');
  const reportKey = input.reportKey === undefined || input.reportKey === '' ? randomUUID() : id(input.reportKey, 'invalid_report_key');
  const supersedesReportId = input.supersedesReportId === undefined || input.supersedesReportId === '' ? null : id(input.supersedesReportId, 'invalid_hadith_id');
  return {
    reportKey, supersedesReportId, title: text(input.title, 240, true, 'invalid_hadith_report'),
    hadithReference: text(input.hadithReference, 320, true, 'invalid_hadith_report'), language,
    claims: input.claims.map(claimInput),
  };
}
async function recordAudit(db, actor, action, targetType, targetId, summary = {}) {
  const at = now();
  const compact = JSON.stringify(Object.fromEntries(Object.entries(summary)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value).slice(0, 160)])));
  await db.batch([
    db.prepare('INSERT INTO management_audit_events (id,category,action,target_type,target_id,actor_id,actor_role,summary_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(
      randomUUID(), 'hadith', action, targetType, targetId, actor.id, actor.role, compact, at,
    ),
    db.prepare('INSERT INTO review_admin_audit (id,actor_id,action,target_type,target_id,summary,created_at) VALUES (?,?,?,?,?,?,?)').bind(
      randomUUID(), actor.id, action, targetType, targetId, compact, at,
    ),
  ]);
  return at;
}
async function activeAttestation(db, reviewerId) {
  return db.prepare('SELECT * FROM hadith_reviewer_attestations WHERE reviewer_id=? AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1').bind(reviewerId).first();
}
async function attestReviewer(db, actor, input) {
  onlyKeys(input, new Set(['reviewerId', 'statedBasis']), 'invalid_reviewer_attestation');
  const reviewerId = text(input.reviewerId, 191, true, 'invalid_reviewer_attestation');
  if (reviewerId === actor.id) fail(409, 'owner_self_attestation_rejected');
  const role = await db.prepare("SELECT role,disabled FROM review_roles WHERE user_id=?").bind(reviewerId).first();
  if (!role || role.disabled || role.role !== 'reviewer') fail(409, 'reviewer_role_required');
  if (await activeAttestation(db, reviewerId)) fail(409, 'reviewer_already_attested');
  const attestation = {id: randomUUID(), reviewerId, statedBasis: text(input.statedBasis, 1_200, true, 'invalid_reviewer_attestation')};
  const at = now();
  await db.prepare('INSERT INTO hadith_reviewer_attestations (id,reviewer_id,stated_basis,granted_by,granted_at,revoked_by,revoked_at) VALUES (?,?,?,?,?,?,?)').bind(
    attestation.id, reviewerId, attestation.statedBasis, actor.id, at, null, null,
  ).run();
  await recordAudit(db, actor, 'attest', 'hadith_reviewer', reviewerId, {state: 'active'});
  return {...attestation, grantedBy: actor.id, grantedAt: at, revokedAt: null};
}
async function revokeReviewer(db, actor, input) {
  onlyKeys(input, new Set(['reviewerId', 'reason']), 'invalid_reviewer_attestation');
  const reviewerId = text(input.reviewerId, 191, true, 'invalid_reviewer_attestation');
  const attestation = await activeAttestation(db, reviewerId);
  if (!attestation) fail(404, 'active_reviewer_attestation_not_found');
  const at = now();
  const result = await db.prepare('UPDATE hadith_reviewer_attestations SET revoked_by=?,revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(actor.id, at, attestation.id).run();
  if (changed(result) !== 1) fail(409, 'reviewer_attestation_changed');
  await recordAudit(db, actor, 'revoke_attestation', 'hadith_reviewer', reviewerId, {state: 'revoked'});
  return {id: attestation.id, reviewerId, revokedBy: actor.id, revokedAt: at};
}
async function createReport(db, actor, input) {
  const report = createInput(input);
  if (report.supersedesReportId) {
    const previous = await db.prepare('SELECT report_key,status FROM hadith_reports WHERE id=?').bind(report.supersedesReportId).first();
    if (!previous || previous.report_key !== report.reportKey) fail(409, 'invalid_superseded_report');
  }
  const current = await db.prepare('SELECT MAX(revision_number) AS revision_number FROM hadith_reports WHERE report_key=?').bind(report.reportKey).first();
  const revisionNumber = Number(current?.revision_number || 0) + 1;
  const reportId = randomUUID();
  const at = now();
  const claims = report.claims.map((claim, index) => ({...claim, id: randomUUID(), claimOrder: index + 1, enteredStaffId: actor.id}));
  const digest = contentDigest({title: report.title, hadithReference: report.hadithReference, language: report.language, claims});
  const statements = [
    db.prepare('INSERT INTO hadith_reports (id,report_key,revision_number,supersedes_report_id,title,hadith_reference,language,content_digest,status,created_by,created_at,qualified_reviewer_id,reviewer_attestation_id,reviewer_stated_basis,approved_at,withdrawn_by,withdrawn_at,withdrawal_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
      reportId, report.reportKey, revisionNumber, report.supersedesReportId, report.title, report.hadithReference,
      report.language, digest, 'draft', actor.id, at, null, null, null, null, null, null, null,
    ),
    ...claims.map(claim => db.prepare('INSERT INTO hadith_claims (id,report_revision_id,claim_order,claim_text,source_book,source_reference,edition,checked_wording,named_grader,grading_reference,entered_staff_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(
      claim.id, reportId, claim.claimOrder, claim.claimText, claim.sourceBook, claim.sourceReference, claim.edition,
      claim.checkedWording, claim.namedGrader, claim.gradingReference, claim.enteredStaffId, at,
    )),
  ];
  await db.batch(statements);
  await recordAudit(db, actor, 'create_revision', 'hadith_report', reportId, {reportKey: report.reportKey, revision: revisionNumber, claims: claims.length});
  return reportDocument(db, reportId);
}
async function approveReport(db, actor, reportId) {
  if (actor.role !== 'reviewer') fail(403, 'qualified_reviewer_required');
  const attestation = await activeAttestation(db, actor.id);
  if (!attestation) fail(403, 'qualified_reviewer_attestation_required');
  const report = await db.prepare('SELECT * FROM hadith_reports WHERE id=?').bind(id(reportId)).first();
  if (!report) fail(404, 'hadith_report_not_found');
  if (report.status !== 'draft') fail(409, 'hadith_report_not_draft');
  const claim = await db.prepare('SELECT COUNT(*) AS count FROM hadith_claims WHERE report_revision_id=?').bind(report.id).first();
  if (Number(claim?.count || 0) < 1) fail(409, 'hadith_report_without_claims');
  const at = now();
  const updated = await db.prepare("UPDATE hadith_reports SET status='approved',qualified_reviewer_id=?,reviewer_attestation_id=?,reviewer_stated_basis=?,approved_at=? WHERE id=? AND status='draft'").bind(
    actor.id, attestation.id, attestation.stated_basis, at, report.id,
  ).run();
  if (changed(updated) !== 1) fail(409, 'hadith_report_changed');
  if (report.supersedes_report_id) await db.prepare("UPDATE hadith_reports SET status='superseded' WHERE id=? AND status='approved'").bind(report.supersedes_report_id).run();
  await recordAudit(db, actor, 'approve', 'hadith_report', report.id, {state: 'approved', reviewer: actor.id});
  return reportDocument(db, report.id);
}
async function withdrawReport(db, actor, reportId, input) {
  onlyKeys(input, new Set(['note']), 'invalid_hadith_withdrawal');
  const note = text(input.note, 1_000, true, 'invalid_hadith_withdrawal');
  const report = await db.prepare('SELECT status FROM hadith_reports WHERE id=?').bind(id(reportId)).first();
  if (!report) fail(404, 'hadith_report_not_found');
  if (!['draft', 'approved'].includes(report.status)) fail(409, 'hadith_report_not_withdrawable');
  if (actor.role !== 'owner' && !(actor.role === 'reviewer' && await activeAttestation(db, actor.id))) fail(403, 'qualified_reviewer_required');
  const at = now();
  const updated = await db.prepare("UPDATE hadith_reports SET status='withdrawn',withdrawn_by=?,withdrawn_at=?,withdrawal_note=? WHERE id=? AND status IN ('draft','approved')").bind(actor.id, at, note, reportId).run();
  if (changed(updated) !== 1) fail(409, 'hadith_report_changed');
  await recordAudit(db, actor, 'withdraw', 'hadith_report', reportId, {state: 'withdrawn'});
  return reportDocument(db, reportId);
}
async function pageReports(db, url) {
  const pageText = url.searchParams.get('page') || '1';
  if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 1_000) fail(400, 'invalid_page');
  const page = Number(pageText), pageSize = 25, offset = (page - 1) * pageSize;
  const status = text(url.searchParams.get('status') || '', 24, false, 'invalid_filter');
  if (status && !REPORT_STATES.has(status)) fail(400, 'invalid_filter');
  const where = status ? 'WHERE status=?' : '';
  const binds = status ? [status] : [];
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM hadith_reports ${where}`).bind(...binds).first();
  const listing = await db.prepare(`SELECT id,report_key,revision_number,title,hadith_reference,language,status,created_by,created_at,qualified_reviewer_id,approved_at,withdrawn_at FROM hadith_reports ${where} ORDER BY created_at DESC,id DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...binds).all();
  const total = Number(count?.count || 0);
  return {items: rows(listing).map(row => ({id: row.id, reportKey: row.report_key, revisionNumber: Number(row.revision_number), title: row.title, hadithReference: row.hadith_reference, language: row.language, status: row.status, createdBy: row.created_by, createdAt: row.created_at, qualifiedReviewerId: row.qualified_reviewer_id || null, approvedAt: row.approved_at || null, withdrawnAt: row.withdrawn_at || null})), page, pageSize, total, hasMore: offset + pageSize < total};
}

/** Exact podcast boundary. It performs no AI/dataset operation and exposes only approved claim IDs. */
export function createHadithReportAdapter({db} = {}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('hadith_database_required');
  return Object.freeze({
    async getApprovedRevision({reportRevisionId} = {}) {
      if (typeof reportRevisionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(reportRevisionId)) return null;
      const report = await db.prepare("SELECT id,status,qualified_reviewer_id,approved_at,content_digest,title,hadith_reference,language FROM hadith_reports WHERE id=? AND status='approved'").bind(reportRevisionId).first();
      if (!report?.qualified_reviewer_id || !report.approved_at) return null;
      const claims = rows(await db.prepare('SELECT * FROM hadith_claims WHERE report_revision_id=? ORDER BY claim_order ASC').bind(report.id).all());
      if (!claims.length || report.content_digest !== contentDigest({title: report.title, hadithReference: report.hadith_reference, language: report.language, claims})) return null;
      return Object.freeze({id: report.id, status: 'approved', claimIds: Object.freeze(claims.map(row => row.id)), qualifiedReviewerId: report.qualified_reviewer_id, approvedAt: report.approved_at});
    },
  });
}

export async function hadithResponse(request, env = {}, actor = null) {
  try {
    if (env.HADITH_PHASE2A_ENABLED !== 'true') return response({error: 'hadith_phase2a_disabled'}, 503);
    if (!env.DB || typeof env.DB.prepare !== 'function') fail(503, 'storage_unavailable');
    const db = env.DB, url = new URL(request.url), pathname = url.pathname;
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'method_not_allowed');
    if (pathname === '/api/admin/hadith-reports') {
      if (request.method === 'GET') { staff(actor); return response(await pageReports(db, url)); }
      const trusted = author(actor); sameOrigin(request);
      return response(await createReport(db, trusted, await jsonBody(request)), 201);
    }
    if (pathname === '/api/admin/hadith-reviewers') {
      const trusted = owner(actor); sameOrigin(request);
      const input = await jsonBody(request);
      onlyKeys(input, new Set(['action', 'reviewerId', 'statedBasis', 'reason']), 'invalid_reviewer_attestation');
      if (input.action === 'attest') return response(await attestReviewer(db, trusted, {reviewerId: input.reviewerId, statedBasis: input.statedBasis}), 201);
      if (input.action === 'revoke') return response(await revokeReviewer(db, trusted, {reviewerId: input.reviewerId, reason: input.reason}));
      fail(400, 'invalid_reviewer_attestation');
    }
    const reportMatch = pathname.match(/^\/api\/admin\/hadith-reports\/([A-Za-z0-9][A-Za-z0-9_.:-]{0,139})(?:\/(approve|withdraw))?$/);
    if (reportMatch) {
      const [, reportId, action] = reportMatch;
      if (!action && request.method === 'GET') { staff(actor); return response(await reportDocument(db, reportId)); }
      if (!action || request.method !== 'POST') fail(405, 'method_not_allowed');
      sameOrigin(request);
      if (action === 'approve') { const trusted = staff(actor); return response(await approveReport(db, trusted, reportId)); }
      const trusted = staff(actor); return response(await withdrawReport(db, trusted, reportId, await jsonBody(request)));
    }
    return response({error: 'not_found'}, 404);
  } catch (error) {
    if (error instanceof HadithProblem) return response({error: error.code}, error.status);
    return response({error: 'hadith_service_unavailable'}, 503);
  }
}
