import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=mkdtempSync(path.join(tmpdir(),'dd-backup-local-'));
const f=name=>path.join(tmp,name);
try {
  mkdirSync(f('runtime')); mkdirSync(f('remote'));
  writeFileSync(f('passphrase'),'local-only-test-passphrase-must-not-be-reused-outside-this-script-12345\n',{mode:0o600});
  writeFileSync(f('aws-credentials'),'[default]\naws_access_key_id = DUMMY_LOCAL_ONLY\naws_secret_access_key = DUMMY_LOCAL_ONLY\n',{mode:0o600});
  writeFileSync(f('node-mock'),`#!/usr/bin/env bash\nset -eu\ncase "$2" in\n  backup) printf 'DDRB1-local-test-only' > "$3" ;;\n  verify) grep -q '^DDRB1-local-test-only' "$3" ;;\n  *) exit 2 ;;\nesac\n`);
  writeFileSync(f('aws-mock'),`#!/usr/bin/env bash\nset -eu\n[ "$1" = '--endpoint-url' ] && shift 2\n[ "$1" = 's3api' ] && shift\nverb="$1"; shift\nkey=''; body=''; metadata=''; output=''\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    --bucket|--query) shift 2;;\n    --key) key="$2";shift 2;;\n    --body) body="$2";shift 2;;\n    --metadata) metadata="$2";shift 2;;\n    --output) shift 2;;\n    *) output="$1";shift;;\n  esac\ndone\nfile="4DD_TEST_REMOTE/4{key//\\//_}"\ncase "$verb" in\n  put-object) cp "$body" "$file"; printf '%s' "$metadata" > "$file.meta" ;;\n  head-object) if [ "4DD_TEST_MISMATCH" = 1 ]; then printf 'wrong'; else cut -d= -f2 "$file.meta"; fi ;;\n  get-object) cp "$file" "$output" ;;\n  *) exit 2;;\nesac\n` .replaceAll('\u00024','$'));
  chmodSync(f('node-mock'),0o700); chmodSync(f('aws-mock'),0o700);
  const env={...process.env,DATABASE_URL:'mysql://local-only-do-not-connect',DD_BACKUP_PASSPHRASE_FILE:f('passphrase'),DD_S3_BUCKET:'dragon-dawwa-test-local',DD_S3_ENDPOINT:'https://nbg1.your-objectstorage.com',AWS_SHARED_CREDENTIALS_FILE:f('aws-credentials'),DD_BACKUP_TMP_ROOT:f('runtime'),DD_AWS_BIN:f('aws-mock'),DD_NODE_BIN:f('node-mock'),DD_TEST_REMOTE:f('remote'),DD_TEST_MISMATCH:'0'};
  const script=path.join(import.meta.dirname,'offhost-backup.sh');
  const run=(vars={})=>spawnSync('bash',[script],{env:{...env,...vars},encoding:'utf8',timeout:15000});
  const good=run(); assert.equal(good.status,0,good.stderr); assert.match(good.stdout,/PASS encrypted private snapshot uploaded and byte-verified/);
  const uploaded=readdirSync(f('remote')).filter(name=>name.endsWith('.enc'));
  assert.equal(uploaded.length,1);
  assert.match(readFileSync(path.join(f('remote'),uploaded[0]),'utf8'),/^DDRB1-local-test-only/);
  const bad=run({DD_TEST_MISMATCH:'1'}); assert.notEqual(bad.status,0); assert.match(bad.stderr,/remote metadata mismatch/);
  const wrong=run({DD_S3_ENDPOINT:'https://other.example.test'}); assert.notEqual(wrong.status,0); assert.match(wrong.stderr,/expected the approved Nuremberg/);
  console.log('PASS local mocked S3 backup upload/download and fail-closed mismatch/endpoint; no credentials or remote database used');
} finally {rmSync(tmp,{recursive:true,force:true});}
