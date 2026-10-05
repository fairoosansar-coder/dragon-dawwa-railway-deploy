import { createHash } from 'node:crypto';

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const USER_ID_MAX = 200;
const TOKEN_MAX = 8_000;

export class SessionStoreError extends Error {
  constructor(code = 'session_store_unavailable') {
    super(code);
    this.code = code;
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super('last_owner_protected');
    this.code = 'last_owner_protected';
  }
}

function validUserId(userId) {
  return typeof userId === 'string' && userId.length > 0 && userId.length <= USER_ID_MAX;
}

function validTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function store(db) {
  if (!db || typeof db.prepare !== 'function') throw new SessionStoreError();
  return db;
}

/** SHA-256 is stored instead of an application session cookie or JWT. */
export function sessionTokenHash(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) return null;
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Return whether a signed token has not been persistently revoked. `issuedAt` is
 * a millisecond timestamp derived from a signed ddIat claim when present, or
 * a legacy JWT iat value for Preview-injected cookies.
 */
export async function isSessionActive(db, { token, userId, issuedAt, expiresAt }, { now = Date.now() } = {}) {
  const tokenHash = sessionTokenHash(token);
  if (!tokenHash || !validUserId(userId) || !validTimestamp(issuedAt) || !validTimestamp(expiresAt) || expiresAt <= now) return false;
  const connection = store(db);
  try {
    const [revoked, epoch] = await Promise.all([
      connection.prepare('SELECT token_hash FROM review_session_revocations WHERE token_hash=? AND expires_at>?').bind(tokenHash, now).first(),
      connection.prepare('SELECT revoked_after FROM review_session_epochs WHERE user_id=?').bind(userId).first(),
    ]);
    if (revoked) return false;
    return !epoch || Number(epoch.revoked_after) < issuedAt;
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    throw new SessionStoreError();
  }
}

/** Remove expired blacklist rows; callers run this only on revocation writes. */
export async function purgeExpiredSessionRevocations(db, { now = Date.now() } = {}) {
  const connection = store(db);
  try {
    const result = await connection.prepare('DELETE FROM review_session_revocations WHERE expires_at<=?').bind(now).run();
    return changes(result);
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    throw new SessionStoreError();
  }
}

/** Persistently invalidate this exact signed token until its signed expiry. */
export async function revokeSession(db, { token, userId, expiresAt }, { now = Date.now() } = {}) {
  const tokenHash = sessionTokenHash(token);
  if (!tokenHash || !validUserId(userId) || !validTimestamp(expiresAt)) throw new SessionStoreError('invalid_session_revoke');
  if (expiresAt <= now) return { revoked: false, expired: true };
  const connection = store(db);
  try {
    await purgeExpiredSessionRevocations(connection, { now });
    await connection.prepare(
      'INSERT INTO review_session_revocations (token_hash,user_id,expires_at,revoked_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE expires_at=GREATEST(expires_at,VALUES(expires_at)),revoked_at=VALUES(revoked_at)',
    ).bind(tokenHash, userId, expiresAt, new Date(now).toISOString()).run();
    return { revoked: true, expiresAt };
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    throw new SessionStoreError();
  }
}

/**
 * Invalidate all tokens issued at or before this instant for one verified user.
 * This is deliberately per-user: it never blacklists Preview cookies globally.
 */
export async function revokeAllSessions(db, userId, { now = Date.now() } = {}) {
  if (!validUserId(userId) || !validTimestamp(now)) throw new SessionStoreError('invalid_session_revoke');
  const connection = store(db);
  try {
    await purgeExpiredSessionRevocations(connection, { now });
    await connection.prepare(
      'INSERT INTO review_session_epochs (user_id,revoked_after,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE revoked_after=GREATEST(revoked_after,VALUES(revoked_after)),updated_at=VALUES(updated_at)',
    ).bind(userId, now, new Date(now).toISOString()).run();
    return { revokedAll: true, revokedAfter: now };
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    throw new SessionStoreError();
  }
}

/**
 * Use immediately before an owner-role removal, disable, or transfer. The
 * calling route still validates the requested role and performs its write.
 */
export async function assertLastActiveOwnerProtected(db, targetUserId, { nextRole, disabled = false } = {}) {
  if (!validUserId(targetUserId)) throw new LastOwnerError();
  const connection = store(db);
  try {
    const target = await connection.prepare('SELECT role,disabled FROM review_roles WHERE user_id=?').bind(targetUserId).first();
    const removesActiveOwner = target?.role === 'owner' && !Number(target.disabled) && (disabled || nextRole !== 'owner');
    if (!removesActiveOwner) return;
    const owners = await connection.prepare("SELECT COUNT(*) AS count FROM review_roles WHERE role='owner' AND disabled=0").first();
    if (Number(owners?.count || 0) <= 1) throw new LastOwnerError();
  } catch (error) {
    if (error instanceof LastOwnerError || error instanceof SessionStoreError) throw error;
    throw new SessionStoreError();
  }
}
