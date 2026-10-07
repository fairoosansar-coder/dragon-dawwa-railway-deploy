# Dragon Dawwa R2 backup freshness monitor

**Status:** enabled on 7 October 2026; four pre-backup natural scheduled reads have completed silently without an error. Railway's daily backup cron is now enabled at `02:15 UTC`; the first post-backup monitor execution remains pending.

> The monitor is an independent **Manus scheduled script**. It does not run the Railway worker, query MySQL, alter R2, deploy code, or enable the daily backup cron.

## Live configuration

| Control | Configured value |
|---|---|
| Canonical Trigger | [Dragon Dawwa R2 backup freshness](manus-resource://manus-triggers/trigger/ReKrLPXPuFSdVikFjguVvw) |
| Cadence | Every 30 minutes |
| Storage scope | The two UTC date prefixes that can contain the newest `dragon-dawwa/railway/mysql/` backup object |
| R2 operation | Cloudflare R2 `GET List Objects` only; up to 100 metadata rows per day prefix |
| Freshness threshold | Newest valid object must be no older than **26 hours** |
| Healthy baseline | Silent — no recurring success messages |
| Alert conditions | Missing snapshot, stale snapshot, invalid metadata/size/hash, or failed R2 read |
| Recovery | One owner-visible recovery event after an alert state clears |
| Alert deduplication | One alert per unchanged condition signature |
| Daily Railway cron | **Enabled:** `15 2 * * *` / 02:15 UTC; first natural-run evidence pending |

## Validation performed

1. The existing Cloudflare connector was confirmed to be authorized for exactly one account and to list the private backup bucket's metadata through the R2 REST API.
2. The monitor was created with only the existing Cloudflare connector and a 30-minute interval; it is **enabled**, **ready**, and **synchronized**.
3. A real read-only script dry run completed in 11.2 seconds and returned `fired: false`, the expected outcome for the current fresh and valid encrypted snapshot.
4. The dry run did not upload, download, alter, delete, reveal, or publish backup contents.

The stale/missing/invalid branches are deliberately not injected into production storage: the worker alert test already used the safe pre-export failure route, and this monitor's dry run does not create test R2 objects. They remain deterministic branches of the saved monitor code and will create a bounded owner alert if encountered naturally.

## Credential boundary — accepted operational exception

The monitor uses the existing managed Cloudflare connector because Manus scheduled scripts have no per-script secret store and cannot safely hold a separate S3/SigV4 Object Read-only key. Cloudflare bucket-scoped Object Read-only keys cannot call the R2 REST list endpoint used by the managed connector.

This is **operationally read-only**, not cryptographic bucket-level credential isolation:

- the monitor code can issue only two bounded `GET List Objects` requests;
- it contains no credential, webhook value, object key, digest, or backup content in its payload;
- it does not call any R2 write/delete/download endpoint; and
- the user explicitly accepted this boundary on 7 October 2026.

If stricter credential isolation becomes mandatory, replace this monitor with a separately reviewed monitoring architecture before enabling the daily cron.

## Remaining Gate 1 decision

Observe at least one natural scheduled execution without error, then obtain an explicit owner decision before configuring Railway's daily `02:15 UTC` cron. The failure notifier and freshness monitor do not authorize retention deletion, migration execution, podcast activation, or public media delivery.


## First natural execution

The monitor's first natural scheduled execution started at **2026-10-07T20:00:04Z** and completed at **20:00:18Z**. It had no failed stage, error code, or error message; `not_pass` means it returned no alert payload, which is the intended silent result for a fresh valid snapshot. This passed the owner-defined prerequisite for enabling the Railway daily cron.

The next use of this monitor as evidence is the scheduled check after the first daily `02:15 UTC` backup run. It must stay silent while the scheduled-worker log and R2 metadata independently demonstrate a new byte-verified encrypted snapshot.
