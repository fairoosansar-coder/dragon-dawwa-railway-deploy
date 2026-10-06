# Railway → Cloudflare R2 encrypted backup — not yet recoverable

**Status, observed 6 October: worker deployed, backup still blocked.** The approved private Standard bucket `dragon-dawwa-r2-backup-private` exists in the selected Cloudflare account, and a bucket-scoped one-year Object Read/Write R2 credential was created. A no-domain, non-root Railway backup worker builds from the source-based `deploy/railway/Dockerfile.backup`. Its most recent deployment reached the wrapper but exited before any upload with `AWS_ACCESS_KEY_ID is required`: the variable is listed as sealed in Railway yet absent/empty at runtime; the separately sealed R2 secret, backup passphrase and private `dd_backup` database URL were present in a names-only diagnostic. **No R2 object upload/download, R2-derived MySQL restore, enabled daily cron, verified failure alert or 35-day lifecycle policy exists.** Read-back confirms `cronSchedule=null`, `restartPolicyType=NEVER`, and the image entrypoint restored. A separate **direct empty-user** logical dump from this Railway MySQL was restored into isolated MySQL 8.4.11 with 30 tables/seven ledger rows; that is not off-host R2 recovery.

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

The Railway MySQL 8.4.11 service, fresh schema and separately credentialed `dd_backup` SELECT-only account now exist; its effective grants were tested separately from the DML-only app account. The backup wrapper has **not reached the DB export** on the latest run: the absent runtime R2 key ID aborts at line 31 first. A real R2 snapshot and downloaded-object restore must prove the complete connection, privilege and recovery chain.

## Remaining activation gates — do not re-create existing resources

The account/bucket, isolated database and worker already exist under the approved private scope. Do **not** repeat their creation. Finish these remaining checks in order:

1. Correct **only** the sealed Railway worker `AWS_ACCESS_KEY_ID` to the Cloudflare R2 access-key ID matching its already stored R2 secret. Never use Railway Generator for this field. If the one-time ID is unavailable, rotate a dedicated credential for this bucket and replace **both** sealed R2 variables in protected Railway UI. Never put their values in chat, source, logs or a shell argument.
2. Trigger **one** worker execution with cron still disabled. Require encrypted logical snapshot upload, R2 metadata and byte-identical download, then verify the dedicated bucket has only the expected private object/prefix.
3. Download that encrypted object and decrypt it only in a controlled environment; restore into disposable network-isolated **MySQL 8.4.11**, check seven migration ledger rows, 30 tables, row/foreign-key integrity and a rolled-back relational write. Remove temporary plaintext and credentials. A direct local dump restore is **not** this test.
4. Configure a real worker-failure notification, growth/byte monitoring and an approved prefix-scoped retention/purge control; a 128 MiB ceiling is a fail-stop, not an availability guarantee. Only **after** a successful remote round-trip and isolated restore enable the approved `15 2 * * *` UTC daily Railway cron and read it back. A previously running job can cause the next Railway cron to skip.

There is presently **no successful real R2 upload, R2-derived restore, verified failure alert or scheduled execution**.

## Source-only mock test

Run the deterministic, offline test from the repository root:

```bash
node scripts/check-railway-r2-backup.mjs
```

It supplies fake Node and AWS executables through `DD_NODE_BIN` and `DD_AWS_BIN`, writes only to a temporary directory, and makes no network calls. It verifies that the wrapper invokes backup then its local-rehearsal command before metadata upload, followed by metadata check and download; the fake does **not** execute the real SQLite rehearsal. It also verifies byte-comparison failure cleanup and that the wrong Railway project, R2 endpoint, database user, or root OS execution reaches neither snapshot nor AWS operations.
