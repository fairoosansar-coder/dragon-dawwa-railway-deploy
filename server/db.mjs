import mysql from 'mysql2/promise';
import net from 'node:net';
import { lstatSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let pool;
const migrationDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = async () => (await readdir(migrationDir)).filter(name => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name)).sort();
const LOCAL_SOCKET_PATH = '/run/mysqld/mysqld.sock';
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_MODE_KEYS = ['AUTH_PROVIDER', 'REVIEW_BIND_HOST', 'REVIEW_LOCAL_DB_SOCKET'];
const RAILWAY_PROJECT_ID = '786918bd-4ce1-4075-b763-93c7c6f729a1';
const RAILWAY_ENVIRONMENT_ID = '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66';
const RAILWAY_INTERNAL_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.railway\.internal$/;
const RAILWAY_SCHEMA = 'dragon_dawwa_private_railway';

function configValue(env, name) { return typeof env?.[name] === 'string' ? env[name] : ''; }

function databaseUrl(env) {
  const configured = configValue(env, 'DATABASE_URL');
  if (!configured) throw new Error('Review database unavailable');
  let url;
  try { url = new URL(configured); }
  catch { throw new Error('Invalid database configuration'); }
  if (url.protocol !== 'mysql:' || !url.hostname || !url.pathname.slice(1) || url.pathname.slice(1).includes('/'))
    throw new Error('Invalid database configuration');
  try {
    return {
      url,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch { throw new Error('Invalid database configuration'); }
}

function isManusPreview(env) {
  return Boolean(configValue(env, 'MANUS_WEBDEV_PROJECT_ID') ||
    configValue(env, 'MANUS_ADDON_PREVIEW_PUBLIC_ORIGIN') ||
    configValue(env, 'MANUS_ADDON_RUNTIME_PUBLIC_ORIGIN'));
}

function assertDirectLocalSocket(socketPath) {
  let socket;
  for (const candidate of ['/run', '/run/mysqld', socketPath]) {
    let details;
    try { details = lstatSync(candidate); }
    catch { throw new Error('Local database socket unavailable'); }
    if (details.isSymbolicLink()) throw new Error('Local database socket must not traverse symlinks');
    socket = details;
  }
  if (!socket.isSocket()) throw new Error('Local database socket unavailable');
}

// This function intentionally does no I/O so deployment checks can validate the
// environment without opening a database connection or requiring a local socket.
export function databaseConnectionOptions(env = process.env) {
  const { url, user, password, database } = databaseUrl(env);
  const localHost = LOCAL_DB_HOSTS.has(url.hostname);
  const localModeRequested = localHost || LOCAL_MODE_KEYS.some(name => configValue(env, name));
  const railwayTransport = configValue(env, 'REVIEW_DB_TRANSPORT');
  const common = {
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    dateStrings: true,
    enableKeepAlive: true,
  };

  if (railwayTransport) {
    const railwayRole = configValue(env, 'REVIEW_DB_ROLE');
    const provider = configValue(env, 'AUTH_PROVIDER');
    const validBinding = provider === 'tailscale-serve' && configValue(env, 'REVIEW_BIND_HOST') === '127.0.0.1' ||
      provider === 'google-oidc' && configValue(env, 'REVIEW_BIND_HOST') === '0.0.0.0';
    const databaseUser = { app: 'dd_app', migrator: 'dd_migrator', backup: 'dd_backup' }[railwayRole];
    if (railwayTransport !== 'railway-internal-wireguard' || isManusPreview(env) ||
        configValue(env, 'RAILWAY_PROJECT_ID') !== RAILWAY_PROJECT_ID ||
        configValue(env, 'RAILWAY_ENVIRONMENT_ID') !== RAILWAY_ENVIRONMENT_ID ||
        !validBinding || database !== RAILWAY_SCHEMA ||
        configValue(env, 'REVIEW_LOCAL_DB_SOCKET') ||
        !RAILWAY_INTERNAL_HOST.test(url.hostname) || !user || !password ||
        !databaseUser || user !== databaseUser ||
        url.search || url.hash)
      throw new Error('Invalid Railway private database configuration');

    const port = Number(url.port || 3306);
    // Railway's same-project private DNS is IPv6 over encrypted WireGuard. mysql2
    // ignores a `family` option, so provide an IPv6-only socket factory instead.
    // Deliberate absence of MySQL TLS is confined to this exact internal transport.
    return {
      host: url.hostname,
      port,
      ...common,
      stream: () => net.connect({ host: url.hostname, port, family: 6 }),
    };
  }

  if (RAILWAY_INTERNAL_HOST.test(url.hostname))
    throw new Error('Railway private database transport must be explicitly selected');
  if (!localModeRequested) {
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      ...common,
      ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    };
  }

  if (isManusPreview(env)) throw new Error('Local private database mode is unavailable in Manus Preview');
  if (!localHost || configValue(env, 'AUTH_PROVIDER') !== 'tailscale-serve' ||
      configValue(env, 'REVIEW_BIND_HOST') !== '127.0.0.1' ||
      configValue(env, 'REVIEW_LOCAL_DB_SOCKET') !== LOCAL_SOCKET_PATH)
    throw new Error('Invalid local private database configuration');

  // mysql2 uses the Unix socket directly; TLS is deliberately absent only here.
  return { socketPath: LOCAL_SOCKET_PATH, ...common };
}

export function getPool() {
  if (pool) return pool;
  const options = databaseConnectionOptions(process.env);
  if (options.socketPath) assertDirectLocalSocket(options.socketPath);
  pool = mysql.createPool(options);
  return pool;
}

class Statement {
  constructor(executor, sql, values = []) { this.executor = executor; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.executor, this.sql, values); }
  async first() { const [rows] = await this.executor.execute(this.sql, this.values); return rows[0] || null; }
  async all() { const [rows] = await this.executor.execute(this.sql, this.values); return { results: rows }; }
  async run() {
    const [result] = await this.executor.execute(this.sql, this.values);
    return { success: true, meta: { changes: result.affectedRows || 0, last_row_id: result.insertId || null } };
  }
}

export function database(executor = getPool()) {
  return {
    prepare(sql) { return new Statement(executor, sql); },
    async batch(statements) {
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const results = [];
        for (const statement of statements) {
          const [result] = await connection.execute(statement.sql, statement.values);
          results.push(Array.isArray(result) ? { results: result } : { success: true, meta: { changes: result.affectedRows || 0, last_row_id: result.insertId || null } });
        }
        await connection.commit();
        return results;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
  };
}

// Operator-only DDL: never call from a web request or normal server startup.
// The migration row is written only after every statement succeeds. MySQL/TiDB
// DDL can auto-commit, so a partly applied change is never considered rolled back.
export async function migrate() {
  const db = getPool();
  await db.execute('CREATE TABLE IF NOT EXISTS review_migrations (name VARCHAR(128) PRIMARY KEY, applied_at VARCHAR(35) NOT NULL)');
  const files = await migrationFiles();
  for (const name of files) {
    const [rows] = await db.execute('SELECT name FROM review_migrations WHERE name = ?', [name]);
    if (rows.length) continue;
    const sql = await readFile(path.join(migrationDir, name), 'utf8');
    // Our committed migrations contain simple DDL, not stored procedures or quoted semicolons.
    const source = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    for (const statement of source.split(';').map(s => s.trim()).filter(Boolean)) {
      try { await db.execute(statement); }
      catch (error) {
        // A restarted additive migration may have completed an index before its ledger row.
        if (/^CREATE INDEX /i.test(statement) && (error.code === 'ER_DUP_KEYNAME' || error.errno === 1061)) continue;
        if (/^ALTER TABLE \w+ ADD CONSTRAINT /i.test(statement) && (error.code === 'ER_FK_DUP_NAME' || error.errno === 1826)) continue;
        if (/^ALTER TABLE \w+ ADD COLUMN /i.test(statement) && (error.code === 'ER_DUP_FIELDNAME' || error.errno === 1060)) continue;
        if (/^ALTER TABLE \w+ DROP INDEX /i.test(statement) && (error.code === 'ER_CANT_DROP_FIELD_OR_KEY' || error.errno === 1091)) continue;
        throw error;
      }
    }
    await db.execute('INSERT INTO review_migrations (name,applied_at) VALUES (?,?)', [name, new Date().toISOString()]);
  }
  return files;
}

// Read-only startup check; a published restart must never apply unapplied DDL
// before an operator has taken and verified a restorable isolated snapshot.
export async function verifySchema() {
  const [rows] = await getPool().execute('SELECT name FROM review_migrations');
  const applied = new Set(rows.map(row => row.name));
  const missing = (await migrationFiles()).filter(name => !applied.has(name));
  if (missing.length) throw new Error('Review schema not prepared: ' + missing.join(', '));
  const [keys] = await getPool().execute(
    "SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('member_saves_profile_fk','member_progress_profile_fk')",
  );
  if (keys.length !== 2) throw new Error('Review member ownership constraints not present');
  if (applied.has('005_sessions.sql')) {
    const [tables] = await getPool().execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('review_session_revocations','review_session_epochs')",
    );
    if (tables.length !== 2) throw new Error('Review revocable-session tables not present');
    const [columns] = await getPool().execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='member_profiles' AND COLUMN_NAME IN ('preferred_translation_id','preferred_reciter_id')",
    );
    if (columns.length !== 2) throw new Error('Review member preference columns not present');
  }
  return {migrations: applied.size, memberForeignKeys: keys.length};
}

export async function closeDatabase() { if (pool) { await pool.end(); pool = undefined; } }
