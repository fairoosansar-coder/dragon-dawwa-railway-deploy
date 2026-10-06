import { randomUUID } from 'node:crypto';
import { database, getPool } from './db.mjs';
import { logoutFormToken } from './auth.mjs';
import { assertLastActiveOwnerProtected, revokeAllSessions, LastOwnerError } from './session.mjs';

const ROLES = new Set(['reader', 'author', 'reviewer', 'publisher']);
const ROLE_CHANGES = new Set([...ROLES, 'revoke']);
const send = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function resolveActor(user, config) {
  if (!user) return null;
  const row = await database().prepare('SELECT role, disabled FROM review_roles WHERE user_id = ?').bind(user.id).first();
  if (row?.disabled) return null;
  const ownerId = config.EDITORIAL_OWNER_ID || config.REVIEW_OWNER_ID;
  const role = ownerId && user.id === ownerId || !ownerId && row?.role === 'owner' ? 'owner' : ROLES.has(row?.role) ? row.role : null;
  if (!role) return null; // An authenticated Manus login is not an invitation.
  return { id: user.id, role, name: user.name || '' };
}

function pageParams(url) {
  const page = Number(url.searchParams.get('page') || 1);
  const pageSize = Number(url.searchParams.get('pageSize') || 30);
  const search = (url.searchParams.get('search') || '').trim();
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 || search.length > 80)
    return null;
  return { page, pageSize, search, offset: (page - 1) * pageSize };
}

async function listRoles(url) {
  const input = pageParams(url);
  if (!input) return send({ error: 'invalid_page' }, 400);
  const escaped = '%' + input.search.replace(/[!%_]/g, '!$&') + '%';
  const where = input.search ? "WHERE user_id LIKE ? ESCAPE '!'" : '';
  const values = input.search ? [escaped] : [];
  const db = database();
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM review_roles ${where}`).bind(...values).first();
  // Only validated positive integers are interpolated: managed MySQL rejects bound LIMIT/OFFSET.
  const result = await db.prepare(`SELECT user_id,role,disabled,updated_at FROM review_roles ${where} ORDER BY updated_at DESC,user_id LIMIT ${input.pageSize} OFFSET ${input.offset}`).bind(...values).all();
  return send({ items: result.results, page: input.page, pageSize: input.pageSize, total: Number(count?.total || 0) });
}

export async function changeRole(actor, input, { pool = null, now = Date.now } = {}) {
  const id = input?.userId;
  if (typeof id !== 'string' || !/^[\w.:-]{1,191}$/.test(id) || id === actor.id || !ROLE_CHANGES.has(input.role))
    return send({ error: 'invalid_role_change' }, 400);
  const disabled = input.role === 'revoke' ? 1 : 0;
  const role = disabled ? 'reader' : input.role;
  const connection = await (pool || getPool()).getConnection();
  try {
    await connection.beginTransaction();
    // Lock the owner set before checking its last member. Two owners cannot
    // concurrently demote one another on distinct requests and leave zero owners.
    await connection.query("SELECT user_id FROM review_roles WHERE role='owner' ORDER BY user_id FOR UPDATE");
    await assertLastActiveOwnerProtected(database(connection), id, { nextRole: role, disabled: Boolean(disabled) });
    const [rows] = await connection.execute('SELECT role,disabled FROM review_roles WHERE user_id=? FOR UPDATE', [id]);
    const prior = rows[0] || null;
    const changedAt = now();
    const at = new Date(changedAt).toISOString();
    await connection.execute(
      'INSERT INTO review_roles (user_id,role,disabled,updated_at,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),disabled=VALUES(disabled),updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)',
      [id, role, disabled, at, actor.id],
    );
    const summary = JSON.stringify({ previousRole: prior?.role || null, previousDisabled: Boolean(prior?.disabled), newRole: role, disabled: Boolean(disabled) });
    await connection.execute(
      'INSERT INTO review_admin_audit (id,actor_id,action,target_type,target_id,summary,created_at) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), actor.id, disabled ? 'revoke' : 'grant', 'role', id, summary, at],
    );
    // Role writes, audit and copied-cookie invalidation succeed or roll back
    // together. Reinvited users must authenticate again under their new role.
    await revokeAllSessions(database(connection), id, { now: changedAt });
    await connection.commit();
    return send({ userId: id, role, disabled: Boolean(disabled) });
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve the original error */ }
    if (error instanceof LastOwnerError) return send({ error: 'last_owner_protected' }, 409);
    // Expose neither query text, database host nor affected identities in errors.
    return send({ error: 'role_change_unavailable' }, 503);
  } finally { connection.release(); }
}

export async function accessResponse(request, actor, config) {
  const url = new URL(request.url);
  if (url.pathname === '/api/review/session' && request.method === 'GET')
    return send({ user: actor, configured: actor?.role === 'owner' || !!(config.EDITORIAL_OWNER_ID || config.REVIEW_OWNER_ID),
      ...(config.AUTH_PROVIDER === 'google-oidc' ? { logoutCsrfToken: logoutFormToken(request, config) } : {}) });
  if (!actor || actor.role !== 'owner') return send({ error: 'forbidden' }, 403);
  if (url.pathname === '/api/admin/roles' && request.method === 'GET') return listRoles(url);
  if (url.pathname === '/api/admin/roles' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site' ||
        !request.headers.get('content-type')?.startsWith('application/json')) return send({ error: 'same_origin_json_required' }, 403);
    if (Number(request.headers.get('content-length') || 0) > 2000) return send({ error: 'too_large' }, 413);
    let input;
    try { input = await request.json(); } catch { return send({ error: 'invalid_json' }, 400); }
    return changeRole(actor, input);
  }
  return send({ error: 'not_found' }, 404);
}
