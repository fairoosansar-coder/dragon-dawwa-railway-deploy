#!/usr/bin/env bash
# Future Railway cron/operator wrapper. It creates no R2 bucket, Railway service,
# schedule, database user, schema, public endpoint, or restore operation.
set -euo pipefail
set +x
umask 077

readonly EXPECTED_PROJECT_ID='786918bd-4ce1-4075-b763-93c7c6f729a1'
readonly EXPECTED_ENVIRONMENT_ID='91d899e3-0a5e-4a7f-9bcb-c840f7a22f66'
readonly EXPECTED_DATABASE_URL_PATTERN='^mysql://dd_backup:[^@/?#]+@mysql\.railway\.internal/dragon_dawwa_private_railway$'
readonly BUCKET_PATTERN='^dragon-dawwa-r2-backup-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'

fail() {
  printf 'Railway R2 backup refused: %s\n' "$1" >&2
  exit 2
}

# The scheduled process must never have the Unix root bypass. The database role is
# separately constrained below and will be enforced by the future DB adapter too.
[[ "${EUID}" -ne 0 ]] || fail 'must run as a non-root operating-system user'
[[ "${RAILWAY_PROJECT_ID:-}" == "$EXPECTED_PROJECT_ID" ]] || fail 'wrong Railway project'
[[ "${RAILWAY_ENVIRONMENT_ID:-}" == "$EXPECTED_ENVIRONMENT_ID" ]] || fail 'wrong Railway environment'
[[ "${AUTH_PROVIDER:-}" == 'google-oidc' ]] || fail 'Google OIDC HTTPS application mode required'
[[ "${REVIEW_BIND_HOST:-}" == '0.0.0.0' ]] || fail 'ordinary HTTPS application bind required'
[[ "${REVIEW_DB_TRANSPORT:-}" == 'railway-internal-wireguard' ]] || fail 'private Railway database transport required'
[[ "${REVIEW_DB_ROLE:-}" == 'backup' ]] || fail 'dedicated backup database role required'
[[ "${DATABASE_URL:-}" =~ $EXPECTED_DATABASE_URL_PATTERN ]] || fail 'database target must be the exact private dd_backup schema URL'

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
(( ${#BACKUP_PASSPHRASE} >= 32 )) || fail 'backup passphrase must be at least 32 characters'
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
[[ "${AWS_DEFAULT_REGION:-}" == 'auto' ]] || fail 'AWS_DEFAULT_REGION must be auto for R2'
# Avoid an inherited profile/config/endpoint redirecting the dedicated R2 credentials.
[[ -z "${AWS_PROFILE:-}" && -z "${AWS_DEFAULT_PROFILE:-}" && -z "${AWS_SHARED_CREDENTIALS_FILE:-}" && -z "${AWS_CONFIG_FILE:-}" && -z "${AWS_ENDPOINT_URL:-}" && -z "${AWS_ENDPOINT_URL_S3:-}" && -z "${AWS_SESSION_TOKEN:-}" && -z "${AWS_ROLE_ARN:-}" && -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]] || fail 'AWS profile, token, role, config, or endpoint indirection is not allowed'

r2_account_id=${DD_R2_ACCOUNT_ID:-}
r2_bucket=${DD_R2_BUCKET:-}
r2_endpoint=${DD_R2_ENDPOINT:-}
[[ "$r2_account_id" =~ ^[0-9a-f]{32}$ ]] || fail 'R2 account ID must be exactly 32 lowercase hexadecimal characters'
expected_r2_endpoint="https://${r2_account_id}.r2.cloudflarestorage.com"
# Intentionally narrow: a jurisdiction endpoint requires an explicit reviewed update
# after the provider has prescribed its exact endpoint for the selected account.
[[ "$r2_endpoint" == "$expected_r2_endpoint" ]] || fail 'R2 endpoint must be the exact approved global account endpoint'
[[ "$r2_bucket" =~ $BUCKET_PATTERN && "$r2_bucket" != *--* ]] || fail 'R2 bucket must use the dedicated backup bucket name pattern'

aws_candidate=${DD_AWS_BIN:-aws}
node_candidate=${DD_NODE_BIN:-node}
aws_bin=$(command -v -- "$aws_candidate") || fail 'AWS CLI is unavailable'
node_bin=$(command -v -- "$node_candidate") || fail 'Node.js is unavailable'
for binary in sha256sum mktemp stat date awk wc; do
  command -v -- "$binary" >/dev/null 2>&1 || fail "required tool unavailable: ${binary}"
done

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ -f "$project_dir/scripts/review-backup.mjs" ]] || fail 'encrypted logical backup implementation unavailable'

# The wrapper owns only an ephemeral 0700 root and its 0700 child. No Railway
# volume is required or used; encrypted data is removed after byte verification.
temporary_root=${DD_BACKUP_TMP_ROOT:-/tmp/dragon-dawwa-railway-r2-backup}
[[ "$temporary_root" =~ ^/tmp/dragon-dawwa-railway-r2-backup(-[A-Za-z0-9-]+)?$ ]] || fail 'temporary root must be a dedicated /tmp backup directory'
[[ ! -L "$temporary_root" ]] || fail 'temporary root must not be a symlink'
if [[ ! -e "$temporary_root" ]]; then
  mkdir -p -m 700 -- "$temporary_root" || fail 'could not create temporary root'
fi
[[ -d "$temporary_root" && ! -L "$temporary_root" ]] || fail 'temporary root must be a real directory'
chmod 700 -- "$temporary_root" || fail 'could not protect temporary root'
[[ "$(stat -c '%a:%u' -- "$temporary_root")" == "700:${EUID}" ]] || fail 'temporary root must be 0700 and owned by this non-root user'

working=''
cleanup() {
  local status=$?
  unset BACKUP_PASSPHRASE
  if [[ -n "$working" && -d "$working" && ! -L "$working" ]]; then
    rm -rf -- "$working"
  fi
  return "$status"
}
trap cleanup EXIT
working=$(mktemp -d "$temporary_root/run.XXXXXXXX") || fail 'could not create temporary working directory'
chmod 700 -- "$working" || fail 'could not protect temporary working directory'
[[ "$(stat -c '%a:%u' -- "$working")" == "700:${EUID}" && ! -L "$working" ]] || fail 'temporary working directory protection failed'

snapshot="$working/snapshot.enc"
roundtrip="$working/roundtrip.enc"
# review-backup performs one read-only, repeatable-read logical export, then its
# isolated SQLite rehearsal. It closes its own DB pool; this wrapper performs no DDL.
export BACKUP_PASSPHRASE
"$node_bin" "$project_dir/scripts/review-backup.mjs" backup "$snapshot" >/dev/null
"$node_bin" "$project_dir/scripts/review-backup.mjs" verify "$snapshot" >/dev/null
unset BACKUP_PASSPHRASE
snapshot_bytes=$(stat -c '%s' -- "$snapshot")
[[ "$snapshot_bytes" =~ ^[0-9]+$ && "$snapshot_bytes" -le 134217728 ]] || fail 'encrypted snapshot exceeds the initial 128 MiB off-host pilot limit; investigate immediately before resuming daily backups'

local_digest=$(sha256sum -- "$snapshot" | awk '{print $1}')
[[ "$local_digest" =~ ^[0-9a-f]{64}$ ]] || fail 'could not calculate encrypted snapshot digest'
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
object_key="dragon-dawwa/railway/mysql/${timestamp:0:4}/${timestamp:4:2}/${timestamp:6:2}/${timestamp}-${local_digest:0:16}.enc"

# No bucket-create, ACL, policy, lifecycle, or delete operation is issued here.
"$aws_bin" --endpoint-url "$r2_endpoint" s3api put-object \
  --bucket "$r2_bucket" --key "$object_key" --body "$snapshot" \
  --metadata "sha256=${local_digest}" >/dev/null
remote_digest=$("$aws_bin" --endpoint-url "$r2_endpoint" s3api head-object \
  --bucket "$r2_bucket" --key "$object_key" --query 'Metadata.sha256' --output text)
[[ "$remote_digest" == "$local_digest" ]] || fail 'remote digest metadata mismatch'
"$aws_bin" --endpoint-url "$r2_endpoint" s3api get-object \
  --bucket "$r2_bucket" --key "$object_key" "$roundtrip" >/dev/null
[[ "$(sha256sum -- "$roundtrip" | awk '{print $1}')" == "$local_digest" ]] || fail 'downloaded encrypted object differs from local snapshot'

printf 'PASS encrypted Railway logical snapshot uploaded and byte-verified: key=%s bytes=%s sha256=%s\n' \
  "$object_key" "$(wc -c < "$snapshot")" "$local_digest"
