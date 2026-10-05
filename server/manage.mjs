// Management routes receive an already verified actor from the parent server. Never derive an
// identity or role from a request. This module deliberately stores only curated metadata and
// versioned community overlays; it never replaces the bundled government directory source.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const starterPath = path.join(publicDirectory, 'data', 'starter-resources.json');
const directoryPath = path.join(publicDirectory, 'data', 'mosques-anuradhapura.json');
const MAX_BODY_BYTES = 32_768;
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const PAGE_MAX = 1_000;
const STAFF_ROLES = new Set(['owner', 'author', 'reviewer', 'publisher']);
const CURATION_ROLES = new Set(['owner', 'publisher']);
const CORRECTION_PROPOSE_ROLES = new Set(['owner', 'publisher', 'reviewer']);
const CORRECTION_REVIEW_ROLES = new Set(['owner', 'reviewer']);
const RESOURCE_CATEGORIES = new Set([
  'Getting started with Quran study',
  'Finding source references',
  'Everyday learning and good character',
  'Family and community learning',
  'New Muslim learning resources',
  'Local community information',
]);
const LINK_STATES = new Set(['verified', 'unchecked', 'broken']);
const REVIEW_STATES = new Set(['draft', 'reviewed']);
const RESOURCE_STATES = new Set(['active', 'archived']);
const CORRECTION_STATES = new Set(['proposed', 'reviewed', 'rejected', 'applied']);
const INTAKE_STATES = new Set(['new', 'assigned', 'resolved', 'redacted']);
const RESOLUTION_CODES = new Set(['addressed', 'duplicate', 'not_actionable', 'out_of_scope']);
let starterCache = null;
let directoryCache = null;

class Problem extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

const fail = (status, code) => { throw new Problem(status, code); };
const rows = result => Array.isArray(result?.results) ? result.results : [];
const changed = result => Number(result?.meta?.changes ?? result?.changes ?? 0);
const now = () => new Date().toISOString();

function response(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie',
    },
  });
}

function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

function text(value, max, required = false, code = 'invalid_input') {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) fail(400, code);
  const clean = value.trim();
  if (required && !clean) fail(400, code);
  return clean;
}

function optionalText(value, max, code) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, max, true, code);
}

function onlyKeys(input, allowed, code) {
  if (!isObject(input)) fail(400, code);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(400, code);
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeId(value, code = 'invalid_id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)) fail(400, code);
  return value;
}

function httpsUrl(value, required, code) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, code);
    return null;
  }
  const clean = text(value, 2_000, true, code);
  let parsed;
  try { parsed = new URL(clean); } catch { fail(400, code); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) fail(400, code);
  return parsed.toString();
}

function dateOnly(value, code) {
  const clean = text(value, 10, true, code);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) fail(400, code);
  if (clean > new Date().toISOString().slice(0, 10)) fail(400, code);
  return clean;
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'same_origin_required');
}

async function jsonBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail(413, 'too_large');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_json');
  const parts = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); fail(413, 'too_large'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let input;
  try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'invalid_json'); }
  if (!isObject(input)) fail(400, 'invalid_json');
  return input;
}

function verifiedActor(actor) {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim() || actor.id.length > 191 || typeof actor.role !== 'string') fail(401, 'sign_in_required');
  return actor;
}

function requireRole(actor, roles) {
  const value = verifiedActor(actor);
  if (!roles.has(value.role)) fail(403, 'forbidden');
  return value;
}

function owner(actor) { return requireRole(actor, new Set(['owner'])); }

function pageParameters(url, options = {}) {
  const pageValue = url.searchParams.get('page') || '1';
  const pageSizeValue = url.searchParams.get('pageSize') || String(options.defaultSize || PAGE_SIZE_DEFAULT);
  if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(pageSizeValue)) fail(400, 'invalid_page');
  const page = Number(pageValue);
  const pageSize = Number(pageSizeValue);
  if (!Number.isSafeInteger(page) || page > PAGE_MAX || !Number.isSafeInteger(pageSize) || pageSize > PAGE_SIZE_MAX) fail(400, 'invalid_page');
  return {page, pageSize, offset: (page - 1) * pageSize};
}

async function catalogue(env = {}) {
  if (Array.isArray(env.STATIC_RESOURCES)) return env.STATIC_RESOURCES;
  if (!starterCache) {
    let parsed;
    try { parsed = JSON.parse(await readFile(starterPath, 'utf8')); } catch { fail(503, 'resource_catalogue_unavailable'); }
    const items = Array.isArray(parsed?.items) ? parsed.items : null;
    if (!items) fail(503, 'resource_catalogue_unavailable');
    starterCache = items;
  }
  return starterCache;
}

async function governmentDirectory(env = {}) {
  if (Array.isArray(env.GOVERNMENT_DIRECTORY)) return env.GOVERNMENT_DIRECTORY;
  if (!directoryCache) {
    try { directoryCache = JSON.parse(await readFile(directoryPath, 'utf8')); } catch { fail(503, 'directory_source_unavailable'); }
    if (!Array.isArray(directoryCache)) fail(503, 'directory_source_unavailable');
  }
  return directoryCache;
}

function staticResource(item) {
  if (!item || item.verified !== true || typeof item.id !== 'string') return null;
  try {
    return {
      id: safeId(item.id, 'resource_catalogue_unavailable'),
      recordId: null,
      seedKey: item.id,
      source: 'primary_publisher_seed',
      title: text(item.title, 240, true, 'resource_catalogue_unavailable'),
      publisher: text(item.publisher, 240, true, 'resource_catalogue_unavailable'),
      publisherUrl: httpsUrl(item.evidence_url, true, 'resource_catalogue_unavailable'),
      url: httpsUrl(item.url, true, 'resource_catalogue_unavailable'),
      summary: text(item.summary, 4_000, true, 'resource_catalogue_unavailable'),
      category: text(item.category, 160, true, 'resource_catalogue_unavailable'),
      languages: Array.isArray(item.languages) ? item.languages.map(value => text(String(value), 64, true, 'resource_catalogue_unavailable')) : [],
      format: text(item.format, 80, true, 'resource_catalogue_unavailable'),
      rightsNote: text(item.rightsNote, 4_000, true, 'resource_catalogue_unavailable'),
      lastCheckedOn: typeof item.reviewedAt === 'string' ? item.reviewedAt : '2026-10-05',
      linkStatus: 'verified',
      reviewState: 'reviewed',
      status: 'active',
      createdAt: typeof item.reviewedAt === 'string' ? `${item.reviewedAt}T00:00:00.000Z` : null,
      updatedAt: typeof item.reviewedAt === 'string' ? `${item.reviewedAt}T00:00:00.000Z` : null,
      createdBy: 'static-primary-publisher-catalogue',
      updatedBy: 'static-primary-publisher-catalogue',
      archivedAt: null,
    };
  } catch { return null; }
}

function rowResource(row, source = 'managed') {
  const languages = safeJson(row.languages_json, []);
  return {
    id: row.seed_key || row.id,
    recordId: row.id,
    seedKey: row.seed_key || null,
    source,
    title: row.title,
    publisher: row.publisher,
    publisherUrl: row.publisher_url,
    url: row.resource_url,
    summary: row.summary,
    category: row.category,
    languages: Array.isArray(languages) ? languages : [],
    format: row.resource_format,
    rightsNote: row.rights_note,
    lastCheckedOn: row.last_checked_on,
    linkStatus: row.link_status,
    reviewState: row.review_state,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    archivedAt: row.archived_at || null,
  };
}

function publicEligible(resource) {
  return resource.status === 'active' && resource.reviewState === 'reviewed' && resource.linkStatus === 'verified';
}

function visitorResource(item) {
  // A later owner-approved public read mode must not expose internal staff account IDs,
  // revision timestamps, override keys or database record IDs through the catalogue.
  const {id,source,title,publisher,publisherUrl,url,summary,category,languages,format,rightsNote,lastCheckedOn} = item;
  return {id,source,title,publisher,publisherUrl,url,summary,category,languages,format,rightsNote,lastCheckedOn,saveEligible:true,saveEligibility:'server_validated'};
}

function stringArray(value, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) fail(400, code);
  const output = [];
  const seen = new Set();
  for (const entry of value) {
    const clean = text(entry, 64, true, code);
    const key = clean.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); output.push(clean); }
  }
  return output;
}

/** Validate server-owned resource metadata. Both original URL and publisher evidence URL must be HTTPS. */
export function validateManagedResource(input) {
  onlyKeys(input, new Set(['title', 'publisher', 'publisherUrl', 'url', 'summary', 'category', 'languages', 'format', 'rightsNote', 'lastCheckedOn', 'linkStatus', 'reviewState', 'status']), 'invalid_resource');
  const category = text(input.category, 160, true, 'invalid_resource');
  if (!RESOURCE_CATEGORIES.has(category)) fail(400, 'invalid_resource');
  const linkStatus = text(input.linkStatus, 16, true, 'invalid_resource');
  const reviewState = text(input.reviewState, 16, true, 'invalid_resource');
  const status = text(input.status, 16, true, 'invalid_resource');
  if (!LINK_STATES.has(linkStatus) || !REVIEW_STATES.has(reviewState) || !RESOURCE_STATES.has(status)) fail(400, 'invalid_resource');
  const result = {
    title: text(input.title, 240, true, 'invalid_resource'),
    publisher: text(input.publisher, 240, true, 'invalid_resource'),
    publisherUrl: httpsUrl(input.publisherUrl, true, 'invalid_resource'),
    url: httpsUrl(input.url, true, 'invalid_resource'),
    summary: text(input.summary, 4_000, true, 'invalid_resource'),
    category,
    languages: stringArray(input.languages, 'invalid_resource'),
    format: text(input.format, 80, true, 'invalid_resource'),
    rightsNote: text(input.rightsNote, 4_000, true, 'invalid_resource'),
    lastCheckedOn: dateOnly(input.lastCheckedOn, 'invalid_resource'),
    linkStatus,
    reviewState,
    status,
  };
  // A link cannot be visitor-visible merely because a caller says it is reviewed.
  if (result.reviewState === 'reviewed' && result.linkStatus !== 'verified') fail(400, 'link_verification_required');
  return result;
}

function sameResourceMetadata(left, right) {
  return left.title === right.title && left.publisher === right.publisher && left.publisherUrl === right.publisherUrl &&
    left.url === right.url && left.summary === right.summary && left.category === right.category &&
    JSON.stringify(left.languages) === JSON.stringify(right.languages) && left.format === right.format &&
    left.rightsNote === right.rightsNote && left.lastCheckedOn === right.lastCheckedOn;
}

function auditSummary(summary) {
  const source = isObject(summary) ? summary : {};
  // This intentionally accepts only short operational metadata, never raw intake details/contact.
  const output = {};
  for (const key of ['state', 'directoryEntry', 'seedKey', 'settingKey', 'assignee', 'resolutionCode', 'count']) {
    if (source[key] !== undefined && source[key] !== null) output[key] = String(source[key]).slice(0, 160);
  }
  return JSON.stringify(output);
}

async function recordAudit(db, actor, category, action, targetType, targetId, summary = {}) {
  const at = now();
  const compact = auditSummary(summary);
  const statements = [
    db.prepare('INSERT INTO management_audit_events (id,category,action,target_type,target_id,actor_id,actor_role,summary_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(
      crypto.randomUUID(), category, action, targetType, targetId, actor.id, actor.role, compact, at,
    ),
    // Parent access/session code can append role changes to this stable, append-only contract too.
    db.prepare('INSERT INTO review_admin_audit (id,actor_id,action,target_type,target_id,summary,created_at) VALUES (?,?,?,?,?,?,?)').bind(
      crypto.randomUUID(), actor.id, action, targetType, targetId, compact, at,
    ),
  ];
  await db.batch(statements);
  return at;
}

async function seedOverrides(db) {
  const result = await db.prepare('SELECT * FROM managed_resources WHERE seed_key IS NOT NULL').all();
  return new Map(rows(result).map(row => [row.seed_key, row]));
}

function resourceMatches(item, filters) {
  if (filters.status && item.status !== filters.status) return false;
  if (filters.reviewState && item.reviewState !== filters.reviewState) return false;
  if (filters.category && item.category !== filters.category) return false;
  if (filters.language && !item.languages.some(value => value.toLocaleLowerCase() === filters.language.toLocaleLowerCase())) return false;
  if (filters.query) {
    const haystack = [item.title, item.publisher, item.summary, item.category, item.format, ...(item.languages || [])].join(' ').toLocaleLowerCase();
    if (!haystack.includes(filters.query.toLocaleLowerCase())) return false;
  }
  return true;
}

function resourceFilters(url, admin = false) {
  const query = text(url.searchParams.get('q') || '', 120, false, 'invalid_search');
  const category = text(url.searchParams.get('category') || '', 160, false, 'invalid_filter');
  const language = text(url.searchParams.get('language') || '', 64, false, 'invalid_filter');
  const status = text(url.searchParams.get('status') || '', 16, false, 'invalid_filter');
  const reviewState = text(url.searchParams.get('review') || '', 16, false, 'invalid_filter');
  if (category && !RESOURCE_CATEGORIES.has(category)) fail(400, 'invalid_filter');
  if (status && !RESOURCE_STATES.has(status)) fail(400, 'invalid_filter');
  if (reviewState && !REVIEW_STATES.has(reviewState)) fail(400, 'invalid_filter');
  if (!admin && (status || reviewState)) fail(400, 'invalid_filter');
  return {query, category, language, status, reviewState};
}

function customResourceSql(filters, publicOnly) {
  const clauses = ['seed_key IS NULL'];
  const values = [];
  if (publicOnly) clauses.push("status='active'", "review_state='reviewed'", "link_status='verified'");
  if (filters.status) { clauses.push('status=?'); values.push(filters.status); }
  if (filters.reviewState) { clauses.push('review_state=?'); values.push(filters.reviewState); }
  if (filters.category) { clauses.push('category=?'); values.push(filters.category); }
  if (filters.language) { clauses.push('languages_json LIKE ?'); values.push(`%\"${filters.language.replace(/[\\%_]/g, '\\$&')}\"%`); }
  if (filters.query) {
    const like = `%${filters.query.replace(/[!%_]/g, '!$&')}%`;
    clauses.push("(title LIKE ? ESCAPE '!' OR publisher LIKE ? ESCAPE '!' OR summary LIKE ? ESCAPE '!' OR category LIKE ? ESCAPE '!')");
    values.push(like, like, like, like);
  }
  return {where: clauses.join(' AND '), values};
}

async function pageResources(db, env, url, admin = false) {
  const {page, pageSize, offset} = pageParameters(url, {defaultSize: admin ? 25 : 48});
  const filters = resourceFilters(url, admin);
  const [items, overrides] = await Promise.all([catalogue(env), seedOverrides(db)]);
  const seeds = items.map(staticResource).filter(Boolean).map(base => {
    const override = overrides.get(base.seedKey);
    return override ? {...rowResource(override, 'seed_override'), id: base.id, seedKey: base.seedKey} : base;
  }).filter(item => (admin || publicEligible(item)) && resourceMatches(item, filters));
  const {where, values} = customResourceSql(filters, !admin);
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM managed_resources WHERE ${where}`).bind(...values).first();
  const customTotal = Number(count?.count || 0);
  const total = seeds.length + customTotal;
  const output = seeds.slice(offset, offset + pageSize);
  const customOffset = Math.max(0, offset - seeds.length);
  const remaining = pageSize - output.length;
  if (remaining > 0 && customOffset < customTotal) {
    // Integers originate from pageParameters and are bounded. The MySQL driver in this project
    // rejects placeholder LIMIT/OFFSET in some deployments, so they are interpolated only after validation.
    const query = `SELECT * FROM managed_resources WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ${remaining} OFFSET ${customOffset}`;
    const managed = await db.prepare(query).bind(...values).all();
    output.push(...rows(managed).map(row => rowResource(row)));
  }
  return {
    items: output.map(item => admin
      ? {...item, saveEligible: publicEligible(item), saveEligibility: publicEligible(item) ? 'server_validated' : 'not_eligible'}
      : visitorResource(item)),
    page,
    pageSize,
    total,
    hasMore: offset + pageSize < total,
  };
}

async function resourceDocument(db, id) {
  const row = await db.prepare('SELECT * FROM managed_resources WHERE id=?').bind(safeId(id, 'invalid_resource_id')).first();
  if (!row) fail(404, 'not_found');
  const version = await db.prepare('SELECT MAX(version) AS version FROM managed_resource_revisions WHERE resource_id=?').bind(id).first();
  return {row, resource: rowResource(row), version: Number(version?.version || 0)};
}

async function insertResource(db, actor, resource, seedKey = null) {
  const at = now();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO managed_resources (id,seed_key,title,publisher,publisher_url,resource_url,summary,category,languages_json,resource_format,rights_note,last_checked_on,link_status,review_state,status,created_by,created_at,updated_by,updated_at,archived_by,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
      id, seedKey, resource.title, resource.publisher, resource.publisherUrl, resource.url, resource.summary, resource.category,
      JSON.stringify(resource.languages), resource.format, resource.rightsNote, resource.lastCheckedOn, resource.linkStatus,
      resource.reviewState, resource.status, actor.id, at, actor.id, at,
      resource.status === 'archived' ? actor.id : null, resource.status === 'archived' ? at : null,
    ),
    db.prepare('INSERT INTO managed_resource_revisions (resource_id,version,action,snapshot_json,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?,?)').bind(
      id, 1, 'create', JSON.stringify(resource), actor.id, actor.role, at,
    ),
  ]);
  await recordAudit(db, actor, 'resource', 'create', 'resource', id, {seedKey: seedKey || undefined, state: resource.status});
  return resourceDocument(db, id);
}

async function createResource(db, env, actor, input) {
  onlyKeys(input, new Set(['resource', 'seedKey']), 'invalid_resource');
  const resource = validateManagedResource(input.resource);
  let seedKey = null;
  if (input.seedKey !== undefined && input.seedKey !== null && input.seedKey !== '') {
    seedKey = safeId(input.seedKey, 'invalid_resource');
    const seeds = (await catalogue(env)).map(staticResource).filter(Boolean);
    if (!seeds.some(item => item.seedKey === seedKey)) fail(400, 'unknown_seed_resource');
    const existing = await db.prepare('SELECT id FROM managed_resources WHERE seed_key=?').bind(seedKey).first();
    if (existing) fail(409, 'seed_already_managed');
  }
  return insertResource(db, actor, resource, seedKey);
}

async function updateResource(db, actor, id, input) {
  onlyKeys(input, new Set(['baseVersion', 'resource']), 'invalid_resource');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1) fail(400, 'invalid_revision');
  const document = await resourceDocument(db, id);
  if (document.version !== input.baseVersion) fail(409, 'revision_conflict');
  if (document.resource.status === 'archived') fail(409, 'resource_archived');
  const desired = validateManagedResource(input.resource);
  const existing = document.resource;
  const recheckNeeded = !sameResourceMetadata(existing, desired);
  // A metadata/link edit is never silently treated as a completed review. It must be
  // saved and then explicitly marked verified/reviewed against the newly checked source.
  if (recheckNeeded) {
    desired.linkStatus = 'unchecked';
    desired.reviewState = 'draft';
  }
  desired.status = 'active';
  const at = now();
  const version = document.version + 1;
  const result = await db.batch([
    db.prepare('UPDATE managed_resources SET title=?,publisher=?,publisher_url=?,resource_url=?,summary=?,category=?,languages_json=?,resource_format=?,rights_note=?,last_checked_on=?,link_status=?,review_state=?,status=?,updated_by=?,updated_at=? WHERE id=? AND updated_at=?').bind(
      desired.title, desired.publisher, desired.publisherUrl, desired.url, desired.summary, desired.category, JSON.stringify(desired.languages), desired.format,
      desired.rightsNote, desired.lastCheckedOn, desired.linkStatus, desired.reviewState, desired.status, actor.id, at, id, document.row.updated_at,
    ),
    db.prepare('INSERT INTO managed_resource_revisions (resource_id,version,action,snapshot_json,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?,?)').bind(
      id, version, 'save', JSON.stringify(desired), actor.id, actor.role, at,
    ),
  ]);
  if (changed(result?.[0]) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db, actor, 'resource', 'save', 'resource', id, {state: desired.reviewState});
  return resourceDocument(db, id);
}

async function archiveResource(db, actor, id, input, restore = false) {
  onlyKeys(input, new Set(['baseVersion', 'confirm']), 'invalid_resource');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1) fail(400, 'invalid_revision');
  if (input.confirm !== (restore ? 'RESTORE RESOURCE' : 'ARCHIVE RESOURCE')) fail(400, 'archive_confirmation_required');
  const document = await resourceDocument(db, id);
  if (document.version !== input.baseVersion) fail(409, 'revision_conflict');
  if ((!restore && document.resource.status === 'archived') || (restore && document.resource.status !== 'archived')) fail(409, 'invalid_transition');
  const at = now();
  const version = document.version + 1;
  const snapshot = {...document.resource, status: restore ? 'active' : 'archived', archivedAt: restore ? null : at};
  const result = await db.batch([
    db.prepare('UPDATE managed_resources SET status=?,archived_by=?,archived_at=?,updated_by=?,updated_at=? WHERE id=? AND updated_at=?').bind(
      restore ? 'active' : 'archived', restore ? null : actor.id, restore ? null : at, actor.id, at, id, document.row.updated_at,
    ),
    db.prepare('INSERT INTO managed_resource_revisions (resource_id,version,action,snapshot_json,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?,?)').bind(
      id, version, restore ? 'restore' : 'archive', JSON.stringify(snapshot), actor.id, actor.role, at,
    ),
  ]);
  if (changed(result?.[0]) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db, actor, 'resource', restore ? 'restore' : 'archive', 'resource', id, {state: snapshot.status});
  return resourceDocument(db, id);
}

async function resourceHistory(db, id, url) {
  const {page, pageSize, offset} = pageParameters(url);
  safeId(id, 'invalid_resource_id');
  const count = await db.prepare('SELECT COUNT(*) AS count FROM managed_resource_revisions WHERE resource_id=?').bind(id).first();
  const result = await db.prepare(`SELECT version,action,snapshot_json,actor_id,actor_role,created_at FROM managed_resource_revisions WHERE resource_id=? ORDER BY version DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(id).all();
  const total = Number(count?.count || 0);
  return {
    items: rows(result).map(item => ({version: Number(item.version), action: item.action, actor: {id: item.actor_id, role: item.actor_role}, createdAt: item.created_at, snapshot: safeJson(item.snapshot_json, {})})),
    page, pageSize, total, hasMore: offset + pageSize < total,
  };
}

function directoryEntry(directory, entry) {
  if (!Number.isInteger(entry) || entry < 1 || entry > 10_000) fail(400, 'invalid_directory_entry');
  const found = directory.find(item => Number(item?.entry) === entry);
  if (!found) fail(404, 'directory_entry_not_found');
  // Snapshot the source fields as supplied; no transformation is a factual correction.
  return {entry: Number(found.entry), registration: String(found.registration || ''), name: String(found.name || ''), type: String(found.type || ''), address: String(found.address || ''), city: String(found.city || ''), page: Number(found.page || 0)};
}

function correctionProposal(input) {
  onlyKeys(input, new Set(['directoryEntry', 'proposal', 'evidenceUrl', 'evidenceNote']), 'invalid_correction');
  if (!isObject(input.proposal)) fail(400, 'invalid_correction');
  const proposal = {};
  for (const key of ['name', 'type', 'address', 'city']) {
    if (input.proposal[key] === undefined || input.proposal[key] === null || input.proposal[key] === '') continue;
    proposal[key] = text(input.proposal[key], key === 'address' ? 500 : 240, true, 'invalid_correction');
  }
  if (!Object.keys(proposal).length) fail(400, 'proposal_required');
  return {
    directoryEntry: input.directoryEntry,
    proposal,
    evidenceUrl: httpsUrl(input.evidenceUrl, true, 'invalid_correction'),
    evidenceNote: text(input.evidenceNote, 1_000, true, 'invalid_correction'),
  };
}

function correctionView(row, version = 0) {
  return {
    id: row.id,
    directoryEntry: Number(row.directory_entry),
    original: safeJson(row.original_json, {}),
    proposal: safeJson(row.proposal_json, {}),
    evidenceUrl: row.evidence_url,
    evidenceNote: row.evidence_note,
    state: row.state,
    version: Number(version),
    createdBy: row.created_by,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    appliedBy: row.applied_by || null,
    appliedAt: row.applied_at || null,
  };
}

async function correctionDocument(db, id) {
  const row = await db.prepare('SELECT * FROM mosque_corrections WHERE id=?').bind(safeId(id, 'invalid_correction_id')).first();
  if (!row) fail(404, 'not_found');
  const version = await db.prepare('SELECT MAX(version) AS version FROM mosque_correction_revisions WHERE correction_id=?').bind(id).first();
  return {row, correction: correctionView(row, Number(version?.version || 0)), version: Number(version?.version || 0)};
}

async function createCorrection(db, env, actor, input) {
  const proposed = correctionProposal(input);
  const original = directoryEntry(await governmentDirectory(env), proposed.directoryEntry);
  const id = crypto.randomUUID();
  const at = now();
  const snapshot = {directoryEntry: original.entry, original, proposal: proposed.proposal, evidenceUrl: proposed.evidenceUrl, evidenceNote: proposed.evidenceNote, state: 'proposed'};
  await db.batch([
    db.prepare('INSERT INTO mosque_corrections (id,directory_entry,original_json,proposal_json,evidence_url,evidence_note,state,created_by,created_at,reviewed_by,reviewed_at,applied_by,applied_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)').bind(
      id, original.entry, JSON.stringify(original), JSON.stringify(proposed.proposal), proposed.evidenceUrl, proposed.evidenceNote, 'proposed', actor.id, at,
    ),
    db.prepare('INSERT INTO mosque_correction_revisions (correction_id,version,state,snapshot_json,actor_id,actor_role,action,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(
      id, 1, 'proposed', JSON.stringify(snapshot), actor.id, actor.role, 'propose', at,
    ),
  ]);
  await recordAudit(db, actor, 'mosque', 'propose', 'mosque_correction', id, {directoryEntry: original.entry, state: 'proposed'});
  return correctionDocument(db, id);
}

async function reviseCorrection(db, env, actor, id, input) {
  onlyKeys(input, new Set(['baseVersion', 'correction']), 'invalid_correction');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1) fail(400, 'invalid_revision');
  const document = await correctionDocument(db, id);
  if (document.version !== input.baseVersion) fail(409, 'revision_conflict');
  if (document.correction.state !== 'proposed') fail(409, 'invalid_transition');
  if (actor.role !== 'owner' && document.correction.createdBy !== actor.id) fail(403, 'forbidden');
  const proposed = correctionProposal(input.correction);
  const original = directoryEntry(await governmentDirectory(env), proposed.directoryEntry);
  const at = now();
  const version = document.version + 1;
  const snapshot = {directoryEntry: original.entry, original, proposal: proposed.proposal, evidenceUrl: proposed.evidenceUrl, evidenceNote: proposed.evidenceNote, state: 'proposed'};
  const result = await db.batch([
    db.prepare('UPDATE mosque_corrections SET directory_entry=?,original_json=?,proposal_json=?,evidence_url=?,evidence_note=? WHERE id=? AND state=?').bind(
      original.entry, JSON.stringify(original), JSON.stringify(proposed.proposal), proposed.evidenceUrl, proposed.evidenceNote, id, 'proposed',
    ),
    db.prepare('INSERT INTO mosque_correction_revisions (correction_id,version,state,snapshot_json,actor_id,actor_role,action,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(
      id, version, 'proposed', JSON.stringify(snapshot), actor.id, actor.role, 'revise', at,
    ),
  ]);
  if (changed(result?.[0]) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db, actor, 'mosque', 'revise', 'mosque_correction', id, {directoryEntry: original.entry, state: 'proposed'});
  return correctionDocument(db, id);
}

async function reviewCorrection(db, actor, id, input) {
  onlyKeys(input, new Set(['baseVersion', 'decision']), 'invalid_correction');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1 || !['reviewed', 'rejected'].includes(input.decision)) fail(400, 'invalid_correction');
  const document = await correctionDocument(db, id);
  if (document.version !== input.baseVersion) fail(409, 'revision_conflict');
  if (document.correction.state !== 'proposed') fail(409, 'invalid_transition');
  const at = now();
  const version = document.version + 1;
  const snapshot = {...document.correction, state: input.decision};
  const result = await db.batch([
    db.prepare('UPDATE mosque_corrections SET state=?,reviewed_by=?,reviewed_at=? WHERE id=? AND state=?').bind(input.decision, actor.id, at, id, 'proposed'),
    db.prepare('INSERT INTO mosque_correction_revisions (correction_id,version,state,snapshot_json,actor_id,actor_role,action,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(
      id, version, input.decision, JSON.stringify(snapshot), actor.id, actor.role, input.decision, at,
    ),
  ]);
  if (changed(result?.[0]) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db, actor, 'mosque', input.decision, 'mosque_correction', id, {directoryEntry: document.correction.directoryEntry, state: input.decision});
  return correctionDocument(db, id);
}

async function applyCorrection(db, actor, id, input) {
  onlyKeys(input, new Set(['baseVersion', 'confirm']), 'invalid_correction');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1 || input.confirm !== 'APPLY COMMUNITY OVERLAY') fail(400, 'apply_confirmation_required');
  const document = await correctionDocument(db, id);
  if (document.version !== input.baseVersion) fail(409, 'revision_conflict');
  if (document.correction.state !== 'reviewed') fail(409, 'invalid_transition');
  const at = now();
  const version = document.version + 1;
  const overlay = {directoryEntry: document.correction.directoryEntry, proposal: document.correction.proposal, source: 'community_correction_overlay', correctionId: id, appliedAt: at};
  const snapshot = {...document.correction, state: 'applied', appliedBy: actor.id, appliedAt: at};
  const result = await db.batch([
    db.prepare('UPDATE mosque_corrections SET state=?,applied_by=?,applied_at=? WHERE id=? AND state=?').bind('applied', actor.id, at, id, 'reviewed'),
    db.prepare('INSERT INTO mosque_correction_revisions (correction_id,version,state,snapshot_json,actor_id,actor_role,action,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(
      id, version, 'applied', JSON.stringify(snapshot), actor.id, actor.role, 'apply', at,
    ),
    db.prepare('INSERT INTO mosque_directory_overlays (directory_entry,correction_id,overlay_json,applied_by,applied_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE correction_id=VALUES(correction_id),overlay_json=VALUES(overlay_json),applied_by=VALUES(applied_by),applied_at=VALUES(applied_at)').bind(
      document.correction.directoryEntry, id, JSON.stringify(overlay), actor.id, at,
    ),
  ]);
  if (changed(result?.[0]) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db, actor, 'mosque', 'apply', 'mosque_correction', id, {directoryEntry: document.correction.directoryEntry, state: 'applied'});
  return correctionDocument(db, id);
}

async function pageCorrections(db, url) {
  const {page, pageSize, offset} = pageParameters(url);
  const state = text(url.searchParams.get('state') || '', 16, false, 'invalid_filter');
  const search = text(url.searchParams.get('q') || '', 120, false, 'invalid_search');
  if (state && !CORRECTION_STATES.has(state)) fail(400, 'invalid_filter');
  const clauses = [];
  const values = [];
  if (state) { clauses.push('state=?'); values.push(state); }
  if (search) { clauses.push('(CAST(directory_entry AS CHAR) LIKE ? OR evidence_note LIKE ?)'); const like = `%${search.replace(/[!%_]/g, '!$&')}%`; values.push(like, like); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM mosque_corrections ${where}`).bind(...values).first();
  const listing = await db.prepare(`SELECT * FROM mosque_corrections ${where} ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  const records = [];
  for (const row of rows(listing)) {
    const version = await db.prepare('SELECT MAX(version) AS version FROM mosque_correction_revisions WHERE correction_id=?').bind(row.id).first();
    records.push(correctionView(row, Number(version?.version || 0)));
  }
  const total = Number(count?.count || 0);
  return {items: records, page, pageSize, total, hasMore: offset + pageSize < total};
}

async function publicOverlays(db) {
  const result = await db.prepare('SELECT o.directory_entry,o.correction_id,o.overlay_json,o.applied_at,c.evidence_url FROM mosque_directory_overlays o JOIN mosque_corrections c ON c.id=o.correction_id ORDER BY o.directory_entry ASC').all();
  return rows(result).map(row => ({
    directoryEntry: Number(row.directory_entry),
    correctionId: row.correction_id,
    overlay: safeJson(row.overlay_json, {}),
    evidenceUrl: row.evidence_url,
    attribution: {type: 'community_correction_overlay', appliedAt: row.applied_at, governmentSourcePreserved: true},
  }));
}

// The directory fields are copied exactly from the bundled government-source dataset. An
// applied correction is separate metadata, not a mutation or reclassification of that record.
async function publicMosques(db, env) {
  const [directory, overlays] = await Promise.all([governmentDirectory(env), publicOverlays(db)]);
  const byEntry = new Map(overlays.map(item => [item.directoryEntry, item]));
  return {
    source: {
      type: 'government_directory',
      publisher: 'Department of Muslim Religious and Cultural Affairs, Sri Lanka',
      url: 'https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/ANURADHAPURA-DISTRICT.pdf',
      dataset: 'Anuradhapura District Registered Mosque List',
      governmentRecordsPreserved: true,
    },
    items: directory.map(item => {
      const original = {...item};
      const overlay = byEntry.get(Number(item?.entry));
      if (!overlay) return original;
      return {
        ...original,
        correction: {
          type: 'community_correction_overlay',
          status: 'applied',
          correctionId: overlay.correctionId,
          proposedFields: overlay.overlay?.proposal || {},
          evidenceUrl: overlay.evidenceUrl,
          appliedAt: overlay.attribution.appliedAt,
          governmentRecordUnchanged: true,
        },
      };
    }),
  };
}

async function intakeRecord(db, id) {
  const row = await db.prepare(`SELECT s.id,s.kind,s.purpose,s.contact_preference,s.contact_value,s.details,s.consented_at,s.created_at,s.deleted_at,s.deleted_by,
      w.state,w.assigned_to,w.resolved_code,w.updated_by,w.updated_at
    FROM community_submissions s LEFT JOIN management_intake_state w ON w.submission_id=s.id WHERE s.id=?`).bind(safeId(id, 'invalid_submission_id')).first();
  if (!row) fail(404, 'not_found');
  return row;
}

function intakeView(row) {
  const redacted = !!row.deleted_at || row.state === 'redacted';
  const state = row.state || (redacted ? 'redacted' : 'new');
  const output = {
    id: row.id, kind: row.kind, purpose: row.purpose, createdAt: row.created_at, state,
    assignedTo: row.assigned_to || null, resolvedCode: row.resolved_code || null,
    updatedAt: row.updated_at || row.created_at, redacted,
  };
  if (!redacted) {
    output.contactPreference = row.contact_preference;
    output.contact = row.contact_value;
    output.details = row.details;
    output.consentedAt = row.consented_at;
  }
  return output;
}

async function pageIntake(db, url) {
  const {page, pageSize, offset} = pageParameters(url);
  const kind = text(url.searchParams.get('kind') || '', 16, false, 'invalid_filter');
  const state = text(url.searchParams.get('state') || '', 16, false, 'invalid_filter');
  if (kind && !['participation', 'correction'].includes(kind)) fail(400, 'invalid_filter');
  if (state && !INTAKE_STATES.has(state)) fail(400, 'invalid_filter');
  const derived = "COALESCE(w.state, CASE WHEN s.deleted_at IS NOT NULL THEN 'redacted' ELSE 'new' END)";
  const clauses = [];
  const values = [];
  if (kind) { clauses.push('s.kind=?'); values.push(kind); }
  if (state) { clauses.push(`${derived}=?`); values.push(state); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM community_submissions s LEFT JOIN management_intake_state w ON w.submission_id=s.id ${where}`).bind(...values).first();
  const listing = await db.prepare(`SELECT s.id,s.kind,s.purpose,s.contact_preference,s.contact_value,s.details,s.consented_at,s.created_at,s.deleted_at,s.deleted_by,
      w.state,w.assigned_to,w.resolved_code,w.updated_by,w.updated_at
      FROM community_submissions s LEFT JOIN management_intake_state w ON w.submission_id=s.id ${where}
      ORDER BY s.created_at DESC, s.id DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  const total = Number(count?.count || 0);
  return {items: rows(listing).map(intakeView), page, pageSize, total, hasMore: offset + pageSize < total};
}

async function setIntakeState(db, submissionId, state, actor, {assignedTo = null, resolvedCode = null} = {}) {
  const at = now();
  const update = await db.prepare('UPDATE management_intake_state SET state=?,assigned_to=?,resolved_code=?,updated_by=?,updated_at=? WHERE submission_id=?').bind(
    state, assignedTo, resolvedCode, actor.id, at, submissionId,
  ).run();
  if (!changed(update)) {
    try {
      await db.prepare('INSERT INTO management_intake_state (submission_id,state,assigned_to,resolved_code,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(
        submissionId, state, assignedTo, resolvedCode, actor.id, at,
      ).run();
    } catch (error) {
      if (!/duplicate|unique/i.test(String(error?.message || error))) throw error;
      await db.prepare('UPDATE management_intake_state SET state=?,assigned_to=?,resolved_code=?,updated_by=?,updated_at=? WHERE submission_id=?').bind(
        state, assignedTo, resolvedCode, actor.id, at, submissionId,
      ).run();
    }
  }
  return at;
}

async function intakeAction(db, actor, id, action, input) {
  const record = await intakeRecord(db, id);
  if (record.deleted_at && action !== 'redact') fail(409, 'submission_redacted');
  let state;
  let assignedTo = null;
  let resolvedCode = null;
  if (action === 'assign') {
    onlyKeys(input, new Set(['assigneeId']), 'invalid_intake_action');
    assignedTo = text(input.assigneeId, 191, true, 'invalid_intake_action');
    const assignee = await db.prepare("SELECT user_id FROM review_roles WHERE user_id=? AND disabled=0 AND role IN ('owner','author','reviewer','publisher')").bind(assignedTo).first();
    if (!assignee) fail(400, 'invalid_assignee');
    state = 'assigned';
  } else if (action === 'resolve') {
    onlyKeys(input, new Set(['resolutionCode']), 'invalid_intake_action');
    resolvedCode = text(input.resolutionCode, 40, true, 'invalid_intake_action');
    if (!RESOLUTION_CODES.has(resolvedCode)) fail(400, 'invalid_intake_action');
    state = 'resolved';
    assignedTo = record.assigned_to || null;
  } else if (action === 'redact') {
    onlyKeys(input, new Set(['confirm']), 'invalid_intake_action');
    if (input.confirm !== 'REDACT SUBMISSION') fail(400, 'redaction_confirmation_required');
    if (record.deleted_at) fail(409, 'already_redacted');
    const at = now();
    const redacted = await db.prepare("UPDATE community_submissions SET contact_value=NULL,details=NULL,consented_at=NULL,contact_preference='redacted',deleted_at=?,deleted_by=? WHERE id=? AND deleted_at IS NULL").bind(at, actor.id, id).run();
    if (!changed(redacted)) fail(409, 'already_redacted');
    state = 'redacted';
    assignedTo = record.assigned_to || null;
  } else fail(405, 'method_not_allowed');
  const at = await setIntakeState(db, id, state, actor, {assignedTo, resolvedCode});
  await db.prepare('INSERT INTO management_intake_actions (id,submission_id,action,assigned_to,resolved_code,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(
    crypto.randomUUID(), id, action, assignedTo, resolvedCode, actor.id, actor.role, at,
  ).run();
  await recordAudit(db, actor, 'intake', action, 'submission', id, {state, assignee: assignedTo || undefined, resolutionCode: resolvedCode || undefined});
  return intakeView(await intakeRecord(db, id));
}

const defaultSettings = Object.freeze({
  contact: {enabled: false, type: null, value: null},
  usageLimits: {studyRequestsPerDay: 0, speechRequestsPerDay: 0, maxConcurrentJobs: 1},
  retention: {intakeDays: 90, dryRunOnly: true, automaticPurge: false},
});

/** Validate the only editable settings. Credentials, deploy/DNS controls and automatic purges are excluded. */
export function validateSafeSetting(key, value) {
  if (!['contact', 'usageLimits', 'retention'].includes(key) || !isObject(value)) fail(400, 'invalid_setting');
  if (key === 'contact') {
    onlyKeys(value, new Set(['enabled', 'type', 'value']), 'invalid_setting');
    if (typeof value.enabled !== 'boolean') fail(400, 'invalid_setting');
    if (!value.enabled) return {...defaultSettings.contact};
    const type = text(value.type, 16, true, 'invalid_setting');
    const channel = text(value.value, 320, true, 'invalid_setting');
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channel)) fail(400, 'invalid_setting');
    if (type === 'url') httpsUrl(channel, true, 'invalid_setting');
    if (!['email', 'url'].includes(type)) fail(400, 'invalid_setting');
    return {enabled: true, type, value: channel};
  }
  if (key === 'usageLimits') {
    onlyKeys(value, new Set(['studyRequestsPerDay', 'speechRequestsPerDay', 'maxConcurrentJobs']), 'invalid_setting');
    const out = {};
    for (const field of ['studyRequestsPerDay', 'speechRequestsPerDay', 'maxConcurrentJobs']) {
      if (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > (field === 'maxConcurrentJobs' ? 20 : 10_000)) fail(400, 'invalid_setting');
      out[field] = value[field];
    }
    return out;
  }
  onlyKeys(value, new Set(['intakeDays', 'dryRunOnly', 'automaticPurge']), 'invalid_setting');
  if (!Number.isInteger(value.intakeDays) || value.intakeDays < 1 || value.intakeDays > 3_650 || value.dryRunOnly !== true || value.automaticPurge !== false) fail(400, 'retention_dry_run_only');
  return {intakeDays: value.intakeDays, dryRunOnly: true, automaticPurge: false};
}

async function settings(db) {
  const listing = await db.prepare("SELECT setting_key,value_json FROM management_settings WHERE setting_key IN ('contact','usageLimits','retention')").all();
  const output = structuredClone(defaultSettings);
  for (const row of rows(listing)) {
    const parsed = safeJson(row.value_json, null);
    try { output[row.setting_key] = validateSafeSetting(row.setting_key, parsed); } catch { /* retain safe default for a malformed historic value */ }
  }
  return {
    ...output,
    integrationStatus: {contactChannel: output.contact.enabled ? 'configured' : 'disabled_until_supplied', credentials: 'not_exposed'},
  };
}

async function writeSetting(db, actor, input) {
  onlyKeys(input, new Set(['key', 'value']), 'invalid_setting');
  const key = text(input.key, 64, true, 'invalid_setting');
  const value = validateSafeSetting(key, input.value);
  const at = now();
  const updated = await db.prepare('UPDATE management_settings SET value_json=?,updated_by=?,updated_at=? WHERE setting_key=?').bind(JSON.stringify(value), actor.id, at, key).run();
  if (!changed(updated)) {
    try {
      await db.prepare('INSERT INTO management_settings (setting_key,value_json,updated_by,updated_at) VALUES (?,?,?,?)').bind(key, JSON.stringify(value), actor.id, at).run();
    } catch (error) {
      if (!/duplicate|unique/i.test(String(error?.message || error))) throw error;
      await db.prepare('UPDATE management_settings SET value_json=?,updated_by=?,updated_at=? WHERE setting_key=?').bind(JSON.stringify(value), actor.id, at, key).run();
    }
  }
  await recordAudit(db, actor, 'settings', 'save', 'setting', key, {settingKey: key});
  return settings(db);
}

async function retentionDryRun(db) {
  const current = await settings(db);
  const cutoff = new Date(Date.now() - current.retention.intakeDays * 86_400_000).toISOString();
  const count = await db.prepare('SELECT COUNT(*) AS count FROM community_submissions WHERE deleted_at IS NULL AND created_at < ?').bind(cutoff).first();
  return {
    cutoff,
    eligibleRecords: Number(count?.count || 0),
    dryRunOnly: true,
    automaticPurge: false,
    message: 'This is a count-only retention dry run. No payload, contact field, or row was deleted.',
  };
}

async function dashboard(db, env) {
  const day = new Date().toISOString().slice(0, 10);
  const [resourcePage, resourceDrafts, corrections, intake, recent, currentSettings, studyReports, audioJobs, members, usage] = await Promise.all([
    pageResources(db, env, new URL('https://review.invalid/api/resources?page=1&pageSize=1'), false),
    db.prepare("SELECT COUNT(*) AS count FROM managed_resources WHERE status='active' AND review_state='draft'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM mosque_corrections WHERE state='proposed'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM community_submissions s LEFT JOIN management_intake_state w ON w.submission_id=s.id WHERE s.deleted_at IS NULL AND COALESCE(w.state,'new') IN ('new','assigned')").first(),
    db.prepare('SELECT id,actor_id,action,target_type,target_id,summary,created_at FROM review_admin_audit ORDER BY created_at DESC, id DESC LIMIT 8').all(),
    settings(db),
    db.prepare("SELECT COUNT(*) AS count FROM study_response_reports WHERE status='open'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM study_audio_jobs WHERE status IN ('queued','processing','failed')").first(),
    db.prepare('SELECT COUNT(*) AS count FROM member_profiles').first(),
    db.prepare("SELECT COALESCE(SUM(text_requests),0) AS studyRequests,COALESCE(SUM(tts_requests),0) AS speechRequests,COALESCE(SUM(transcribe_requests),0) AS transcriptionRequests FROM study_usage_daily WHERE scope='global' AND usage_date=?").bind(day).first(),
  ]);
  return {
    counts: {
      activeReviewedResources: resourcePage.total,
      resourceReviewQueue: Number(resourceDrafts?.count || 0),
      mosqueReviewQueue: Number(corrections?.count || 0),
      intakeQueue: Number(intake?.count || 0),
      studyReportQueue: Number(studyReports?.count || 0),
      audioJobsAwaitingAttention: Number(audioJobs?.count || 0),
      registeredMembers: Number(members?.count || 0),
    },
    integrations: {...currentSettings.integrationStatus,
      studyProvider: env.STUDY_LIVE_CANARY === 'true' && Boolean(env.GEMINI_API_KEY) ? 'private_canary_enabled' : 'disabled',
      googleAccountPrivacyTier: 'not_verified',
    },
    studyUsage: {day, studyRequests: Number(usage?.studyRequests || 0), speechRequests: Number(usage?.speechRequests || 0), transcriptionRequests: Number(usage?.transcriptionRequests || 0)},
    retention: {dryRunOnly: true, automaticPurge: false},
    recentActivity: rows(recent).map(item => ({
      id: item.id, actorId: item.actor_id, action: item.action, targetType: item.target_type,
      targetId: item.target_id, summary: safeJson(item.summary, {}), createdAt: item.created_at,
    })),
    recentActivityLimit: 8,
  };
}

async function auditPage(db, url) {
  const {page, pageSize, offset} = pageParameters(url);
  const action = text(url.searchParams.get('action') || '', 32, false, 'invalid_filter');
  const clauses = action ? ['action=?'] : [];
  const values = action ? [action] : [];
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM review_admin_audit ${where}`).bind(...values).first();
  const listing = await db.prepare(`SELECT id,actor_id,action,target_type,target_id,summary,created_at FROM review_admin_audit ${where} ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  const total = Number(count?.count || 0);
  return {
    items: rows(listing).map(item => ({
      id: item.id, actorId: item.actor_id, action: item.action, targetType: item.target_type,
      targetId: item.target_id, summary: safeJson(item.summary, {}), createdAt: item.created_at,
    })),
    page, pageSize, total, hasMore: offset + pageSize < total,
  };
}

async function studyReportsPage(db, url) {
  const {page, pageSize, offset} = pageParameters(url);
  const status = url.searchParams.get('status') || '';
  if (status && !['open','resolved'].includes(status)) fail(400, 'invalid_filter');
  const where = status ? 'WHERE status=?' : '';
  const values = status ? [status] : [];
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM study_response_reports ${where}`).bind(...values).first();
  const listing = await db.prepare(`SELECT id,response_id,reason,details,status,created_at FROM study_response_reports ${where} ORDER BY created_at DESC,id DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  const total = Number(count?.count || 0);
  return {items: rows(listing).map(row => ({id:row.id,responseId:row.response_id,reason:row.reason,details:row.details,status:row.status,createdAt:row.created_at})),page,pageSize,total,hasMore:offset+pageSize<total};
}

async function changeStudyReport(db, actor, id, input) {
  onlyKeys(input, new Set(['action']), 'invalid_report_action');
  if (!/^[a-f0-9-]{36}$/i.test(id) || !['resolve','reopen'].includes(input.action)) fail(400, 'invalid_report_action');
  const old = input.action === 'resolve' ? 'open' : 'resolved';
  const next = input.action === 'resolve' ? 'resolved' : 'open';
  const result = await db.prepare('UPDATE study_response_reports SET status=? WHERE id=? AND status=?').bind(next,id,old).run();
  if (changed(result) !== 1) fail(409, 'revision_conflict');
  await recordAudit(db,actor,'study','triage','study_report',id,{state:next});
  return {id,status:next};
}

async function studyOperations(db, env) {
  const day = new Date().toISOString().slice(0,10);
  const [usage,jobs,reports] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(text_requests),0) AS studyRequests,COALESCE(SUM(text_input_chars),0) AS studyInputChars,COALESCE(SUM(tts_requests),0) AS speechRequests,COALESCE(SUM(tts_characters),0) AS speechCharacters,COALESCE(SUM(transcribe_requests),0) AS transcriptionRequests FROM study_usage_daily WHERE scope='global' AND usage_date=?").bind(day).first(),
    db.prepare('SELECT status,COUNT(*) AS count FROM study_audio_jobs GROUP BY status').all(),
    db.prepare("SELECT COUNT(*) AS count FROM study_response_reports WHERE status='open'").first(),
  ]);
  return {day,usage:{studyRequests:Number(usage?.studyRequests||0),studyInputChars:Number(usage?.studyInputChars||0),speechRequests:Number(usage?.speechRequests||0),speechCharacters:Number(usage?.speechCharacters||0),transcriptionRequests:Number(usage?.transcriptionRequests||0)},audioJobs:Object.fromEntries(rows(jobs).map(row=>[row.status,Number(row.count||0)])),openReports:Number(reports?.count||0),modelIds:{text:env.GEMINI_TEXT_MODEL||'gemini-3.1-flash-lite',speech:env.GEMINI_TTS_MODEL||'gemini-3.8-flash-lite-tts',voice:env.STUDY_TTS_VOICE||'Kore'},providerEnabled:env.STUDY_LIVE_CANARY==='true'&&Boolean(env.GEMINI_API_KEY),currencyCap:'request_and_character_caps_only'};
}

/**
 * The member module can call this before saving external resources. It recognizes both the
 * immutable 12-link seed and managed records, and blocks an archived/unreviewed seed override.
 */
export async function resourceSaveEligibility(db, id, env = {}) {
  try {
    const resourceId = safeId(id, 'invalid_save');
    const direct = await db.prepare('SELECT * FROM managed_resources WHERE id=?').bind(resourceId).first();
    if (direct) {
      const eligible = publicEligible(rowResource(direct));
      return {eligible, reason: eligible ? 'active_reviewed_resource' : 'resource_not_active_reviewed'};
    }
    const seeds = (await catalogue(env)).map(staticResource).filter(Boolean);
    if (!seeds.some(item => item.id === resourceId)) return {eligible: false, reason: 'unknown_resource'};
    const override = await db.prepare('SELECT * FROM managed_resources WHERE seed_key=?').bind(resourceId).first();
    if (!override) return {eligible: true, reason: 'verified_primary_publisher_seed'};
    const eligible = publicEligible(rowResource(override, 'seed_override'));
    return {eligible, reason: eligible ? 'active_reviewed_seed_override' : 'seed_override_not_active_reviewed'};
  } catch (error) {
    if (error instanceof Problem) return {eligible: false, reason: error.message};
    throw error;
  }
}

function documentResponse(document) {
  return {resource: document.resource, version: document.version};
}

function correctionResponse(document) {
  return {correction: document.correction, version: document.version};
}

/**
 * Management API entry point. Parent server integration should dispatch relevant routes here as:
 *   manageResponse(request, {DB: database()}, actor)
 * `actor` must be the server-resolved identity, never a request header/body value.
 */
export async function manageResponse(request, env, actor = null) {
  try {
    if (!env?.DB) fail(503, 'storage_unavailable');
    const db = env.DB;
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'method_not_allowed');

    // Visitor metadata intentionally omits drafts, archives, unchecked links and audit fields.
    if (pathname === '/api/resources') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      return response(await pageResources(db, env, url, false));
    }
    if (pathname === '/api/mosque-overlays') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      return response({items: await publicOverlays(db)});
    }
    if (pathname === '/api/mosques') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      return response(await publicMosques(db, env));
    }

    if (pathname === '/api/admin/dashboard') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      requireRole(actor, STAFF_ROLES);
      return response(await dashboard(db, env));
    }
    if (pathname === '/api/admin/audit') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      owner(actor);
      return response(await auditPage(db, url));
    }
    if (pathname === '/api/admin/study-usage') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      owner(actor);
      return response(await studyOperations(db,env));
    }
    if (pathname === '/api/admin/study-reports') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      owner(actor);
      return response(await studyReportsPage(db,url));
    }
    const studyReport = pathname.match(/^\/api\/admin\/study-reports\/([A-Za-z0-9-]{1,64})$/);
    if (studyReport) {
      if (request.method !== 'POST') fail(405, 'method_not_allowed');
      const trusted = owner(actor);
      sameOrigin(request);
      return response(await changeStudyReport(db,trusted,studyReport[1],await jsonBody(request)));
    }

    if (pathname === '/api/admin/resources') {
      if (request.method === 'GET') {
        requireRole(actor, STAFF_ROLES);
        return response(await pageResources(db, env, url, true));
      }
      const trusted = requireRole(actor, CURATION_ROLES);
      sameOrigin(request);
      return response(documentResponse(await createResource(db, env, trusted, await jsonBody(request))), 201);
    }
    const resourceMatch = pathname.match(/^\/api\/admin\/resources\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})(?:\/(history))?$/);
    if (resourceMatch) {
      const [, id, suffix] = resourceMatch;
      if (request.method === 'GET') {
        requireRole(actor, STAFF_ROLES);
        if (suffix === 'history') return response(await resourceHistory(db, id, url));
        return response(documentResponse(await resourceDocument(db, id)));
      }
      if (suffix) fail(405, 'method_not_allowed');
      const trusted = requireRole(actor, CURATION_ROLES);
      sameOrigin(request);
      const input = await jsonBody(request);
      const action = input.action;
      if (!['save', 'archive', 'restore'].includes(action)) fail(400, 'invalid_resource_action');
      const payload = {...input}; delete payload.action;
      if (action === 'save') return response(documentResponse(await updateResource(db, trusted, id, payload)));
      return response(documentResponse(await archiveResource(db, trusted, id, payload, action === 'restore')));
    }

    if (pathname === '/api/admin/mosque-corrections') {
      if (request.method === 'GET') {
        requireRole(actor, STAFF_ROLES);
        return response(await pageCorrections(db, url));
      }
      const trusted = requireRole(actor, CORRECTION_PROPOSE_ROLES);
      sameOrigin(request);
      return response(correctionResponse(await createCorrection(db, env, trusted, await jsonBody(request))), 201);
    }
    const correctionMatch = pathname.match(/^\/api\/admin\/mosque-corrections\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})(?:\/(revise|review|apply|history))?$/);
    if (correctionMatch) {
      const [, id, suffix] = correctionMatch;
      if (request.method === 'GET') {
        requireRole(actor, STAFF_ROLES);
        if (suffix === 'history') {
          const {page, pageSize, offset} = pageParameters(url);
          const count = await db.prepare('SELECT COUNT(*) AS count FROM mosque_correction_revisions WHERE correction_id=?').bind(id).first();
          const list = await db.prepare(`SELECT version,state,snapshot_json,actor_id,actor_role,action,created_at FROM mosque_correction_revisions WHERE correction_id=? ORDER BY version DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(id).all();
          const total = Number(count?.count || 0);
          return response({items: rows(list).map(item => ({version: Number(item.version), state: item.state, snapshot: safeJson(item.snapshot_json, {}), actor: {id: item.actor_id, role: item.actor_role}, action: item.action, createdAt: item.created_at})), page, pageSize, total, hasMore: offset + pageSize < total});
        }
        return response(correctionResponse(await correctionDocument(db, id)));
      }
      sameOrigin(request);
      const input = await jsonBody(request);
      if (suffix === 'revise') return response(correctionResponse(await reviseCorrection(db, env, requireRole(actor, CORRECTION_PROPOSE_ROLES), id, input)));
      if (suffix === 'review') return response(correctionResponse(await reviewCorrection(db, requireRole(actor, CORRECTION_REVIEW_ROLES), id, input)));
      if (suffix === 'apply') return response(correctionResponse(await applyCorrection(db, owner(actor), id, input)));
      fail(405, 'method_not_allowed');
    }

    if (pathname === '/api/admin/intake') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      owner(actor);
      return response(await pageIntake(db, url));
    }
    const intakeMatch = pathname.match(/^\/api\/admin\/intake\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})\/(assign|resolve|redact)$/);
    if (intakeMatch) {
      if (request.method !== 'POST') fail(405, 'method_not_allowed');
      const trusted = owner(actor);
      sameOrigin(request);
      return response(await intakeAction(db, trusted, intakeMatch[1], intakeMatch[2], await jsonBody(request)));
    }

    if (pathname === '/api/admin/settings') {
      if (request.method === 'GET') { owner(actor); return response(await settings(db)); }
      const trusted = owner(actor);
      sameOrigin(request);
      return response(await writeSetting(db, trusted, await jsonBody(request)));
    }
    if (pathname === '/api/admin/settings/retention/dry-run') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      owner(actor);
      return response(await retentionDryRun(db));
    }

    fail(404, 'not_found');
  } catch (error) {
    if (error instanceof Problem) return response({error: error.message}, error.status);
    // Never send SQL errors, supplied content, account IDs, contact information, or secrets.
    return response({error: 'storage_unavailable'}, 503);
  }
}
