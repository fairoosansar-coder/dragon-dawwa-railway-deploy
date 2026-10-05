// Operator-only first bootstrap for a brand-new private local MySQL schema.
// DD_BOOTSTRAP_EMPTY_PRIVATE_DB=I_UNDERSTAND_EMPTY_SCHEMA_ONLY node scripts/bootstrap-isolated-db.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { databaseConnectionOptions, getPool, migrate, verifySchema, closeDatabase } from '../server/db.mjs';

const CONFIRM_EMPTY_SCHEMA = 'I_UNDERSTAND_EMPTY_SCHEMA_ONLY';
const PRIVATE_SCHEMA_PREFIX = 'dragon_dawwa_private_';
const LOCAL_SOCKET_PATH = '/run/mysqld/mysqld.sock';
const BOOTSTRAP_LOCK = 'dragon-dawwa-private-empty-schema-bootstrap';
const ORIGINAL_SCHEMA_NAMES = new Set([
  'dragon_dawwa',
  'dragon_dawwa_site',
  'dragon_dawwa_review',
  'site',
  'review',
]);

// Kept pure so a rejected invocation never opens a MySQL connection.
export function emptySchemaBootstrapConfig(env = process.env) {
  if (env.DD_BOOTSTRAP_EMPTY_PRIVATE_DB !== CONFIRM_EMPTY_SCHEMA)
    throw new Error('Set DD_BOOTSTRAP_EMPTY_PRIVATE_DB=I_UNDERSTAND_EMPTY_SCHEMA_ONLY.');

  const options = databaseConnectionOptions(env);
  if (options.socketPath !== LOCAL_SOCKET_PATH)
    throw new Error('Empty-schema bootstrap requires the approved local private database socket.');

  const schema = options.database;
  const expected = typeof env.REVIEW_EXPECTED_SCHEMA === 'string' ? env.REVIEW_EXPECTED_SCHEMA : '';
  if (!expected || expected !== schema)
    throw new Error('REVIEW_EXPECTED_SCHEMA must independently match the DATABASE_URL schema.');
  if (ORIGINAL_SCHEMA_NAMES.has(schema) || !schema.startsWith(PRIVATE_SCHEMA_PREFIX))
    throw new Error('Empty-schema bootstrap refuses original Site or review schemas.');

  return { schema };
}

async function tableCount(connection) {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS table_count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
  );
  return Number(rows[0]?.table_count);
}

export async function bootstrapEmptyPrivateSchema(env = process.env) {
  const intended = emptySchemaBootstrapConfig(env);
  // getPool() intentionally uses the process environment. Refuse a caller that
  // validates one target but would open another through that shared pool.
  const actual = emptySchemaBootstrapConfig(process.env);
  if (intended.schema !== actual.schema || env.DATABASE_URL !== process.env.DATABASE_URL)
    throw new Error('Bootstrap target does not match the current process configuration.');
  let connection;
  let lockHeld = false;
  try {
    connection = await getPool().getConnection();
    const [lock] = await connection.query(`SELECT GET_LOCK('${BOOTSTRAP_LOCK}', 10) AS acquired`);
    if (Number(lock[0]?.acquired) !== 1) throw new Error('Could not obtain exclusive empty-schema bootstrap lock.');
    lockHeld = true;

    if (await tableCount(connection) !== 0)
      throw new Error('Private schema is not empty; refusing bootstrap.');
    await migrate();
    await verifySchema();
    console.log('table_count=' + await tableCount(connection));
  } finally {
    if (connection) {
      if (lockHeld) {
        try { await connection.query(`SELECT RELEASE_LOCK('${BOOTSTRAP_LOCK}')`); }
        catch { /* The original migration/bootstrap error remains authoritative. */ }
      }
      connection.release();
    }
    await closeDatabase();
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) await bootstrapEmptyPrivateSchema();
