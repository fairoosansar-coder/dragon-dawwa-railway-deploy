#!/usr/bin/env bash
# Operator-only future VM job. Requires a separately approved private S3 bucket.
# Dry-run/mock tests must not be mistaken for live off-host backup delivery.
set -euo pipefail
umask 077

: "${DD_BACKUP_PASSPHRASE_FILE:?Protected passphrase file required}"
: "${DD_S3_BUCKET:?Private bucket name required}"
: "${DD_S3_ENDPOINT:?S3 endpoint required}"
: "${DATABASE_URL:?Isolated target database URL required}"
aws_bin=${DD_AWS_BIN:-aws}
node_bin=${DD_NODE_BIN:-node}
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

# Refuse arbitrary endpoints or URL credentials: the release design selects one EU bucket.
if [[ "$DD_S3_ENDPOINT" != 'https://nbg1.your-objectstorage.com' ]]; then
  echo 'Backup refused: expected the approved Nuremberg S3 endpoint.' >&2
  exit 2
fi
if [[ ! "$DD_S3_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{2,62}$ ]] ||
   [[ "$DD_S3_BUCKET" == *'..'* ]] ||
   [[ ! -r "$DD_BACKUP_PASSPHRASE_FILE" ]] ||
   [[ -L "$DD_BACKUP_PASSPHRASE_FILE" ]]; then
  echo 'Backup refused: invalid bucket or unreadable protected passphrase file.' >&2
  exit 2
fi
for binary in "$aws_bin" "$node_bin" sha256sum; do
  if ! command -v "$binary" >/dev/null 2>&1; then echo 'Backup refused: required tool missing.' >&2; exit 2; fi
done
if [[ -z "${AWS_SHARED_CREDENTIALS_FILE:-}" ]] || [[ ! -r "$AWS_SHARED_CREDENTIALS_FILE" ]] || [[ -L "$AWS_SHARED_CREDENTIALS_FILE" ]]; then
  echo 'Backup refused: dedicated S3 credential file unavailable.' >&2
  exit 2
fi

working_root=${DD_BACKUP_TMP_ROOT:-/run/dragon-dawwa-backup}
if [[ ! -d "$working_root" ]] || [[ -L "$working_root" ]]; then
  echo 'Backup refused: dedicated private runtime directory missing.' >&2; exit 2
fi
working=$(mktemp -d "$working_root/backup.XXXXXXXX")
trap 'rm -rf -- "$working"' EXIT
export BACKUP_PASSPHRASE
BACKUP_PASSPHRASE=$(<"$DD_BACKUP_PASSPHRASE_FILE")
if (( ${#BACKUP_PASSPHRASE} < 32 )); then echo 'Backup refused: passphrase too short.' >&2; exit 2; fi

snapshot="$working/snapshot.enc"
"$node_bin" "$project_dir/scripts/review-backup.mjs" backup "$snapshot" >/dev/null
"$node_bin" "$project_dir/scripts/review-backup.mjs" verify "$snapshot" >/dev/null
unset BACKUP_PASSPHRASE
local_digest=$(sha256sum "$snapshot" | cut -d' ' -f1)
filename="$(date -u +%Y%m%dT%H%M%SZ)-${local_digest:0:16}.enc"
key="dragon-dawwa/review/mysql/$(date -u +%Y/%m/%d)/$filename"
"$aws_bin" --endpoint-url "$DD_S3_ENDPOINT" s3api put-object \
  --bucket "$DD_S3_BUCKET" --key "$key" --body "$snapshot" \
  --metadata "sha256=$local_digest" >/dev/null
remote_digest=$("$aws_bin" --endpoint-url "$DD_S3_ENDPOINT" s3api head-object \
  --bucket "$DD_S3_BUCKET" --key "$key" --query 'Metadata.sha256' --output text)
if [[ "$remote_digest" != "$local_digest" ]]; then echo 'Backup FAILED: remote metadata mismatch.' >&2; exit 1; fi
"$aws_bin" --endpoint-url "$DD_S3_ENDPOINT" s3api get-object \
  --bucket "$DD_S3_BUCKET" --key "$key" "$working/roundtrip.enc" >/dev/null
if [[ "$(sha256sum "$working/roundtrip.enc" | cut -d' ' -f1)" != "$local_digest" ]]; then
  echo 'Backup FAILED: remotely downloaded object differs from encrypted export.' >&2; exit 1
fi
printf 'PASS encrypted private snapshot uploaded and byte-verified: key=%s bytes=%s sha256=%s\n' \
  "$key" "$(wc -c < "$snapshot")" "$local_digest"
