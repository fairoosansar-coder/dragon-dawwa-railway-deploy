// Community routes receive an already verified actor from the parent server. Never derive roles from request data.
const EVENT_LANGUAGES = new Set(['en', 'ta', 'si']);
const EVENT_READ_ROLES = new Set(['owner', 'publisher', 'reviewer']);
const EVENT_WRITE_ROLES = new Set(['owner', 'publisher']);
const PARTICIPATION_PURPOSES = new Set(['interest', 'volunteer', 'inquiry']);
const CORRECTION_PURPOSES = new Set(['correction', 'directory_correction', 'event_correction', 'other_correction']);
const MAX_JSON_BYTES = 32_768;
const IANA_ZONES = typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('timeZone')) : null;

class Problem extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

const fail = (status, code) => { throw new Problem(status, code); };

function response(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

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

async function jsonBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_json');
  const chunks = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_JSON_BYTES) {
      await reader.cancel();
      fail(413, 'too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail(400, 'invalid_json'); }
  if (!isObject(value)) fail(400, 'invalid_json');
  return value;
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'same_origin_required');
}

function requireRole(actor, roles) {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) fail(401, 'sign_in_required');
  if (!roles.has(actor.role)) fail(403, 'forbidden');
}

function httpsUrl(value, required, code) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, code);
    return null;
  }
  const clean = text(value, 2_000, true, code);
  let parsed;
  try { parsed = new URL(clean); }
  catch { fail(400, code); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) fail(400, code);
  return clean;
}

function validTimezone(value) {
  const zone = text(value, 100, true, 'invalid_event');
  // Restrict to canonical Area/Location-style IANA names rather than browser-specific aliases.
  if (!zone.includes('/') || (IANA_ZONES && !IANA_ZONES.has(zone))) fail(400, 'invalid_event');
  try { new Intl.DateTimeFormat('en', {timeZone: zone}); }
  catch { fail(400, 'invalid_event'); }
  return zone;
}

function isoDate(value) {
  const source = text(value, 64, true, 'invalid_event');
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) fail(400, 'invalid_event');
  const [, year, month, day, hour, minute, second = '0', , offset] = match;
  const y = Number(year), m = Number(month), d = Number(day), h = Number(hour), min = Number(minute), sec = Number(second);
  const days = m >= 1 && m <= 12 ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 0;
  const offsetMatch = offset === 'Z' ? null : offset.match(/^[+-](\d{2}):(\d{2})$/);
  if (m < 1 || m > 12 || d < 1 || d > days || h > 23 || min > 59 || sec > 59 ||
      (offsetMatch && (Number(offsetMatch[1]) > 23 || Number(offsetMatch[2]) > 59)) || !Number.isFinite(Date.parse(source))) fail(400, 'invalid_event');
  return source;
}

function firstDefined(input, keys) {
  const supplied = keys.filter(key => input[key] !== undefined && input[key] !== null);
  if (!supplied.length) return undefined;
  const first = input[supplied[0]];
  if (supplied.some(key => input[key] !== first)) fail(400, 'invalid_event');
  return first;
}

export function validateEvent(value, publishing = false) {
  if (!isObject(value)) fail(400, 'invalid_event');
  const location = optionalText(value.location, 500, 'invalid_event');
  const onlineUrl = httpsUrl(value.onlineUrl, false, 'invalid_event');
  if (!location && !onlineUrl) fail(400, 'invalid_event');
  const startsAt = isoDate(firstDefined(value, ['startsAt', 'startAt', 'date']));
  if (publishing && Date.parse(startsAt) <= Date.now()) fail(400, 'event_in_past');
  return {
    title: text(value.title, 180, true, 'invalid_event'),
    description: text(value.description, 8_000, true, 'invalid_event'),
    language: EVENT_LANGUAGES.has(value.language) ? value.language : (() => fail(400, 'invalid_event'))(),
    timezone: validTimezone(value.timezone),
    startsAt,
    location,
    onlineUrl,
    // A supplied string is retained as supplied; this service does not infer or verify speakers.
    speaker: optionalText(value.speaker, 180, 'invalid_event'),
    resourceUrl: httpsUrl(value.resourceUrl, false, 'invalid_event'),
  };
}

function revision(row) {
  return {
    version: Number(row.version),
    state: row.state,
    content: JSON.parse(row.content),
    action: row.action,
    actor: {id: row.actor_id, role: row.actor_role},
    createdAt: row.created_at,
  };
}

async function getEvent(db, id) {
  const event = await db.prepare('SELECT * FROM community_events WHERE id = ?').bind(id).first();
  if (!event) fail(404, 'not_found');
  const head = await db.prepare('SELECT * FROM community_event_revisions WHERE event_id = ? AND version = ?').bind(id, event.head).first();
  if (!head) fail(503, 'storage_unavailable');
  return {event, current: revision(head)};
}

function adminEvent(document) {
  const {event, current} = document;
  return {
    id: event.id,
    createdBy: event.created_by,
    createdAt: event.created_at,
    head: Number(event.head),
    published: event.published === null ? null : Number(event.published),
    cancelledAt: event.cancelled_at || null,
    cancelledBy: event.cancelled_by || null,
    current,
  };
}

function revisionInsert(db, id, version, state, content, actor, action, time) {
  return db.prepare(
    'INSERT INTO community_event_revisions (event_id,version,state,content,actor_id,actor_role,action,created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(id, version, state, JSON.stringify(content), actor.id, actor.role, action, time);
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

async function publicEvents(db) {
  const result = await db.prepare(
    'SELECT e.id,r.version,r.content,r.created_at AS published_at FROM community_events e JOIN community_event_revisions r ON r.event_id=e.id AND r.version=e.published WHERE e.published IS NOT NULL AND e.cancelled_at IS NULL ORDER BY r.created_at DESC LIMIT 100',
  ).all();
  return rows(result).map(row => ({
    id: row.id,
    version: Number(row.version),
    ...JSON.parse(row.content),
    publishedAt: row.published_at,
  }));
}

async function adminEvents(db) {
  const result = await db.prepare(
    'SELECT e.* FROM community_events e ORDER BY e.created_at DESC LIMIT 200',
  ).all();
  const documents = await Promise.all(rows(result).map(row => getEvent(db, row.id)));
  return documents.map(adminEvent);
}

function eventPayload(input) {
  if (input.event !== undefined) return input.event;
  if (input.content !== undefined) return input.content;
  return input;
}

function requiredBase(input, document) {
  if (!Number.isInteger(input.baseVersion) || input.baseVersion !== Number(document.event.head)) fail(409, 'revision_conflict');
}

async function eventWrite(db, id, action, input, actor) {
  const document = await getEvent(db, id);
  requiredBase(input, document);
  const root = document.event;
  if (root.cancelled_at) fail(409, 'cancelled_event');

  let state;
  let content = document.current.content;
  let published = root.published;
  let cancelledAt = null;
  let cancelledBy = null;
  if (action === 'save') {
    content = validateEvent(eventPayload(input));
    state = 'draft';
  } else if (action === 'publish') {
    if (document.current.state !== 'draft') fail(409, 'invalid_transition');
    const past = Date.parse(content.startsAt) <= Date.now();
    if (past) {
      // A past draft is never evidence that a gathering took place. Only append a
      // rights-confirmed resource to an event published before its start time.
      if (!root.published || !content.resourceUrl) fail(400, 'event_in_past');
      if (input.authorizedRecording !== true) fail(400, 'recording_rights_required');
      const prior = await db.prepare('SELECT content FROM community_event_revisions WHERE event_id = ? AND version = ?')
        .bind(id, root.published).first();
      if (!prior) fail(503, 'storage_unavailable');
      const publishedContent = JSON.parse(prior.content);
      if (content.resourceUrl === publishedContent.resourceUrl ||
          Object.keys(publishedContent).some(key => key !== 'resourceUrl' && content[key] !== publishedContent[key]))
        fail(409, 'archive_only');
    }
    content = validateEvent(content, !past);
    state = 'published';
    published = Number(root.head) + 1;
  } else if (action === 'cancel') {
    state = 'cancelled';
    published = null;
    cancelledAt = new Date().toISOString();
    cancelledBy = actor.id;
  } else {
    fail(405, 'method_not_allowed');
  }

  const version = Number(root.head) + 1;
  const time = new Date().toISOString();
  let result;
  try {
    result = await db.batch([
      db.prepare('UPDATE community_events SET head=?,published=?,cancelled_at=?,cancelled_by=? WHERE id=? AND head=?').bind(version, published, cancelledAt, cancelledBy, id, root.head),
      revisionInsert(db, id, version, state, content, actor, action, time),
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) fail(409, 'revision_conflict');
    throw error;
  }
  if (changes(result?.[0]) !== 1) fail(409, 'revision_conflict');
  return adminEvent(await getEvent(db, id));
}

function contact(value, preference) {
  if (preference === 'none') {
    if (value !== undefined && value !== null && text(value, 320, false, 'invalid_submission')) fail(400, 'invalid_submission');
    return null;
  }
  const clean = text(value, 320, true, 'invalid_submission');
  if (/[\r\n]/.test(clean)) fail(400, 'invalid_submission');
  if (preference === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) fail(400, 'invalid_submission');
  if (preference === 'phone' && !/^\+?[0-9][0-9 ()-]{5,30}$/.test(clean)) fail(400, 'invalid_submission');
  return clean;
}

function submission(value, kind) {
  if (!isObject(value)) fail(400, 'invalid_submission');
  const trap = value.website ?? value.honeypot ?? value.company;
  if (trap !== undefined && (typeof trap !== 'string' || trap.length > 200 || trap.trim())) fail(400, 'invalid_submission');
  const purpose = text(value.purpose, 64, true, 'invalid_submission');
  const allowed = kind === 'participation' ? PARTICIPATION_PURPOSES : CORRECTION_PURPOSES;
  if (!allowed.has(purpose)) fail(400, 'invalid_submission');
  const preference = text(value.contactPreference, 16, true, 'invalid_submission');
  if (!['none', 'email', 'phone'].includes(preference)) fail(400, 'invalid_submission');
  const detailValue = value.details ?? value.message ?? value.correction;
  const details = optionalText(detailValue, 3_000, 'invalid_submission');
  if (kind === 'correction' && !details) fail(400, 'invalid_submission');
  const contactValue = contact(value.contact ?? value.contactValue, preference);
  const consent = value.contactConsent === true || value.consent === true;
  if (preference === 'none') {
    if (consent) fail(400, 'invalid_submission');
  } else if (!consent) {
    fail(400, 'contact_consent_required');
  }
  return {
    kind,
    purpose,
    details,
    contactPreference: preference,
    contactValue,
    consentedAt: preference === 'none' ? null : new Date().toISOString(),
  };
}

function submissionView(row) {
  const tombstone = !!row.deleted_at;
  const common = {
    id: row.id,
    kind: row.kind,
    purpose: row.purpose,
    createdAt: row.created_at,
    deleted: tombstone,
  };
  if (tombstone) return {...common, deletedAt: row.deleted_at, deletedBy: row.deleted_by || null};
  return {
    ...common,
    contactPreference: row.contact_preference,
    contact: row.contact_value,
    details: row.details,
    consentedAt: row.consented_at,
  };
}

async function receiveSubmission(db, kind, input) {
  const data = submission(input, kind);
  const id = crypto.randomUUID();
  const time = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO community_submissions (id,kind,purpose,contact_preference,contact_value,details,consented_at,created_at,deleted_at,deleted_by) VALUES (?,?,?,?,?,?,?,?,NULL,NULL)').bind(
      id, data.kind, data.purpose, data.contactPreference, data.contactValue, data.details, data.consentedAt, time,
    ),
    db.prepare('INSERT INTO community_submission_audits (id,submission_id,action,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?)').bind(
      crypto.randomUUID(), id, 'received', null, 'visitor', time,
    ),
  ]);
  // This deliberately reports storage only; this module sends no messages or enrolments.
  return response({status: 'stored_for_review'}, 201);
}

async function deleteSubmission(db, id, actor) {
  const row = await db.prepare('SELECT id,deleted_at FROM community_submissions WHERE id = ?').bind(id).first();
  if (!row) fail(404, 'not_found');
  if (row.deleted_at) fail(409, 'already_deleted');
  const time = new Date().toISOString();
  let result;
  try {
    result = await db.batch([
      db.prepare("UPDATE community_submissions SET contact_value=NULL,details=NULL,consented_at=NULL,contact_preference='deleted',deleted_at=?,deleted_by=? WHERE id=? AND deleted_at IS NULL").bind(time, actor.id, id),
      // The unique audit key makes a concurrent second deletion roll back rather than add a misleading audit row.
      db.prepare('INSERT INTO community_submission_audits (id,submission_id,action,actor_id,actor_role,created_at) VALUES (?,?,?,?,?,?)').bind(
        crypto.randomUUID(), id, 'deleted', actor.id, actor.role, time,
      ),
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) fail(409, 'already_deleted');
    throw error;
  }
  if (changes(result?.[0]) !== 1) fail(409, 'already_deleted');
  return response({status: 'deleted'});
}

/**
 * Community API router. `actor` must come only from trusted parent-server session verification.
 * It intentionally has no identity-header parsing, logging, delivery integration, or in-memory fallback.
 */
export async function communityResponse(request, env, actor = null) {
  try {
    const path = new URL(request.url).pathname;
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'method_not_allowed');
    if (!env?.DB) fail(503, 'storage_unavailable');
    const db = env.DB;

    if (path === '/api/events') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      return response({items: await publicEvents(db)});
    }

    if (path === '/api/admin/events' && request.method === 'GET') {
      requireRole(actor, EVENT_READ_ROLES);
      return response({items: await adminEvents(db)});
    }

    if (path === '/api/admin/events' && request.method === 'POST') {
      requireRole(actor, EVENT_WRITE_ROLES);
      sameOrigin(request);
      const input = await jsonBody(request);
      const action = input.action ?? 'create';
      if (action !== 'create') fail(405, 'method_not_allowed');
      const content = validateEvent(eventPayload(input));
      const id = crypto.randomUUID();
      const time = new Date().toISOString();
      await db.batch([
        db.prepare('INSERT INTO community_events (id,created_by,created_at,head,published,cancelled_at,cancelled_by) VALUES (?,?,?,?,NULL,NULL,NULL)').bind(id, actor.id, time, 1),
        revisionInsert(db, id, 1, 'draft', content, actor, 'create', time),
      ]);
      return response(adminEvent(await getEvent(db, id)), 201);
    }

    const eventMatch = path.match(/^\/api\/admin\/events\/([a-zA-Z0-9-]{1,64})(?:\/(history|save|publish|cancel))?$/);
    if (eventMatch) {
      const [, id, suffix] = eventMatch;
      if (request.method === 'GET') {
        requireRole(actor, EVENT_READ_ROLES);
        const document = await getEvent(db, id);
        if (!suffix) return response(adminEvent(document));
        if (suffix !== 'history') fail(405, 'method_not_allowed');
        const before = new URL(request.url).searchParams.has('before') ? Number(new URL(request.url).searchParams.get('before')) : Number(document.event.head) + 1;
        if (!Number.isInteger(before) || before < 1) fail(400, 'invalid_revision');
        const result = await db.prepare('SELECT * FROM community_event_revisions WHERE event_id=? AND version < ? ORDER BY version DESC LIMIT 101').bind(id, before).all();
        const history = rows(result).slice(0, 100).map(revision);
        return response({items: history, nextBefore: rows(result).length > 100 ? history.at(-1).version : null});
      }
      requireRole(actor, EVENT_WRITE_ROLES);
      sameOrigin(request);
      const input = await jsonBody(request);
      const action = suffix || input.action;
      if (!['save', 'publish', 'cancel'].includes(action)) fail(405, 'method_not_allowed');
      return response(await eventWrite(db, id, action, input, actor));
    }

    if (path === '/api/admin/submissions' && request.method === 'GET') {
      requireRole(actor, new Set(['owner']));
      const result = await db.prepare('SELECT id,kind,purpose,contact_preference,contact_value,details,consented_at,created_at,deleted_at,deleted_by FROM community_submissions ORDER BY created_at DESC LIMIT 200').all();
      return response({items: rows(result).map(submissionView)});
    }

    const deleteMatch = path.match(/^\/api\/admin\/submissions\/([a-zA-Z0-9-]{1,64})\/delete$/);
    if (deleteMatch) {
      if (request.method !== 'POST') fail(405, 'method_not_allowed');
      requireRole(actor, new Set(['owner']));
      sameOrigin(request);
      return await deleteSubmission(db, deleteMatch[1], actor);
    }

    if (path === '/api/participation' || path === '/api/corrections') {
      if (request.method !== 'POST') fail(405, 'method_not_allowed');
      sameOrigin(request);
      return await receiveSubmission(db, path.endsWith('participation') ? 'participation' : 'correction', await jsonBody(request));
    }

    fail(404, 'not_found');
  } catch (error) {
    if (error instanceof Problem) return response({error: error.message}, error.status);
    // Do not log request payloads, contact data, identities, or database errors from these routes.
    return response({error: 'storage_unavailable'}, 503);
  }
}
