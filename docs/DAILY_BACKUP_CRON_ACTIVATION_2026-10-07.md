# Dragon Dawwa daily backup cron activation — 7 October 2026

## Authorization and prerequisite

The owner authorized activation only after the independent R2 freshness monitor completed a natural scheduled run. That prerequisite passed at **2026-10-07T20:00:04Z**:

| Check | Result |
|---|---|
| Monitor execution | Completed at `2026-10-07T20:00:18Z` |
| Execution state | `not_pass` — no alert payload was emitted |
| Error state | No failed stage, error code, or error message |
| Meaning | The real R2 metadata read completed and the current encrypted snapshot was healthy; the monitor remained silent as designed |

## Applied Railway configuration

| Item | Value |
|---|---|
| Railway service | `dragon-dawwa-r2-backup` |
| Environment | Production |
| Cron expression | `15 2 * * *` |
| Railway read-back | **At 02:15 (UTC)** |
| Activation deployment | Completed successfully; service returned to **Ready** |
| Retention/lifecycle deletion | **Not enabled or changed** |

The cron means one backup-worker execution each day at **02:15 UTC**. It is not an instruction to rotate credentials, delete snapshots, change the private R2 bucket, or run any database migration.

## First-run verification

A one-time verification is scheduled for **2026-10-08T02:40:00Z**, after the first natural 02:15 run and the following 02:30 freshness check. It must establish all of the following before the daily control is marked fully proven:

1. Railway logs show the scheduled worker uploaded and byte-verified a new encrypted snapshot after 02:15 UTC.
2. Cloudflare R2 metadata independently shows a newer object with positive byte size and a valid SHA-256 metadata value.
3. The freshness monitor's post-run execution contains no error and emits no alert for the healthy snapshot.
4. Retention/lifecycle deletion remains off.

If any check fails, the verification task must report the exact failure and leave the existing schedule, retention, R2 contents, migrations, and feature flags unchanged.
