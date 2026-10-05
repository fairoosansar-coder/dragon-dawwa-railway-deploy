// Invited-member routes receive a verified actor from server/access.mjs. Request bodies never assign roles.
import {createHmac, randomUUID} from 'node:crypto';
import {createQuranClient, QuranError} from '../lib/quran.mjs';
import {resourceSaveEligibility} from './manage.mjs';

const MEMBER_ROLE = 'reader';
const PROFILE_ROLES = new Set(['reader', 'author', 'reviewer', 'publisher', 'owner']);
const LANGUAGES = new Set(['en', 'ta', 'si']);
const AVATARS = new Set(['none', 'rosette', 'leaf', 'book']);
const CONTACT_PREFERENCES = new Set(['none', 'email', 'phone']);
const SAVE_KINDS = new Set(['external', 'editorial', 'home']);
const HOME_IDS = new Set(['ask', 'wisdom', 'authenticity', 'context']);
const MAX_BODY_BYTES = 32_768;
const MAX_SAVES = 500;
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const ADMIN_PAGE_MAX = 1_000;
let providerClient = null;
let providerConfig = [];
const markerCache = new Map();
const MARKER_CACHE_MAX = 64;
const MARKER_CACHE_MS = 5 * 60_000;

class Problem extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

const fail = (status, code) => { throw new Problem(status, code); };

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

function exportResponse(data) {
  return Response.json(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'attachment; filename="dragon-dawwa-my-learning.json"',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie',
    },
  });
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max, required, code) {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000')) fail(400, code);
  const clean = value.trim();
  if (required && !clean) fail(400, code);
  return clean;
}

function optionalText(value, max, code) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, max, true, code);
}

function optionalProviderId(value, code) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999) fail(400, code);
  return value;
}

function affected(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function duplicateKey(error) {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062 ||
    error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    /UNIQUE constraint failed|Duplicate entry/i.test(error?.message || '');
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

async function jsonBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'json_required');
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail(413, 'too_large');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_json');
  const chunks = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      fail(413, 'too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  let input;
  try { input = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail(400, 'invalid_json'); }
  if (!isObject(input)) fail(400, 'invalid_json');
  return input;
}

function sameOriginJson(request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'same_origin_required');
}

function verifiedActor(actor) {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim() || actor.id.length > 200 || typeof actor.role !== 'string') fail(401, 'sign_in_required');
  return actor;
}

function memberActor(actor) {
  verifiedActor(actor);
  if (!PROFILE_ROLES.has(actor.role)) fail(403, 'member_invitation_required');
  return actor;
}

function ownerActor(actor) {
  verifiedActor(actor);
  if (actor.role !== 'owner') fail(403, 'forbidden');
  return actor;
}

function onlyKeys(input, allowed, code) {
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(400, code);
}

function profileInput(input) {
  if (!isObject(input)) fail(400, 'invalid_profile');
  onlyKeys(input, new Set(['displayName', 'avatar', 'preferredLanguage', 'preferredTranslation', 'preferredReciter', 'city', 'mosque', 'contact', 'contactPreference', 'contactOptIn']), 'invalid_profile');
  const displayName = text(input.displayName, 120, true, 'invalid_profile');
  const avatar = input.avatar === undefined || input.avatar === null || input.avatar === '' ? 'none' : text(input.avatar, 16, true, 'invalid_profile');
  if (!AVATARS.has(avatar)) fail(400, 'invalid_profile');
  const preferredLanguage = input.preferredLanguage === undefined || input.preferredLanguage === null || input.preferredLanguage === '' ? 'en' : text(input.preferredLanguage, 2, true, 'invalid_profile');
  if (!LANGUAGES.has(preferredLanguage)) fail(400, 'invalid_profile');
  const city = optionalText(input.city, 120, 'invalid_profile');
  const mosque = optionalText(input.mosque, 160, 'invalid_profile');
  const contactPreference = input.contactPreference === undefined || input.contactPreference === null || input.contactPreference === '' ? 'none' : text(input.contactPreference, 16, true, 'invalid_profile');
  if (!CONTACT_PREFERENCES.has(contactPreference)) fail(400, 'invalid_profile');
  if (typeof input.contactOptIn !== 'boolean') fail(400, 'invalid_profile');
  const contact = optionalText(input.contact, 320, 'invalid_profile');
  if (contact && /[\r\n]/.test(contact)) fail(400, 'invalid_profile');
  if (contactPreference === 'none') {
    if (contact || input.contactOptIn) fail(400, 'invalid_contact_preference');
  } else {
    if (!contact || !input.contactOptIn) fail(400, 'contact_opt_in_required');
    if (contactPreference === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) fail(400, 'invalid_contact_preference');
    if (contactPreference === 'phone' && !/^\+?[0-9][0-9 ()-]{5,30}$/.test(contact)) fail(400, 'invalid_contact_preference');
  }
  return {
    displayName, avatar, preferredLanguage,
    preferredTranslation: optionalProviderId(input.preferredTranslation, 'invalid_profile'),
    preferredReciter: optionalProviderId(input.preferredReciter, 'invalid_profile'),
    city, mosque, contact, contactPreference, contactOptIn: input.contactOptIn,
  };
}

function profileView(row) {
  if (!row) return null;
  return {
    displayName: row.display_name,
    avatar: row.avatar_preset,
    preferredLanguage: row.preferred_language,
    preferredTranslation: row.preferred_translation_id === null || row.preferred_translation_id === undefined ? null : Number(row.preferred_translation_id),
    preferredReciter: row.preferred_reciter_id === null || row.preferred_reciter_id === undefined ? null : Number(row.preferred_reciter_id),
    city: row.city || '',
    mosque: row.mosque || '',
    contact: row.contact_value || '',
    contactPreference: row.contact_preference,
    contactOptIn: Boolean(row.contact_opt_in),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function placeView(row) {
  if (!row) return null;
  return {chapter: Number(row.chapter), page: Number(row.page), key: row.ayah_key, updatedAt: row.updated_at};
}

function saveView(row) {
  return {kind: row.kind, id: row.item_id, savedAt: row.saved_at};
}

async function profileFor(db, userId) {
  return db.prepare('SELECT user_id,display_name,avatar_preset,preferred_language,preferred_translation_id,preferred_reciter_id,city,mosque,contact_value,contact_preference,contact_opt_in,created_at,updated_at FROM member_profiles WHERE user_id=?').bind(userId).first();
}

async function requireProfile(db, userId) {
  const profile = await profileFor(db, userId);
  if (!profile) fail(409, 'registration_required');
  return profile;
}

function validItemId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)) fail(400, 'invalid_save');
  return value;
}

async function validateSaveTarget(db, kind, id, env) {
  if (!SAVE_KINDS.has(kind)) fail(400, 'invalid_save');
  validItemId(id);
  if (kind === 'home') {
    if (!HOME_IDS.has(id)) fail(400, 'invalid_save');
    return;
  }
  if (kind === 'external') {
    const check = typeof env?.resourceSaveEligibility === 'function'
      ? await env.resourceSaveEligibility(db, id)
      : await resourceSaveEligibility(db, id);
    if (!check?.eligible) fail(400, 'invalid_save');
    return;
  }
  const document = await db.prepare('SELECT id FROM editorial_documents WHERE id=? AND published IS NOT NULL').bind(id).first();
  if (!document) fail(400, 'invalid_save');
}

function saveInput(input) {
  onlyKeys(input, new Set(['action', 'kind', 'id']), 'invalid_save');
  if (input.action !== 'add' && input.action !== 'remove') fail(400, 'invalid_save');
  if (typeof input.kind !== 'string' || !SAVE_KINDS.has(input.kind)) fail(400, 'invalid_save');
  return {action: input.action, kind: input.kind, id: validItemId(input.id)};
}

async function saveMemberItem(db, actor, input, env) {
  const {action, kind, id} = saveInput(input);
  await requireProfile(db, actor.id);
  if (action === 'remove') {
    const result = await db.prepare('DELETE FROM member_saves WHERE user_id=? AND kind=? AND item_id=?').bind(actor.id, kind, id).run();
    return {status: 'removed', changed: affected(result) > 0};
  }
  await validateSaveTarget(db, kind, id, env);
  const existing = await db.prepare('SELECT item_id FROM member_saves WHERE user_id=? AND kind=? AND item_id=?').bind(actor.id, kind, id).first();
  if (existing) return {status: 'saved', added: false};
  const count = await db.prepare('SELECT COUNT(*) AS count FROM member_saves WHERE user_id=?').bind(actor.id).first();
  if (Number(count?.count || 0) >= MAX_SAVES) fail(409, 'save_limit_reached');
  try {
    await db.prepare('INSERT INTO member_saves (user_id,kind,item_id,saved_at) VALUES (?,?,?,?)').bind(actor.id, kind, id, new Date().toISOString()).run();
  } catch (error) {
    // A concurrent request may have inserted the identical primary key. It is still a saved item.
    if (duplicateKey(error)) return {status: 'saved', added: false};
    throw error;
  }
  return {status: 'saved', added: true};
}

function importInput(input) {
  onlyKeys(input, new Set(['bookmarks']), 'invalid_import');
  if (!Array.isArray(input.bookmarks) || input.bookmarks.length > MAX_SAVES) fail(400, 'invalid_import');
  const bookmarks = [];
  const seen = new Set();
  for (const value of input.bookmarks) {
    if (typeof value !== 'string' || !HOME_IDS.has(value)) fail(400, 'invalid_import');
    if (!seen.has(value)) { seen.add(value); bookmarks.push(value); }
  }
  return bookmarks;
}

async function importBookmarks(db, actor, input) {
  const bookmarks = importInput(input);
  await requireProfile(db, actor.id);
  const current = resultRows(await db.prepare("SELECT item_id FROM member_saves WHERE user_id=? AND kind='home'").bind(actor.id).all());
  const currentIds = new Set(current.map(row => row.item_id));
  const newIds = bookmarks.filter(id => !currentIds.has(id));
  const count = await db.prepare('SELECT COUNT(*) AS count FROM member_saves WHERE user_id=?').bind(actor.id).first();
  if (Number(count?.count || 0) + newIds.length > MAX_SAVES) fail(409, 'save_limit_reached');
  if (newIds.length) {
    const time = new Date().toISOString();
    await db.batch(newIds.map(id => db.prepare('INSERT INTO member_saves (user_id,kind,item_id,saved_at) VALUES (?,?,?,?)').bind(actor.id, 'home', id, time)));
  }
  return {status: 'imported', imported: newIds.length, alreadySaved: bookmarks.length - newIds.length};
}

function quranClient(env) {
  const current = [env?.QURAN_CLIENT_ID, env?.QURAN_CLIENT_SECRET, env?.QURAN_ENVIRONMENT || 'production'];
  if (!providerClient || current.some((value, index) => value !== providerConfig[index])) {
    providerClient = createQuranClient(env || {});
    providerConfig = current;
    markerCache.clear();
  }
  return providerClient;
}

function markerError(error) {
  if (error instanceof Problem) throw error;
  if (error instanceof QuranError && error.status === 400) fail(400, 'invalid_place');
  if (error?.code === 'invalid_marker' || error?.code === 'invalid_place' || error?.status === 400) fail(400, 'invalid_place');
  // Never save a numeric-looking marker when the authoritative provider is unavailable.
  fail(503, 'marker_validation_unavailable');
}

async function validateProviderPreferences(env, data) {
  if (data.preferredTranslation === null && data.preferredReciter === null) return;
  try {
    if (typeof env?.validateQuranPreferences === 'function') {
      await env.validateQuranPreferences({translationId: data.preferredTranslation, reciterId: data.preferredReciter});
      return;
    }
    const catalogue = await quranClient(env).bootstrap();
    if (data.preferredTranslation !== null && !catalogue.translations.some(item => item.id === data.preferredTranslation)) fail(400, 'invalid_profile');
    if (data.preferredReciter !== null && !catalogue.recitations.some(item => item.id === data.preferredReciter)) fail(400, 'invalid_profile');
  } catch (error) {
    if (error instanceof Problem) throw error;
    if (error instanceof QuranError && error.status === 400 || error?.code === 'invalid_preference' || error?.code === 'invalid_marker' || error?.status === 400) fail(400, 'invalid_profile');
    fail(503, 'preference_validation_unavailable');
  }
}

async function providerMarker(env, marker) {
  const cacheKey = `${marker.chapter}:${marker.page}:${marker.key}`;
  const cached = markerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.marker;
  try {
    if (typeof env?.validateQuranMarker === 'function') {
      const verified = await env.validateQuranMarker(marker);
      const resolved = positionInput(verified);
      if (resolved.chapter !== marker.chapter || resolved.key !== marker.key) fail(400, 'invalid_place');
      return resolved;
    }
    const client = quranClient(env);
    const catalogue = await client.bootstrap();
    const chapter = catalogue.chapters.find(item => item.id === marker.chapter);
    if (!chapter || !Number.isInteger(chapter.verses) || Number(marker.key.split(':')[1]) > chapter.verses) fail(400, 'invalid_place');
    const pages = [];
    const first = await client.verses(new URLSearchParams({chapter: String(marker.chapter), page: String(marker.page)}));
    pages.push(first);
    const pageTotal = Math.min(15, Math.max(1, Number(first.pagination?.total || Math.ceil(chapter.verses / 20))));
    // A mismatched page is repaired only after locating the same verified verse;
    // there are at most 15 chapter pages with this fixed 20-verse reader page size.
    for (let candidate = 1; candidate <= pageTotal; candidate++) {
      if (candidate !== marker.page) pages.push(await client.verses(new URLSearchParams({chapter: String(marker.chapter), page: String(candidate)})));
    }
    const resolvedPage = pages.find(item => item.verses?.some(verse => verse.key === marker.key))?.pagination?.current;
    if (!Number.isInteger(resolvedPage) || resolvedPage < 1 || resolvedPage > 15) fail(400, 'invalid_place');
    const resolved = {chapter: marker.chapter, page: resolvedPage, key: marker.key};
    if (markerCache.size >= MARKER_CACHE_MAX) markerCache.delete(markerCache.keys().next().value);
    markerCache.set(cacheKey, {marker: resolved, expiresAt: Date.now() + MARKER_CACHE_MS});
    return resolved;
  } catch (error) { markerError(error); }
}

function positionInput(input) {
  onlyKeys(input, new Set(['chapter', 'page', 'key']), 'invalid_place');
  if (!Number.isInteger(input.chapter) || input.chapter < 1 || input.chapter > 114 || !Number.isInteger(input.page) || input.page < 1 || input.page > 15 || typeof input.key !== 'string') fail(400, 'invalid_place');
  const match = input.key.match(/^(\d{1,3}):(\d{1,3})$/);
  if (!match || Number(match[1]) !== input.chapter || Number(match[2]) < 1 || Number(match[2]) > 286 || input.key.length > 16) fail(400, 'invalid_place');
  return {chapter: input.chapter, page: input.page, key: input.key};
}

async function savePlace(db, env, actor, input) {
  const candidate = positionInput(input);
  const place = await providerMarker(env, candidate);
  await requireProfile(db, actor.id);
  const now = new Date().toISOString();
  const update = await db.prepare('UPDATE member_progress SET chapter=?,page=?,ayah_key=?,updated_at=? WHERE user_id=?').bind(place.chapter, place.page, place.key, now, actor.id).run();
  if (!affected(update)) {
    try {
      await db.prepare('INSERT INTO member_progress (user_id,chapter,page,ayah_key,updated_at) VALUES (?,?,?,?,?)').bind(actor.id, place.chapter, place.page, place.key, now).run();
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const retried = await db.prepare('UPDATE member_progress SET chapter=?,page=?,ayah_key=?,updated_at=? WHERE user_id=?').bind(place.chapter, place.page, place.key, now, actor.id).run();
      if (!affected(retried)) fail(409, 'registration_required');
    }
  }
  return {...place, updatedAt: now};
}

async function memberMe(db, actor) {
  const profile = await profileFor(db, actor.id);
  if (!profile) return {registered: false, accountRole: actor.role, profile: null, saves: [], place: null};
  const [saves, progress] = await Promise.all([
    db.prepare(`SELECT kind,item_id,saved_at FROM member_saves WHERE user_id=? ORDER BY saved_at DESC LIMIT ${MAX_SAVES}`).bind(actor.id).all(),
    db.prepare('SELECT chapter,page,ayah_key,updated_at FROM member_progress WHERE user_id=?').bind(actor.id).first(),
  ]);
  return {registered: true, accountRole: actor.role, profile: profileView(profile), saves: resultRows(saves).map(saveView), place: placeView(progress)};
}

async function exportMemberData(db, actor) {
  const profile = await requireProfile(db, actor.id);
  const [saves, progress] = await Promise.all([
    db.prepare(`SELECT kind,item_id,saved_at FROM member_saves WHERE user_id=? ORDER BY saved_at DESC LIMIT ${MAX_SAVES}`).bind(actor.id).all(),
    db.prepare('SELECT chapter,page,ayah_key,updated_at FROM member_progress WHERE user_id=?').bind(actor.id).first(),
  ]);
  // Deliberately excludes review_roles, staff indexes, audit records, contact data
  // belonging to others, and any future study-history rows not owned by this actor.
  return {
    format: 'dragon-dawwa-member-export-v1',
    exportedAt: new Date().toISOString(),
    profile: profileView(profile),
    savedItems: resultRows(saves).map(saveView),
    readingPlace: placeView(progress),
  };
}

async function profileData(env, input) {
  const data = profileInput(input);
  await validateProviderPreferences(env, data);
  return data;
}

async function registerMember(db, env, actor, input) {
  const data = await profileData(env, input);
  const existing = await profileFor(db, actor.id);
  if (existing) fail(409, 'already_registered');
  const now = new Date().toISOString();
  try {
    await db.prepare('INSERT INTO member_profiles (user_id,display_name,avatar_preset,preferred_language,preferred_translation_id,preferred_reciter_id,city,mosque,contact_value,contact_preference,contact_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
      actor.id, data.displayName, data.avatar, data.preferredLanguage, data.preferredTranslation, data.preferredReciter, data.city, data.mosque, data.contact, data.contactPreference, data.contactOptIn ? 1 : 0, now, now,
    ).run();
  } catch (error) {
    if (/UNIQUE|duplicate|constraint/i.test(String(error))) fail(409, 'already_registered');
    throw error;
  }
  return {registered: true, accountRole: actor.role, profile: profileView(await profileFor(db, actor.id)), saves: [], place: null};
}

async function updateProfile(db, env, actor, input) {
  const data = await profileData(env, input);
  await requireProfile(db, actor.id);
  const now = new Date().toISOString();
  await db.prepare('UPDATE member_profiles SET display_name=?,avatar_preset=?,preferred_language=?,preferred_translation_id=?,preferred_reciter_id=?,city=?,mosque=?,contact_value=?,contact_preference=?,contact_opt_in=?,updated_at=? WHERE user_id=?').bind(
    data.displayName, data.avatar, data.preferredLanguage, data.preferredTranslation, data.preferredReciter, data.city, data.mosque, data.contact, data.contactPreference, data.contactOptIn ? 1 : 0, now, actor.id,
  ).run();
  return profileView(await profileFor(db, actor.id));
}

function deletionHash(userId, secret) {
  return createHmac('sha256', secret).update('dragon-dawwa/member-deletion/v1\0').update(userId).digest('hex');
}

export function deletionAuditSecret(env) {
  const googleMode = env.AUTH_PROVIDER === 'google-oidc';
  const secret = googleMode ? env.DD_DELETION_AUDIT_SECRET : env.DD_DELETION_AUDIT_SECRET || env.MANUS_JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < (googleMode ? 32 : 1)) fail(503, 'deletion_audit_unavailable');
  return secret;
}

async function deleteMember(db, env, actor, input) {
  onlyKeys(input, new Set(['confirm']), 'invalid_delete');
  if (input.confirm !== 'DELETE MY ACCOUNT') fail(400, 'delete_confirmation_required');
  if (actor.role !== MEMBER_ROLE) fail(409, 'staff_account_manual_role_transfer_or_revocation_required');
  const auditSecret = deletionAuditSecret(env);
  const profile = await profileFor(db, actor.id);
  if (!profile) fail(404, 'not_registered');
  const now = new Date().toISOString();
  const revokedAt = Date.now();
  const pseudonym = deletionHash(actor.id, auditSecret);
  try {
    const result = await db.batch([
      db.prepare('DELETE FROM member_saves WHERE user_id=?').bind(actor.id),
      db.prepare('DELETE FROM member_progress WHERE user_id=?').bind(actor.id),
      db.prepare('DELETE FROM member_profiles WHERE user_id=?').bind(actor.id),
      db.prepare('INSERT INTO member_deletion_audit (id,subject_hash,role_before,deleted_at) VALUES (?,?,?,?)').bind(randomUUID(), pseudonym, actor.role, now),
      // The trusted role table is the invitation source. Disabling it means this identity must be invited again.
      db.prepare("UPDATE review_roles SET disabled=1,role='reader',updated_at=?,updated_by=? WHERE user_id=? AND role='reader'").bind(now, actor.id, actor.id),
      // Keep member removal and signed-cookie invalidation atomic.
      db.prepare('INSERT INTO review_session_epochs (user_id,revoked_after,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE revoked_after=GREATEST(revoked_after,VALUES(revoked_after)),updated_at=VALUES(updated_at)').bind(actor.id, revokedAt, new Date(revokedAt).toISOString()),
    ]);
    if (affected(result?.[2]) !== 1) fail(409, 'already_deleted');
  } catch (error) {
    if (error instanceof Problem) throw error;
    if (/UNIQUE|duplicate|constraint/i.test(String(error))) fail(409, 'already_deleted');
    throw error;
  }
  return {
    status: 'deleted',
    reInviteRequired: true,
    audit: 'A keyed pseudonymous deletion record and necessary existing role/staff audit IDs are retained. Your separate sign-in account is not deleted; account recovery or deletion is managed by its provider.',
  };
}

function pageParameters(url) {
  const pageValue = url.searchParams.get('page') || '1';
  const pageSizeValue = url.searchParams.get('pageSize') || String(PAGE_SIZE_DEFAULT);
  if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(pageSizeValue)) fail(400, 'invalid_page');
  const page = Number(pageValue), pageSize = Number(pageSizeValue);
  if (!Number.isSafeInteger(page) || page > ADMIN_PAGE_MAX || !Number.isSafeInteger(pageSize) || pageSize > PAGE_SIZE_MAX) fail(400, 'invalid_page');
  const rawSearch = url.searchParams.get('search') || '';
  const search = text(rawSearch, 80, false, 'invalid_search');
  return {page, pageSize, offset: (page - 1) * pageSize, search};
}

function searchPattern(search) {
  return '%' + search.replace(/[!%_]/g, '!$&') + '%';
}

async function adminMembers(db, url) {
  const {page, pageSize, offset, search} = pageParameters(url);
  const where = search ? "WHERE display_name LIKE ? ESCAPE '!' OR user_id LIKE ? ESCAPE '!'" : '';
  const values = search ? [searchPattern(search), searchPattern(search)] : [];
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM member_profiles ${where}`).bind(...values).first();
  // MySQL's prepared-statement proxy rejects bound LIMIT/OFFSET (ER_WRONG_ARGUMENTS).
  // pageParameters has already constrained both to safe positive integers and <= 100/1000.
  const listing = await db.prepare(`SELECT user_id,display_name,avatar_preset,preferred_language,city,mosque,created_at,updated_at FROM member_profiles ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  // Deliberately excludes contact_value, contact_preference, contact_opt_in, saves, and progress.
  return {
    items: resultRows(listing).map(row => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatar: row.avatar_preset,
      preferredLanguage: row.preferred_language,
      city: row.city || '',
      mosque: row.mosque || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    page,
    pageSize,
    total: Number(count?.count || 0),
  };
}

async function adminAudit(db, url) {
  const {page, pageSize, offset, search} = pageParameters(url);
  const where = search ? "WHERE subject_hash LIKE ? ESCAPE '!' OR role_before LIKE ? ESCAPE '!'" : '';
  const values = search ? [searchPattern(search), searchPattern(search)] : [];
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM member_deletion_audit ${where}`).bind(...values).first();
  const listing = await db.prepare(`SELECT id,subject_hash,role_before,deleted_at FROM member_deletion_audit ${where} ORDER BY deleted_at DESC LIMIT ${pageSize} OFFSET ${offset}`).bind(...values).all();
  return {
    items: resultRows(listing).map(row => ({id: row.id, subjectHash: row.subject_hash, roleBefore: row.role_before, deletedAt: row.deleted_at})),
    page,
    pageSize,
    total: Number(count?.count || 0),
  };
}

/**
 * Private invited-member API. `actor` is supplied by verified server access control;
 * this module intentionally does not parse identity headers or profile-supplied roles.
 */
export async function memberResponse(request, env, actor = null) {
  try {
    if (!env?.DB) fail(503, 'storage_unavailable');
    const db = env.DB;
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/member/me') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      return response(await memberMe(db, verifiedActor(actor)));
    }
    if (path === '/api/admin/members') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      ownerActor(actor);
      return response(await adminMembers(db, url));
    }
    if (path === '/api/admin/member-audit') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      ownerActor(actor);
      return response(await adminAudit(db, url));
    }
    if (path === '/api/member/export') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'same_origin_required');
      return exportResponse(await exportMemberData(db, memberActor(actor)));
    }
    if (!path.startsWith('/api/member/')) fail(404, 'not_found');
    if (request.method !== 'POST') fail(405, 'method_not_allowed');
    sameOriginJson(request);
    const input = await jsonBody(request);
    if (path === '/api/member/register') return response(await registerMember(db, env, memberActor(actor), input), 201);
    if (path === '/api/member/profile') return response({profile: await updateProfile(db, env, memberActor(actor), input)});
    if (path === '/api/member/save') return response(await saveMemberItem(db, memberActor(actor), input, env));
    if (path === '/api/member/import') return response(await importBookmarks(db, memberActor(actor), input));
    if (path === '/api/member/place') return response({place: await savePlace(db, env, memberActor(actor), input)});
    if (path === '/api/member/delete') return response(await deleteMember(db, env, verifiedActor(actor), input));
    fail(404, 'not_found');
  } catch (error) {
    if (error instanceof Problem) return response({error: error.message}, error.status);
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.errno === 1452 || /FOREIGN KEY constraint failed/i.test(error.message || ''))
      return response({error: 'registration_required'}, 409);
    // Do not expose SQL, payload, account ID, or key material.
    return response({error: 'storage_unavailable'}, 503);
  }
}
