import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const script = 'deploy/railway/start-private.sh';
const env = {
  PATH: process.env.PATH,
  RAILWAY_PROJECT_ID: '786918bd-4ce1-4075-b763-93c7c6f729a1',
  RAILWAY_ENVIRONMENT_ID: '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66',
  AUTH_PROVIDER: 'tailscale-serve',
  REVIEW_BIND_HOST: '127.0.0.1',
  REVIEW_DB_TRANSPORT: 'railway-internal-wireguard',
  REVIEW_DB_ROLE: 'app',
  DATABASE_URL: 'mysql://dd_app:fake-unit-secret@mysql.railway.internal/dragon_dawwa_private_railway',
  REVIEW_PUBLIC_ORIGIN: 'https://dragon-dawwa-private.example.ts.net',
  REVIEW_APP_ID: 'railway-unit',
  REVIEW_SESSION_SECRET: 'only-a-synthetic-placeholder-long-enough',
};
function denied(patch, expected) {
  const result = spawnSync('bash', [script], { cwd: root, env: { ...env, ...patch }, encoding: 'utf8', timeout: 5000 });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.notEqual(result.status, 0);
  assert.match(output, expected);
  assert.doesNotMatch(output, /fake-unit-secret|synthetic-placeholder/);
}

test('Railway startup rejects an unrelated project, public origin and non-loopback listener before starting anything', () => {
  denied({ RAILWAY_PROJECT_ID: 'existing-hobby-project' }, /wrong project/);
  denied({ REVIEW_PUBLIC_ORIGIN: 'https://public.railway.app' }, /exact tailnet HTTPS origin/);
  denied({ REVIEW_BIND_HOST: '0.0.0.0' }, /loopback Serve mode required/);
});

test('Railway startup rejects absent persistent node volume before touching Tailscale or DB', () => {
  denied({}, /persistent dedicated Tailscale state volume required/);
});

test('direct web server startup rejects a migrator database role before any connection', () => {
  const result = spawnSync(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...env,
      REVIEW_DB_ROLE: 'migrator',
      DATABASE_URL: env.DATABASE_URL.replace('dd_app:', 'dd_migrator:'),
    },
    encoding: 'utf8', timeout: 5000,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.notEqual(result.status, 0);
  assert.match(output, /non-DDL app database role/);
  assert.doesNotMatch(output, /fake-unit-secret|synthetic-placeholder/);
});

test('Railway source image is separate, Tailscale-digest-pinned and has no public port declaration', async () => {
  const dockerfile = await readFile(new URL('../deploy/railway/Dockerfile', import.meta.url), 'utf8');
  const startup = await readFile(new URL('../deploy/railway/start-private.sh', import.meta.url), 'utf8');
  assert.match(dockerfile, /^FROM tailscale\/tailscale:v[0-9.]+@sha256:[0-9a-f]{64} AS tailscale$/m);
  assert.doesNotMatch(dockerfile, /^EXPOSE\s+/m);
  assert.match(dockerfile, /CMD \["bash", "deploy\/railway\/start-private\.sh"\]/);
  assert.match(startup, /env -u DATABASE_URL.*-u TS_AUTHKEY/);
  assert.match(startup, /unset TS_AUTHKEY\ngosu node node server\/index\.mjs/);
  const syntax = spawnSync('bash', ['-n', script], { cwd: root, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});
