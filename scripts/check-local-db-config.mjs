import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { databaseConnectionOptions } from '../server/db.mjs';
import { emptySchemaBootstrapConfig, bootstrapEmptyPrivateSchema } from './bootstrap-isolated-db.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateSchema = 'dragon_dawwa_private_unit';
const privateUrl = `mysql://least-privilege:unit-password@localhost/${privateSchema}`;
const localEnvironment = {
  DATABASE_URL: privateUrl,
  AUTH_PROVIDER: 'tailscale-serve',
  REVIEW_BIND_HOST: '127.0.0.1',
  REVIEW_LOCAL_DB_SOCKET: '/run/mysqld/mysqld.sock',
};

test('managed DATABASE_URL retains verified TLS by default', () => {
  const options = databaseConnectionOptions({
    DATABASE_URL: 'mysql://managed-user:unit-password@managed-mysql.example:3307/review_managed',
  });
  assert.equal(options.host, 'managed-mysql.example');
  assert.equal(options.port, 3307);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  assert.ok(!('socketPath' in options));
});

test('all local private guards select only the approved Unix socket and omit TLS', () => {
  const options = databaseConnectionOptions(localEnvironment);
  assert.equal(options.socketPath, '/run/mysqld/mysqld.sock');
  assert.equal(options.database, privateSchema);
  assert.ok(!('host' in options));
  assert.ok(!('port' in options));
  assert.ok(!('ssl' in options));

  const numericLoopback = databaseConnectionOptions({
    ...localEnvironment,
    DATABASE_URL: `mysql://least-privilege:unit-password@127.0.0.1/${privateSchema}`,
  });
  assert.equal(numericLoopback.socketPath, '/run/mysqld/mysqld.sock');
});

test('a tailscale-spoofed configuration cannot direct local mode at a remote host', () => {
  assert.throws(() => databaseConnectionOptions({
    ...localEnvironment,
    DATABASE_URL: 'mysql://least-privilege:unit-password@remote-attacker.example/dragon_dawwa_private_unit',
  }), /Invalid local private database configuration/);
});

test('a localhost URL without every required local guard is rejected', () => {
  assert.throws(() => databaseConnectionOptions({ DATABASE_URL: privateUrl }), /Invalid local private database configuration/);
});

test('an attempted local mode is rejected in Manus Preview', () => {
  assert.throws(() => databaseConnectionOptions({
    ...localEnvironment,
    MANUS_WEBDEV_PROJECT_ID: 'preview-project',
  }), /unavailable in Manus Preview/);
});

test('bootstrap confirmation and expected-schema checks fail before any connection', () => {
  assert.throws(() => emptySchemaBootstrapConfig({
    ...localEnvironment,
    DD_BOOTSTRAP_EMPTY_PRIVATE_DB: 'I_UNDERSTAND_EMPTY_SCHEMA_ONLY',
    REVIEW_EXPECTED_SCHEMA: 'dragon_dawwa_private_other',
  }), /REVIEW_EXPECTED_SCHEMA must independently match/);

  const result = spawnSync(process.execPath, ['scripts/bootstrap-isolated-db.mjs'], {
    cwd: root,
    env: { ...localEnvironment, PATH: process.env.PATH },
    encoding: 'utf8',
    timeout: 10_000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.notEqual(result.status, 0);
  assert.match(output, /DD_BOOTSTRAP_EMPTY_PRIVATE_DB/);
  assert.doesNotMatch(output, /unit-password/);
});

test('a programmatic bootstrap cannot validate an alternate env and then connect via process.env', async () => {
  await assert.rejects(() => bootstrapEmptyPrivateSchema({
    ...localEnvironment,
    DD_BOOTSTRAP_EMPTY_PRIVATE_DB: 'I_UNDERSTAND_EMPTY_SCHEMA_ONLY',
    REVIEW_EXPECTED_SCHEMA: privateSchema,
  }), /DD_BOOTSTRAP_EMPTY_PRIVATE_DB|Bootstrap target does not match/);
});

test('the committed migration inventory remains the required seven ordered steps', async () => {
  const migrations = (await readdir(path.join(root, 'migrations')))
    .filter(name => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name))
    .sort();
  assert.deepEqual(migrations, [
    '001_core.sql',
    '002_community.sql',
    '003_members.sql',
    '004_member_integrity.sql',
    '005_sessions.sql',
    '006_manage.sql',
    '007_study.sql',
  ]);
});
