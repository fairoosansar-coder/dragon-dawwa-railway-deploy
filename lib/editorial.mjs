// Sites dispatch supplies trusted user identity; browser bodies never assign roles.
const LANGUAGES = ['en', 'ta', 'si'];
const ROLES = ['author', 'reviewer', 'publisher'];
// Source taxonomy describes provenance, not authenticity or scholarly agreement.
// Keep source_text for version-8 drafts that did not distinguish Quran from hadith.
const SOURCE_KINDS = ['quran', 'hadith', 'source_text', 'translation', 'interpretation', 'editorial'];
const CLASSIFICATIONS = SOURCE_KINDS;
const LIMIT = 100_000;
class Problem extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
const fail = (status, code) => { throw new Problem(status, code); };
const response = (data, status = 200) => Response.json(data, {status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie',
}});
function string(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'invalid_content');
  return value.trim();
}
function optionalString(value, max, code = 'invalid_content') {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) fail(400, code);
  return value.trim();
}
function sourceKind(value) {
  // `source` was the version-8 API spelling. Keep old saved drafts readable while
  // storing the clearer classification introduced here.
  if (value === 'source') return 'source_text';
  if (!SOURCE_KINDS.includes(value)) fail(400, 'invalid_source_kind');
  return value;
}
function metadata(value) {
  if (value === undefined || value === null) return {topics: [], classification: '', clarity: ''};
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_metadata');
  const rawTopics = value.topics === undefined ? [] : value.topics;
  if (!Array.isArray(rawTopics) || rawTopics.length > 12) fail(400, 'invalid_topics');
  const topics = [];
  const seen = new Set();
  for (const topic of rawTopics) {
    const clean = optionalString(topic, 80, 'invalid_topics');
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); topics.push(clean); }
  }
  const classification = optionalString(value.classification, 32, 'invalid_classification');
  if (classification && !CLASSIFICATIONS.includes(classification)) fail(400, 'invalid_classification');
  return {topics, classification, clarity: optionalString(value.clarity, 1200, 'invalid_metadata')};
}
export function validateContent(value, ready = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_content');
  const translations = {};
  for (const lang of LANGUAGES) {
    const entry = value.translations?.[lang];
    if (!entry) continue;
    const row = {};
    for (const [key, max] of [['title',180],['summary',800],['body',15000],['contributor',180]]) {
      row[key] = string(entry[key] ?? '', max);
    }
    if (!Object.values(row).some(Boolean)) continue;
    if (ready && Object.values(row).some(v => !v)) fail(400, 'complete_each_language');
    translations[lang] = row;
  }
  if (!Object.keys(translations).length) fail(400, 'language_required');
  if (!Array.isArray(value.sources) || value.sources.length > 30) fail(400, 'invalid_sources');
  const sources = value.sources.map(item => {
    const url = string(item?.url, 2000, true);
    if (!URL.canParse(url)) fail(400, 'invalid_source_url');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(400, 'invalid_source_url');
    return {url, kind:sourceKind(item.kind), label:string(item.label,250,true), author:string(item.author ?? '',250), locator:string(item.locator ?? '',400)};
  });
  if (ready && !sources.length) fail(400, 'source_required');
  // Return a clean, public-content shape. In particular, callers cannot submit
  // forged review evidence in `content`; only the approval transition adds it.
  return {translations, sources, metadata:metadata(value.metadata)};
}
export function identity(request, env) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email) fail(401, 'sign_in_required');
  let grants = {};
  try { grants = JSON.parse(env.EDITORIAL_ROLES || '{}'); } catch { fail(503, 'permissions_unavailable'); }
  const role = id === env.EDITORIAL_OWNER_ID ? 'owner' : (Object.hasOwn(grants, id) && ROLES.includes(grants[id]) ? grants[id] : 'reader');
  return {id, role};
}
function permitted(actor, roles) { if (actor.role !== 'owner' && !roles.includes(actor.role)) fail(403, 'forbidden'); }
function author(actor, document) {
  permitted(actor,['author']);
  if (actor.role !== 'owner' && actor.id !== document.created_by) fail(403,'forbidden');
}
async function json(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_json');
  const chunks = []; let length = 0;
  for (;;) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > LIMIT) { await reader.cancel(); fail(413,'too_large'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const part of chunks) { bytes.set(part,offset); offset += part.length; }
  try { const data = JSON.parse(new TextDecoder().decode(bytes)); if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400,'invalid_json'); return data; }
  catch { fail(400,'invalid_json'); }
}
function writeGuard(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403,'same_origin_required');
}
function parseContent(serialized) {
  const parsed = JSON.parse(serialized);
  // Pre-metadata rows remain readable. Do not rewrite their immutable stored value.
  if (!parsed.metadata) parsed.metadata = {topics: [], classification: '', clarity: ''};
  if (!Array.isArray(parsed.metadata.topics)) parsed.metadata.topics = [];
  if (typeof parsed.metadata.classification !== 'string') parsed.metadata.classification = '';
  if (typeof parsed.metadata.clarity !== 'string') parsed.metadata.clarity = '';
  if (Array.isArray(parsed.sources)) parsed.sources = parsed.sources.map(source => ({...source, kind:source.kind === 'source' ? 'source_text' : source.kind}));
  return parsed;
}
const revision = row => ({...row,content:parseContent(row.content)});
async function getDocument(db,id) {
  const doc = await db.prepare('SELECT * FROM editorial_documents WHERE id = ?').bind(id).first();
  if (!doc) fail(404,'not_found');
  const head = await db.prepare('SELECT * FROM editorial_revisions WHERE document_id = ? AND version = ?').bind(id,doc.head).first();
  if (!head) fail(503,'storage_unavailable');
  return {...doc,current:revision(head)};
}
function canRead(actor,doc) { permitted(actor,ROLES); if (actor.role === 'author' && doc.created_by !== actor.id) fail(403,'forbidden'); }
const insertRevision = (db,id,version,state,content,actor,action,note,time) => db.prepare(
  'INSERT INTO editorial_revisions (document_id,version,state,content,actor,role,action,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
).bind(id,version,state,JSON.stringify(content),actor.id,actor.role,action,note,time);
function reviewAcknowledgements(input, content, submissionVersion, actor, time) {
  const included = Object.keys(content.translations);
  const suppliedVersion = input.reviewedRevision ?? input.reviewedVersion;
  if (suppliedVersion !== undefined && (!Number.isInteger(suppliedVersion) || suppliedVersion !== submissionVersion)) fail(409, 'review_revision_mismatch');
  let supplied = input.reviewedLanguages ?? input.languageReviews;
  // A version-8 single confirmation remains a compatibility path. It is expanded
  // into one persisted acknowledgement per included language, not treated as an
  // unscoped approval in the stored record.
  if (supplied === undefined && input.reviewed === true) supplied = Object.fromEntries(included.map(lang => [lang, true]));
  const acknowledged = new Set();
  if (Array.isArray(supplied)) {
    for (const entry of supplied) {
      if (typeof entry === 'string') acknowledged.add(entry);
      else if (entry && typeof entry === 'object' && entry.acknowledged === true && typeof entry.language === 'string') acknowledged.add(entry.language);
      else fail(400, 'review_languages_required');
    }
  } else if (supplied && typeof supplied === 'object') {
    for (const [language, checked] of Object.entries(supplied)) if (checked === true) acknowledged.add(language);
  } else fail(400, 'review_languages_required');
  for (const lang of acknowledged) if (!LANGUAGES.includes(lang)) fail(400, 'review_languages_required');
  if (!included.every(lang => acknowledged.has(lang)) || acknowledged.size !== included.length) fail(400, 'review_languages_required');
  return {
    submissionVersion,
    approvedRevision: submissionVersion + 1,
    reviewedAt: time,
    reviewedBy: actor.id,
    languages: Object.fromEntries(included.map(language => [language, {acknowledged: true, reviewedAt: time, reviewedBy: actor.id}])),
  };
}
function approvedForCurrentRevision(content, version) {
  const review = content?.review;
  return !!review && review.approvedRevision === version && review.submissionVersion === version - 1 &&
    review.languages && Object.keys(content.translations || {}).every(lang => review.languages[lang]?.acknowledged === true);
}
function publicContent(content) {
  const clean = validateContent(content);
  if (!content.review || typeof content.review !== 'object') return clean;
  const languages = Object.keys(clean.translations).filter(lang => content.review.languages?.[lang]?.acknowledged === true);
  if (!languages.length) return clean;
  // Publish the fact, revision and languages of authenticated review, not an
  // internal account identifier; only staff audit endpoints retain actor IDs.
  clean.review = {
    reviewedRevision: content.review.submissionVersion,
    approvedRevision: content.review.approvedRevision,
    reviewedAt: content.review.reviewedAt,
    languages,
  };
  return clean;
}
function publicItem(row, state) {
  return {id: row.id || row.document_id, version: row.version, created_at: row.created_at, ...(state ? {state} : {}), content: publicContent(parseContent(row.content))};
}
function publicMatches(item, url) {
  const language = url.searchParams.get('language');
  const topic = url.searchParams.get('topic');
  const classification = url.searchParams.get('classification');
  const query = url.searchParams.get('q');
  if (language && !LANGUAGES.includes(language)) fail(400, 'invalid_language');
  if (classification && !CLASSIFICATIONS.includes(classification)) fail(400, 'invalid_classification');
  if (query !== null && query.length > 120) fail(400, 'invalid_search');
  if (language && !item.content.translations[language]) return false;
  if (topic && !item.content.metadata.topics.some(value => value.toLocaleLowerCase() === topic.trim().toLocaleLowerCase())) return false;
  if (classification && item.content.metadata.classification !== classification) return false;
  if (!query?.trim()) return true;
  const needle = query.trim().toLocaleLowerCase();
  const haystack = [
    ...Object.values(item.content.translations).flatMap(text => [text.title,text.summary,text.body,text.contributor]),
    ...item.content.sources.flatMap(source => [source.label,source.author,source.locator,source.kind]),
    ...item.content.metadata.topics, item.content.metadata.classification, item.content.metadata.clarity,
  ].join('\n').toLocaleLowerCase();
  return haystack.includes(needle);
}
async function publishedList(db, url) {
  const rows = await db.prepare('SELECT d.id,r.version,r.content,r.created_at FROM editorial_documents d JOIN editorial_revisions r ON r.document_id=d.id AND r.version=d.published ORDER BY r.created_at DESC LIMIT 200').all();
  return rows.results.map(row => publicItem(row)).filter(item => publicMatches(item, url));
}

export async function editorialResponse(request, env) {
  try {
    const url = new URL(request.url), path = url.pathname;
    if (request.method !== 'GET' && request.method !== 'POST') fail(405,'method_not_allowed');
    // Published content is still behind the configured Site audience. This identity
    // check prevents the API from becoming an accidental public draft endpoint.
    const actor = identity(request,env);
    if (path === '/api/admin/session' && request.method === 'GET') return response({user:actor,configured:!!env.EDITORIAL_OWNER_ID,languages:LANGUAGES,sourceKinds:SOURCE_KINDS,classification:CLASSIFICATIONS});
    if (!env.DB) fail(503,'storage_unavailable');
    const db = env.DB;
    if (path === '/api/content' && request.method === 'GET') return response({items:await publishedList(db,url)});
    const publicMatch = path.match(/^\/api\/content\/([a-zA-Z0-9-]{1,64})$/);
    if (publicMatch && request.method === 'GET') {
      const row = await db.prepare('SELECT d.id,r.version,r.content,r.created_at FROM editorial_documents d JOIN editorial_revisions r ON r.document_id=d.id AND r.version=d.published WHERE d.id = ?').bind(publicMatch[1]).first();
      if (!row) fail(404,'not_found');
      return response({item:publicItem(row)});
    }
    permitted(actor,ROLES);
    if (path === '/api/admin/documents' && request.method === 'GET') {
      const rows = await db.prepare('SELECT d.id,d.created_by,d.head,d.published,r.state,r.content,r.created_at FROM editorial_documents d JOIN editorial_revisions r ON r.document_id=d.id AND r.version=d.head WHERE (? <> ? OR d.created_by = ?) ORDER BY r.created_at DESC LIMIT 200').bind(actor.role,'author',actor.id).all();
      return response({items:rows.results.map(revision)});
    }
    if (request.method === 'POST') writeGuard(request);
    if (path === '/api/admin/documents' && request.method === 'POST') {
      permitted(actor,['author']);
      const input = await json(request), content = validateContent(input.content);
      const id = crypto.randomUUID(), time = new Date().toISOString();
      await db.batch([
        db.prepare('INSERT INTO editorial_documents (id,created_by,created_at,head,published) VALUES (?,?,?,?,NULL)').bind(id,actor.id,time,1),
        insertRevision(db,id,1,'draft',content,actor,'create','Initial draft',time),
      ]);
      return response(await getDocument(db,id),201);
    }
    const match = path.match(/^\/api\/admin\/documents\/([a-zA-Z0-9-]{1,64})(?:\/(history|preview|save|submit|approve|request-changes|publish|unpublish|restore))?$/);
    if (!match) fail(404,'not_found');
    const [,id,action] = match;
    const doc = await getDocument(db,id); canRead(actor,doc);
    if (request.method === 'GET') {
      if (!action) return response(doc);
      if (action === 'preview') {
        const version = url.searchParams.has('version') ? Number(url.searchParams.get('version')) : doc.head;
        if (!Number.isInteger(version) || version < 1 || version > doc.head) fail(400,'invalid_revision');
        const selected = await db.prepare('SELECT * FROM editorial_revisions WHERE document_id = ? AND version = ?').bind(id,version).first();
        if (!selected) fail(404,'not_found');
        return response({item:publicItem({...selected,id}, selected.state), preview: true});
      }
      if (action !== 'history') fail(405,'method_not_allowed');
      const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : doc.head + 1;
      if (!Number.isInteger(before) || before < 1) fail(400,'invalid_revision');
      const rows = await db.prepare('SELECT * FROM editorial_revisions WHERE document_id = ? AND version < ? ORDER BY version DESC LIMIT 51').bind(id,before).all();
      const page = rows.results.slice(0,50);
      return response({items:page.map(revision),nextBefore:rows.results.length>50?page.at(-1).version:null});
    }
    const input = await json(request);
    if (!Number.isInteger(input.baseVersion) || input.baseVersion !== doc.head) fail(409,'revision_conflict');
    let content = doc.current.content, state = doc.current.state, published = doc.published;
    const note = string(input.note ?? '',2000,true);
    const time = new Date().toISOString();
    switch (action) {
      case 'save': author(actor,doc); content = validateContent(input.content); state = 'draft'; break;
      case 'restore': {
        author(actor,doc);
        if (!Number.isInteger(input.version) || input.version < 1) fail(400,'invalid_revision');
        const old = await db.prepare('SELECT content FROM editorial_revisions WHERE document_id = ? AND version = ?').bind(id,input.version).first();
        if (!old) fail(404,'not_found'); content = validateContent(parseContent(old.content)); state = 'draft'; break;
      }
      case 'submit': author(actor,doc); if (!['draft','changes_requested'].includes(state)) fail(409,'invalid_transition'); content = validateContent(content,true); state = 'in_review'; break;
      case 'approve':
        permitted(actor,['reviewer']);
        if (state !== 'in_review') fail(409,'invalid_transition');
        if (input.reviewed !== true || note.length < 10) fail(400,'review_confirmation_required');
        content = validateContent(content,true);
        content.review = reviewAcknowledgements(input, content, doc.head, actor, time);
        state = 'approved';
        break;
      case 'request-changes': permitted(actor,['reviewer']); if (state !== 'in_review') fail(409,'invalid_transition'); state = 'changes_requested'; break;
      case 'publish':
        permitted(actor,['publisher']);
        if (state !== 'approved' || !approvedForCurrentRevision(content, doc.head)) fail(409,'approval_required');
        state = 'published'; published = doc.head + 1; break;
      case 'unpublish':
        permitted(actor,['publisher']);
        if (!published) fail(409,'not_published');
        // Withdrawing starts a fresh draft, so an old acknowledgement cannot be
        // replayed to publish it later without another submission and approval.
        content = validateContent(content); state = 'draft'; published = null; break;
      default: fail(405,'method_not_allowed');
    }
    const version = doc.head + 1;
    // D1 batch is transactional. A duplicate version aborts the entire batch on concurrent writes.
    // The conditional update and unique revision key keep edits/approval/publication on one exact head.
    let results;
    try {
      results = await db.batch([
        db.prepare('UPDATE editorial_documents SET head=?,published=? WHERE id=? AND head=?').bind(version,published,id,doc.head),
        insertRevision(db,id,version,state,content,actor,action,note,time),
      ]);
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error))) fail(409,'revision_conflict');
      throw error;
    }
    if (results[0].meta.changes !== 1) fail(409,'revision_conflict');
    return response(await getDocument(db,id));
  } catch (error) {
    if (error instanceof Problem) return response({error:error.message},error.status);
    console.error('[editorial] request failed');
    return response({error:'storage_unavailable'},503);
  }
}
