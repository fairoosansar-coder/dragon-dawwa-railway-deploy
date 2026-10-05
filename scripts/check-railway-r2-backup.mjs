import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = mkdtempSync(path.join(tmpdir(), 'dragon-dawwa-railway-r2-backup-test-'));
const at = name => path.join(temporary, name);
const accountId = '0123456789abcdef0123456789abcdef';
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

try {
  mkdirSync(at('runtime'));
  mkdirSync(at('remote'));
  writeFileSync(at('node-mock'), `#!/usr/bin/env bash
set -euo pipefail
printf 'node:%s\n' "\${2:-unknown}" >> "$DD_TEST_LOG"
[[ "\${RAILWAY_PROJECT_ID}" == '786918bd-4ce1-4075-b763-93c7c6f729a1' ]]
[[ "\${RAILWAY_ENVIRONMENT_ID}" == '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66' ]]
[[ "\${REVIEW_DB_ROLE}" == 'backup' && "\${AUTH_PROVIDER}" == 'google-oidc' ]]
[[ "\${BACKUP_PASSPHRASE}" != '' ]]
case "\${2:-}" in
  backup)
    printf 'DDRB1-mock-encrypted-snapshot' > "$3"
    if [[ "\${DD_TEST_OVERSIZE:-0}" == '1' ]]; then truncate -s 134217729 "$3"; fi ;;
  verify)
    if [[ "\${DD_TEST_OVERSIZE:-0}" == '1' ]]; then [[ -f "$3" ]]; else grep -q '^DDRB1-mock-encrypted-snapshot$' "$3"; fi ;;
  *) exit 2 ;;
esac
`);
  writeFileSync(at('aws-mock'), `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == '--endpoint-url' && "$2" == "$DD_R2_ENDPOINT" ]] || exit 40
shift 2
[[ "$1" == 's3api' ]] || exit 41
shift
operation="$1"
shift
bucket=''
key=''
body=''
metadata=''
destination=''
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --bucket) bucket="$2"; shift 2 ;;
    --key) key="$2"; shift 2 ;;
    --body) body="$2"; shift 2 ;;
    --metadata) metadata="$2"; shift 2 ;;
    --query|--output) shift 2 ;;
    *) destination="$1"; shift ;;
  esac
done
[[ "$bucket" == "$DD_R2_BUCKET" && -n "$key" ]] || exit 42
printf 'aws:%s\n' "$operation" >> "$DD_TEST_LOG"
remote="$DD_TEST_REMOTE/$(printf '%s' "$key" | tr '/' '_')"
case "$operation" in
  put-object) cp "$body" "$remote"; printf '%s' "$metadata" > "$remote.meta" ;;
  head-object) cut -d= -f2 "$remote.meta" ;;
  get-object)
    if [[ "\${DD_TEST_CORRUPT_DOWNLOAD:-0}" == 1 ]]; then printf 'corrupted-mock-object' > "$destination"; else cp "$remote" "$destination"; fi ;;
  *) exit 43 ;;
esac
`);
  chmodSync(at('node-mock'), 0o700);
  chmodSync(at('aws-mock'), 0o700);

  const inherited = { ...process.env };
  for (const name of ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3']) delete inherited[name];
  const env = {
    ...inherited,
    RAILWAY_PROJECT_ID: '786918bd-4ce1-4075-b763-93c7c6f729a1',
    RAILWAY_ENVIRONMENT_ID: '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66',
    AUTH_PROVIDER: 'google-oidc',
    REVIEW_BIND_HOST: '0.0.0.0',
    REVIEW_DB_TRANSPORT: 'railway-internal-wireguard',
    REVIEW_DB_ROLE: 'backup',
    DATABASE_URL: 'mysql://dd_backup:not-a-real-unit-test-password@mysql.railway.internal/dragon_dawwa_private_railway',
    BACKUP_PASSPHRASE: 'not-a-real-unit-test-passphrase-that-is-over-thirty-two-characters',
    AWS_ACCESS_KEY_ID: 'not-a-real-unit-test-access-key',
    AWS_SECRET_ACCESS_KEY: 'not-a-real-unit-test-secret-key',
    AWS_DEFAULT_REGION: 'auto',
    DD_R2_ACCOUNT_ID: accountId,
    DD_R2_ENDPOINT: endpoint,
    DD_R2_BUCKET: 'dragon-dawwa-r2-backup-unit-test',
    DD_BACKUP_TMP_ROOT: temporary,
    DD_AWS_BIN: at('aws-mock'),
    DD_NODE_BIN: at('node-mock'),
    DD_TEST_REMOTE: at('remote'),
    DD_TEST_LOG: at('actions.log'),
    DD_TEST_CORRUPT_DOWNLOAD: '0',
  };
  const wrapper = path.join(import.meta.dirname, '../deploy/railway/railway-r2-backup.sh');
  const snapshotSource = readFileSync(path.join(import.meta.dirname, 'review-backup.mjs'), 'utf8');
  assert.match(snapshotSource, /START TRANSACTION READ ONLY/);
  assert.match(snapshotSource, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
  const run = (patch = {}) => spawnSync('bash', [wrapper], { env: { ...env, ...patch }, encoding: 'utf8', timeout: 15_000 });
  const actions = () => readFileSync(at('actions.log'), 'utf8').trim().split('\n').filter(Boolean);
  const assertNoNewActions = (before, patch, expected) => {
    const result = run(patch);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, expected);
    assert.deepEqual(actions(), before, `unexpected backup or AWS action for ${expected}`);
  };

  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /PASS encrypted Railway logical snapshot uploaded and byte-verified/);
  assert.deepEqual(actions(), ['node:backup', 'node:verify', 'aws:put-object', 'aws:head-object', 'aws:get-object']);
  assert.equal(readdirSync(at('remote')).filter(name => name.endsWith('.enc')).length, 1);
  assert.equal(readdirSync(temporary).filter(name => name.startsWith('run.')).length, 0, 'temporary encrypted files were not removed');

  const beforeRejectedTargets = actions();
  assertNoNewActions(beforeRejectedTargets, { RAILWAY_PROJECT_ID: 'wrong-project' }, /wrong Railway project/);
  assertNoNewActions(beforeRejectedTargets, { DD_R2_ENDPOINT: 'https://wrong.example.invalid' }, /R2 endpoint/);
  assertNoNewActions(beforeRejectedTargets, { DATABASE_URL: env.DATABASE_URL.replace('dd_backup:', 'root:') }, /dd_backup schema URL/);

  const rootCommand = process.getuid() === 0 ? 'bash' : 'sudo';
  const rootArgs = process.getuid() === 0 ? [wrapper] : ['-n', '-u', 'root', '--', 'bash', wrapper];
  const root = spawnSync(rootCommand, rootArgs, { env, encoding: 'utf8', timeout: 15_000 });
  assert.notEqual(root.status, 0, root.stdout + root.stderr);
  assert.match(root.stderr, /non-root operating-system user/);
  assert.deepEqual(actions(), beforeRejectedTargets, 'root attempt reached backup or AWS tooling');

  const corrupt = run({ DD_TEST_CORRUPT_DOWNLOAD: '1' });
  assert.notEqual(corrupt.status, 0, corrupt.stdout + corrupt.stderr);
  assert.match(corrupt.stderr, /downloaded encrypted object differs/);
  assert.equal(readdirSync(temporary).filter(name => name.startsWith('run.')).length, 0, 'temporary files remain after a failed byte comparison');
  const beforeOversize = actions();
  const oversize = run({ DD_TEST_OVERSIZE: '1' });
  assert.notEqual(oversize.status, 0);
  assert.match(oversize.stderr, /128 MiB off-host pilot limit/);
  assert.deepEqual(actions().slice(beforeOversize.length), ['node:backup', 'node:verify'], 'oversized backup reached R2');
  assert.equal(readdirSync(temporary).filter(name => name.startsWith('run.')).length, 0, 'oversized snapshot was not removed');
  console.log('PASS mocked Railway/R2 backup invokes backup then local rehearsal before upload, byte-verifies download, and rejects wrong project/endpoint/root/user before actions; no network used');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
