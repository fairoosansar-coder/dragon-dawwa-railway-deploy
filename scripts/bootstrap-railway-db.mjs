// Operator-only bootstrap for a separately provisioned, empty Railway private schema.
// Never run as a normal server startup or Webdev Preview migration.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { databaseConnectionOptions, getPool, migrate, verifySchema, closeDatabase } from '../server/db.mjs';

const CONFIRM = 'I_UNDERSTAND_EMPTY_RAILWAY_SCHEMA_ONLY';
const SCHEMA = 'dragon_dawwa_private_railway';
const LOCK = 'dragon-dawwa-railway-empty-schema-bootstrap';

// Pure preflight: rejection must occur before even opening a database connection.
export function emptyRailwaySchemaConfig(env = process.env) {
  if (env.DD_BOOTSTRAP_EMPTY_RAILWAY_DB !== CONFIRM)
    throw new Error('Explicit Railway empty-schema bootstrap confirmation is required.');
  const options = databaseConnectionOptions(env);
  if (!options.host?.endsWith('.railway.internal') || typeof options.stream !== 'function' ||
      options.user !== 'dd_migrator' || env.REVIEW_DB_ROLE !== 'migrator' ||
      Object.hasOwn(options, 'ssl') || Object.hasOwn(options, 'socketPath'))
    throw new Error('Railway bootstrap requires the exact internal WireGuard database transport.');
  if (options.database !== SCHEMA || env.REVIEW_EXPECTED_SCHEMA !== SCHEMA)
    throw new Error('Railway bootstrap refuses any original, review, or unexpected schema.');
  return { schema: SCHEMA, host: options.host, port: options.port };
}

// Defense-in-depth. MySQL can hide objects in metadata from underprivileged
// accounts; the operator must ALSO inventory this fresh schema as an admin
// before the migrator runs. See docs/RAILWAY_PRIVATE_RUNBOOK.md.
export async function schemaObjectCount(connection) {
  const [rows] = await connection.execute(
    `SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS relations,
      (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()) AS routines,
      (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()) AS events,
      (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) AS triggers`,
  );
  const counts = ['relations', 'routines', 'events', 'triggers'].map(name => Number(rows[0]?.[name]));
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0))
    throw new Error('Could not verify all Railway private schema objects.');
  return counts.reduce((sum, value) => sum + value, 0);
}

export async function bootstrapEmptyRailwaySchema(env = process.env) {
  const target = emptyRailwaySchemaConfig(env);
  const actual = emptyRailwaySchemaConfig(process.env);
  if (target.schema !== actual.schema || target.host !== actual.host ||
      target.port !== actual.port || env.DATABASE_URL !== process.env.DATABASE_URL)
    throw new Error('Bootstrap target does not match the current process configuration.');

  let connection;
  let lockHeld = false;
  try {
    connection = await getPool().getConnection();
    const [locks] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [LOCK]);
    if (Number(locks[0]?.acquired) !== 1) throw new Error('Could not obtain exclusive bootstrap lock.');
    lockHeld = true;
    if (await schemaObjectCount(connection) !== 0)
      throw new Error('Railway private schema is not empty; refusing bootstrap.');
    await migrate();
    await verifySchema();
    console.log('object_count=' + await schemaObjectCount(connection));
  } finally {
    if (connection) {
      if (lockHeld) {
        try { await connection.query('SELECT RELEASE_LOCK(?)', [LOCK]); }
        catch { /* Preserve the original bootstrap error. */ }
      }
      connection.release();
    }
    await closeDatabase();
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) await bootstrapEmptyRailwaySchema();
