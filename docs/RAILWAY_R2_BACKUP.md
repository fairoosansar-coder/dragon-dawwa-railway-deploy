# Railway → Cloudflare R2 encrypted backup — preparation only

**Status: source preparation only. It is not scheduled or deployed.** No Cloudflare account has been selected for this backup, no R2 bucket or credential has been created, and no Railway backup service, cron job, upload, restore drill, retention policy, budget alert, or delivery alert has been configured. This document does not authorize creating any of them.

[`../deploy/railway/railway-r2-backup.sh`](../deploy/railway/railway-r2-backup.sh) is a future **operator/Railway-cron wrapper**, not an app entrypoint. It delegates the logical snapshot and local rehearsal to [`review-backup.mjs`](../scripts/review-backup.mjs). The wrapper creates no cloud resource, changes no bucket policy/ACL/lifecycle, performs no DDL, never opens a public database address, and does not restore into MySQL.

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

## Current integration status and remaining database gate

The current source-level Railway adapter recognizes the target role and binding contract:

```text
REVIEW_DB_ROLE=backup
dd_backup@mysql.railway.internal/dragon_dawwa_private_railway
AUTH_PROVIDER=google-oidc
REVIEW_BIND_HOST=0.0.0.0
REVIEW_DB_TRANSPORT=railway-internal-wireguard
```

This is **not** proof of a live connection or a valid least-privilege grant: no Railway MySQL service, schema, `dd_backup` user, or password exists yet, and no connection has been attempted. Before real use, the owner must confirm that the adapter continues to preserve the app/migrator safety boundaries, rejects root/default MySQL URLs, prevents DDL for `dd_backup`, and uses a `dd_backup` credential with only the required read access. This preparation does not provision or populate any of those resources.

## Owner approvals and future provisioning sequence

Before an operator runs this wrapper against a real service, the owner must explicitly:

1. Select the Cloudflare account, approve the independent storage budget, retention period, purge owner, and the region/jurisdiction decision.
2. Create one **private, dedicated** R2 bucket matching the wrapper pattern. Do not attach a public R2.dev address or public/custom domain, and do not share it with web assets. Verify its privacy in the Cloudflare control plane; the S3 API wrapper cannot prove that a bucket has no public route.
3. Create a dedicated least-privilege R2 credential restricted to that one bucket and a separate strong backup passphrase. Put both only in Railway’s protected variable store. Do not place values in source, chat, a command line, image layer, or a checked-in environment file.
4. Provision the private Railway MySQL service and the isolated `dd_backup` user only after the database adapter accepts the backup role. The backup user must not be root, must not have DDL/DML grants, and must not be reused by the app or migrator.
5. Review and build the dormant `deploy/railway/Dockerfile.backup` as a non-root Railway cron image with Node 22, the project dependencies and AWS CLI. It has not been built or deployed; no service volume or port is needed for the wrapper.
6. Add a real failure alert and a separate retention/purge control. Neither exists today.
7. Perform and record an isolated **MySQL 8** restore drill using a disposable database, including schema/row/constraint checks and an authorized read/write recovery check. The SQLite rehearsal is useful early validation only; it is not evidence that a MySQL 8 restore works.

Only after those steps and an approved test upload/download should a schedule be enabled. There is presently **no real upload, restore, alert, or scheduled execution**.

## Source-only mock test

Run the deterministic, offline test from the repository root:

```bash
node scripts/check-railway-r2-backup.mjs
```

It supplies fake Node and AWS executables through `DD_NODE_BIN` and `DD_AWS_BIN`, writes only to a temporary directory, and makes no network calls. It verifies that the wrapper invokes backup then its local-rehearsal command before metadata upload, followed by metadata check and download; the fake does **not** execute the real SQLite rehearsal. It also verifies byte-comparison failure cleanup and that the wrong Railway project, R2 endpoint, database user, or root OS execution reaches neither snapshot nor AWS operations.
