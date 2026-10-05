import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { databaseConnectionOptions } from '../server/db.mjs';
import { emptyRailwaySchemaConfig, bootstrapEmptyRailwaySchema, schemaObjectCount } from './bootstrap-railway-db.mjs';

const schema = 'dragon_dawwa_private_railway';
const privateUrl = `mysql://dd_app:fake-unit-secret@mysql.railway.internal:3306/${schema}`;
const env = {
  DATABASE_URL: privateUrl,
  REVIEW_DB_TRANSPORT: 'railway-internal-wireguard',
  REVIEW_DB_ROLE: 'app',
  RAILWAY_PROJECT_ID: '786918bd-4ce1-4075-b763-93c7c6f729a1',
  RAILWAY_ENVIRONMENT_ID: '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66',
  AUTH_PROVIDER: 'tailscale-serve',
  REVIEW_BIND_HOST: '127.0.0.1',
};
const bootstrap = {
  ...env,
  DATABASE_URL: privateUrl.replace('dd_app:', 'dd_migrator:'),
  REVIEW_DB_ROLE: 'migrator',
  DD_BOOTSTRAP_EMPTY_RAILWAY_DB: 'I_UNDERSTAND_EMPTY_RAILWAY_SCHEMA_ONLY',
  REVIEW_EXPECTED_SCHEMA: schema,
};
const google = { ...env, AUTH_PROVIDER: 'google-oidc', REVIEW_BIND_HOST: '0.0.0.0' };

function rejected(patch, expression = /Invalid Railway private database configuration/) {
  assert.throws(() => databaseConnectionOptions({ ...env, ...patch }), expression);
}

test('exact isolated Railway mode uses private IPv6 factory; managed TLS and VM socket remain separate', () => {
  const options = databaseConnectionOptions(env);
  assert.equal(options.host, 'mysql.railway.internal');
  assert.equal(options.port, 3306);
  assert.equal(options.database, schema);
  assert.equal(options.user, 'dd_app');
  assert.equal(typeof options.stream, 'function');
  assert.ok(!Object.hasOwn(options, 'ssl'));
  assert.ok(!Object.hasOwn(options, 'socketPath'));
});

test('Google HTTPS app and operator-only migrator use only the same exact private schema', () => {
  assert.equal(databaseConnectionOptions(google).user, 'dd_app');
  const migrator = { ...google, DATABASE_URL: privateUrl.replace('dd_app:', 'dd_migrator:'), REVIEW_DB_ROLE: 'migrator' };
  assert.equal(databaseConnectionOptions(migrator).user, 'dd_migrator');
  assert.deepEqual(emptyRailwaySchemaConfig({ ...migrator, DD_BOOTSTRAP_EMPTY_RAILWAY_DB: 'I_UNDERSTAND_EMPTY_RAILWAY_SCHEMA_ONLY', REVIEW_EXPECTED_SCHEMA: schema }),
    { schema, host: 'mysql.railway.internal', port: 3306 });
  for (const candidate of [
    { REVIEW_BIND_HOST: '127.0.0.1' },
    { DATABASE_URL: privateUrl.replace(schema, 'dragon_dawwa_original') },
    { DATABASE_URL: privateUrl.replace('dd_app:', 'root:') },
    { RAILWAY_ENVIRONMENT_ID: 'unrelated' },
    { REVIEW_DB_ROLE: 'migrator' },
  ]) assert.throws(() => databaseConnectionOptions({ ...google, ...candidate }), /Invalid Railway private database configuration/);
});

test('backup role accepts exactly dd_backup in the separate schema, never a public URL', () => {
  const backup = { ...google, REVIEW_DB_ROLE: 'backup', DATABASE_URL: privateUrl.replace('dd_app:', 'dd_backup:') };
  assert.equal(databaseConnectionOptions(backup).user, 'dd_backup');
  assert.throws(() => databaseConnectionOptions({ ...backup, DATABASE_URL: privateUrl }), /Invalid Railway private database configuration/);
  assert.throws(() => databaseConnectionOptions({ ...backup, DATABASE_URL: backup.DATABASE_URL.replace('railway.internal', 'railway.app') }), /Invalid Railway private database configuration/);
  assert.throws(() => databaseConnectionOptions({ ...backup, AUTH_PROVIDER: 'manus' }), /Invalid Railway private database configuration/);
});

test('an internal hostname without an explicit transport fails closed', () => {
  rejected({ REVIEW_DB_TRANSPORT: '' }, /must be explicitly selected/);
});

test('the private exception refuses another project or environment', () => {
  rejected({ RAILWAY_PROJECT_ID: 'other-project' });
  rejected({ RAILWAY_ENVIRONMENT_ID: 'other-environment' });
  rejected({ RAILWAY_PROJECT_ID: '' });
});

test('the private exception refuses Manus Preview, a VM socket or a non-loopback app', () => {
  rejected({ MANUS_WEBDEV_PROJECT_ID: 'preview-project' });
  rejected({ MANUS_ADDON_PREVIEW_PUBLIC_ORIGIN: 'https://preview.invalid' });
  rejected({ REVIEW_LOCAL_DB_SOCKET: '/run/mysqld/mysqld.sock' });
  rejected({ REVIEW_BIND_HOST: '0.0.0.0' });
  rejected({ AUTH_PROVIDER: 'manus' });
});

test('the private exception refuses a public/internal-like URL, local URL or unknown mode', () => {
  rejected({ DATABASE_URL: `mysql://dd_app:fake-unit-secret@mysql.railway.app:3306/${schema}` });
  rejected({ DATABASE_URL: `mysql://dd_app:fake-unit-secret@mysql.railway.internal.evil.invalid/${schema}` });
  rejected({ DATABASE_URL: `mysql://dd_app:fake-unit-secret@127.0.0.1/${schema}` });
  rejected({ REVIEW_DB_TRANSPORT: 'railway-public' });
});

test('the private exception requires least-privilege credentials and no URL options', () => {
  rejected({ DATABASE_URL: `mysql://root:fake-unit-secret@mysql.railway.internal/${schema}` });
  rejected({ DATABASE_URL: `mysql://dd_app@mysql.railway.internal/${schema}` });
  rejected({ REVIEW_DB_ROLE: '' });
  rejected({ REVIEW_DB_ROLE: 'migrator' });
  rejected({ DATABASE_URL: privateUrl.replace('dd_app:', 'dd_migrator:') });
  rejected({ DATABASE_URL: `${privateUrl}?ssl=false` });
  rejected({ DATABASE_URL: `${privateUrl}#fragment` });
});

test('Railway empty-schema bootstrap requires confirmation and an independent exact schema', () => {
  assert.throws(() => emptyRailwaySchemaConfig(env), /confirmation/);
  assert.deepEqual(emptyRailwaySchemaConfig(bootstrap), {
    schema, host: 'mysql.railway.internal', port: 3306,
  });
  assert.throws(() => emptyRailwaySchemaConfig({ ...bootstrap, REVIEW_EXPECTED_SCHEMA: 'dragon_dawwa_private_other' }), /unexpected schema/);
  assert.throws(() => emptyRailwaySchemaConfig({ ...bootstrap, DATABASE_URL: bootstrap.DATABASE_URL.replace(schema, 'dragon_dawwa_review') }), /Invalid Railway private database configuration/);
  assert.throws(() => emptyRailwaySchemaConfig({ ...bootstrap, DATABASE_URL: privateUrl, REVIEW_DB_ROLE: 'app' }), /internal WireGuard database transport/);
});

test('empty-schema inventory includes tables/views, routines, events and triggers, rejecting hidden counts', async () => {
  let sql;
  const database = { execute: async query => {
    sql = query;
    return [[{ relations: 0, routines: 1, events: 1, triggers: 1 }]];
  } };
  assert.equal(await schemaObjectCount(database), 3);
  for (const table of ['TABLES', 'ROUTINES', 'EVENTS', 'TRIGGERS'])
    assert.match(sql, new RegExp(`information_schema\\.${table}`));
  await assert.rejects(() => schemaObjectCount({ execute: async () => [[{ relations: 0 }]] }), /Could not verify/);
});

test('bootstrap never validates one process target then connects to another', async () => {
  await assert.rejects(() => bootstrapEmptyRailwaySchema(bootstrap), /confirmation|Bootstrap target does not match/);
});

test('bootstrap subprocess with missing confirmation refuses before a socket connection', () => {
  const result = spawnSync(process.execPath, ['scripts/bootstrap-railway-db.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...env, PATH: process.env.PATH },
    encoding: 'utf8', timeout: 10_000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.notEqual(result.status, 0);
  assert.match(output, /confirmation/);
  assert.doesNotMatch(output, /fake-unit-secret/);
});
