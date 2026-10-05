import { database, verifySchema, closeDatabase } from '../server/db.mjs';

const tailnet = process.env.AUTH_PROVIDER === 'tailscale-serve';
const google = process.env.AUTH_PROVIDER === 'google-oidc';
const id = process.env.REVIEW_BOOTSTRAP_OWNER_ID;
const manusId = /^[\w.:-]{1,200}$/;
const tailnetId = /^tailnet:[a-z0-9][a-z0-9._%+-]{0,120}@[a-z0-9.-]+\.[a-z]{2,24}$/;
const googleId = /^google:[A-Za-z0-9_-]{43}$/;
if (!id || id.length > 200 || !(google ? googleId : tailnet ? tailnetId : manusId).test(id))
  throw new Error('Set a verified REVIEW_BOOTSTRAP_OWNER_ID in the operator environment.');
if (tailnet && (!id.startsWith('tailnet:') ||
    process.env.REVIEW_BIND_HOST !== '127.0.0.1'))
  throw new Error('A protected, loopback-only host and exact verified tailnet login are required.');
if (google && (process.env.REVIEW_DB_ROLE !== 'migrator' ||
    process.env.REVIEW_DB_TRANSPORT !== 'railway-internal-wireguard' ||
    process.env.REVIEW_BIND_HOST !== '0.0.0.0' ||
    process.env.RAILWAY_PROJECT_ID !== '786918bd-4ce1-4075-b763-93c7c6f729a1' ||
    process.env.RAILWAY_ENVIRONMENT_ID !== '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66'))
  throw new Error('Google owner bootstrap requires the isolated Railway migrator and an exact verified subject reference.');
try {
  // DDL belongs to an explicit, backed-up schema preparation step. A normal
  // owner mapping must never silently upgrade an existing database.
  await verifySchema();
  const db = database();
  const owners = await db.prepare("SELECT user_id FROM review_roles WHERE role = 'owner' AND disabled = 0").all();
  if (owners.results.length && owners.results.some(owner => owner.user_id !== id))
    throw new Error('An owner is already bound. Stop and investigate; this script will not transfer ownership.');
  if (!owners.results.length) {
    await db.prepare('INSERT INTO review_roles (user_id,role,disabled,updated_at,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role), disabled=0, updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)')
      .bind(id, 'owner', 0, new Date().toISOString(), tailnet ? 'verified_tailnet_operator_bootstrap' : google ? 'verified_google_operator_bootstrap' : 'verified_oauth_operator_bootstrap').run();
  }
  console.log('Owner binding verified; no account identifier or credentials logged.');
} finally { await closeDatabase(); }
