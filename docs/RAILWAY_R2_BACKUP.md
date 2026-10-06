# Railway → Cloudflare R2 encrypted backup — recoverable pilot, scheduling gate open

**Status, observed 6 October: first remote recovery proven; unattended operation not yet certified.** The approved private Standard bucket `dragon-dawwa-r2-backup-private` and no-domain Railway backup worker exist. After the owner replaced a matching bucket-scoped R2 S3 key pair solely through Railway's protected UI, one unscheduled real worker deployment (`167d5371-dbb0-464e-a927-e6848c0658c1`) exported the live private MySQL schema, uploaded a **1,726-byte AES-256-GCM object**, read back its metadata and downloaded it byte-for-byte. The object is private in Cloudflare R2 at `dragon-dawwa/railway/mysql/2026/10/06/20261006T123631Z-3fcdc4ad6ae50c2f.enc`, SHA-256 `3fcdc4ad6ae50c2f2cd5f8d87b84b524a46c584d915ad4f6438974dcd358313d`. A **separate operator download from R2** via the private worker matched the same hash and decrypted/restored into disposable **network-isolated pinned MySQL 8.4.11**, verifying seven ledger rows, 30 tables, nine total rows, two checked ownership foreign keys and a rolled-back relational write. The disposable DB, socket and local ciphertext were removed. **Daily cron, dependable owner failure alert, independent missed-run monitor and any automatic retention/deletion remain open.** A controlled no-secret `exit 42` test emitted its marker but Railway's deployment list remained `SUCCESS` for five minutes; the owner's pre-existing Failed/Crashed/OOM **Email & In-App** settings therefore cannot be relied on as a failed-backup alert. Read-back after removing the test override confirmed `cronSchedule=null`, `restartPolicyType=NEVER` and the image entrypoint restored. A second ordinary source redeploy `156d6903-657b-4f6b-9d02-ef4ff8022f22` then logged another real encrypted upload/byte-verified download `PASS`, with no test marker.

[`../deploy/railway/railway-r2-backup.sh`](../deploy/railway/railway-r2-backup.sh) is the worker image's fail-closed **one-shot/possible future Railway-cron entrypoint**, not the HTTPS app entrypoint. It delegates the logical snapshot and local rehearsal to [`review-backup.mjs`](../scripts/review-backup.mjs). The wrapper creates no cloud resource, changes no bucket policy/ACL/lifecycle, performs no DDL, never opens a public database address, and does not restore into MySQL.

## Intended, isolated flow

1. The future cron process runs as a **non-root OS user** with an exact Railway deployment identity.
2. It calls `review-backup.mjs backup`, which takes the existing AES-256-GCM encrypted consistent logical snapshot using `BACKUP_PASSPHRASE` and its read-only repeatable-read transaction.
3. It calls `review-backup.mjs verify`, which performs the existing **SQLite-only** structural and relational rehearsal. This is not a MySQL restoration.
4. It SHA-256 hashes the encrypted bytes, uploads those bytes to a dedicated R2 bucket with `sha256` object metadata, reads that metadata back, downloads the object, and requires a byte-identical SHA-256 digest.
5. It removes its 0700 temporary child directory and unsets the passphrase. `review-backup.mjs` closes its own database pool.

The wrapper refuses snapshots above **128 MiB** before any R2 upload. That is an initial egress/storage exposure brake, **not** database protection: once the encrypted backup exceeds the limit the daily job fails and data would become unrecoverable if nobody responds. A configured job-failure alert and measured growth trend are mandatory before activation; raise the limit only with a tested larger cron memory allocation and revised budget. The wrapper stops on any error. It does **not** delete old backups, make the bucket private, create a bucket, create a user, create a schema, migrate a schema, assign IAM/R2 permissions, create an alert, or configure a schedule.

## Fail-closed target contract

The wrapper accepts only these non-secret selectors:

| Input | Required value / constraint |
| --- | --- |
| `RAILWAY_PROJECT_ID` | `786918bd-4ce1-4075-b763-93c7c6f729a1` |
| `RAILWAY_ENVIRONMENT_ID` | `91d899e3-0a5e-4a7f-9bcb-c840f7a22f66` |
| `AUTH_PROVIDER` | `google-oidc` |
| `REVIEW_BIND_HOST` | `0.0.0.0` for the ordinary HTTPS Railway app architecture |
| `REVIEW_DB_TRANSPORT` | `railway-internal-wireguard` |
| `REVIEW_DB_ROLE` | `backup` only |
| `DATABASE_URL` | Exactly the private internal MySQL target with user `dd_backup`, host `mysql.railway.internal`, and schema `dragon_dawwa_private_railway`; explicit ports, URL options, and fragments are refused. |
| `DD_R2_ACCOUNT_ID` | The selected R2 account identifier, exactly 32 lowercase hexadecimal characters. |
| `DD_R2_ENDPOINT` | Exactly `https://<32-hex-account-id>.r2.cloudflarestorage.com`, formed from `DD_R2_ACCOUNT_ID`. |
| `DD_R2_BUCKET` | A dedicated name matching `dragon-dawwa-r2-backup-…`; general-purpose or shared bucket names are refused. |
| `AWS_DEFAULT_REGION` | `auto` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Dedicated R2 S3-API credentials injected as protected environment variables. |
| `BACKUP_PASSPHRASE` | Protected environment variable with at least 32 characters; it must be independent of the R2 credentials. |
| `DD_BACKUP_TMP_ROOT` | Optional path only under the dedicated `/tmp/dragon-dawwa-railway-r2-backup[-suffix]` namespace. The wrapper creates/checks it as mode `0700`, owned by the invoking non-root user, and gives each run a mode `0700` child. |

The default is intentionally the narrow **global R2 endpoint only**. If the chosen Cloudflare account requires a jurisdiction-specific endpoint, do not substitute an arbitrary endpoint. The operator must obtain the provider-prescribed exact endpoint, have its use reviewed, and update the narrowly constrained endpoint validation and its tests before any deployment.

The wrapper refuses inherited AWS profile/config/endpoint/session/role overrides (`AWS_PROFILE`, `AWS_DEFAULT_PROFILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`, `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_S3`, `AWS_SESSION_TOKEN`, `AWS_ROLE_ARN`, and `AWS_WEB_IDENTITY_TOKEN_FILE`) so the direct dedicated credentials and explicit endpoint are not silently redirected.

## Current integration status

The current source-level Railway adapter recognizes the target role and binding contract:

```text
REVIEW_DB_ROLE=backup
dd_backup@mysql.railway.internal/dragon_dawwa_private_railway
AUTH_PROVIDER=google-oidc
REVIEW_BIND_HOST=0.0.0.0
REVIEW_DB_TRANSPORT=railway-internal-wireguard
```

The Railway MySQL 8.4.11 service, fresh schema and separately credentialed `dd_backup` SELECT-only account exist; its effective grants were tested separately from the DML-only app account. The first real backup passed export, encrypted upload, metadata verification, byte-identical download, and an independently downloaded ciphertext restore into the same MySQL engine. This proves one recovery point only, not recurring freshness or full user/device acceptance. No credential value was placed in chat or source.

## Remaining activation gates — do not re-create existing resources

The account/bucket, isolated database and worker already exist under the approved private scope. Do **not** repeat their creation. Finish these remaining checks in order:

1. **Completed once:** matching protected R2 S3 credentials, unscheduled encrypted export/upload/byte-verified download, one private bucket object and separate R2-derived target-engine MySQL 8.4.11 restore. The object's full digest and target-engine proof are above. Repeat a disposable restore periodically, especially after schema changes; one empty/pilot dataset is not a perpetual guarantee.
2. **Blocking finding:** the no-secret worker deliberately exited 42 and emitted its marker, but the deployment's Railway CLI status stayed `SUCCESS`; do **not** substitute the account's pre-existing Failed/Crashed/OOM Email & In-App choices for a tested backup-failure notification. A narrowly filtered [Dragon Dawwa backup-failure webhook Trigger](manus-resource://manus-triggers/trigger/RMpXPdAy9PR97gc5WnYbkk) has been created for an owner-visible alert on the exact worker's failed process, and the source wrapper now has a separate scrubbed, failure-only notifier. **It is not yet active end-to-end:** the generated endpoint must be entered as a **sealed** `DD_BACKUP_FAILURE_WEBHOOK` variable on only the private Railway backup worker, with no URL/token in source, logs or chat; then a controlled nonzero run must prove receipt and an actual owner-visible Trigger execution. A missed or skipped Railway cron run also produces **no guaranteed crash event**, so add a separate freshness check plus storage growth/byte watch. The 128 MiB ceiling is a fail-stop, not an availability guarantee. An accidental broad custom notification override was removed; default settings were preserved.
3. **Pending:** activate the approved `15 2 * * *` UTC Railway cron **only after** the failure-alert and freshness controls have been assessed and the image entrypoint is confirmed restored; read the schedule back, then inspect the first natural execution. A previous job can silently skip the next Railway cron. Do not claim any scheduled run before it happens.
4. **Separately owner-controlled:** do not turn on a 35-day automatic deletion/lifecycle without an exact retention approval and recovery audit. Preserve the first private ciphertext object in the meantime; monitor actual R2 storage usage and the Railway project budget.

## Source-only mock test

Run the deterministic, offline test from the repository root:

```bash
node scripts/check-railway-r2-backup.mjs
```

It supplies fake Node and AWS executables through `DD_NODE_BIN` and `DD_AWS_BIN`, writes only to a temporary directory, and makes no network calls. It verifies that the wrapper invokes backup then its local-rehearsal command before metadata upload, followed by metadata check and download; the fake does **not** execute the real SQLite rehearsal. It also verifies byte-comparison failure cleanup and that the wrong Railway project, R2 endpoint, database user, or root OS execution reaches neither snapshot nor AWS operations.
