# Live backup-alert test evidence — 7 October 2026

> **Scope:** Controlled proof of the private Railway backup worker's failure notifier. This record contains no webhook URL, credential, database URL, passphrase, or raw log payload.

## Live result

| Check | Result | Evidence source |
|---|---|---|
| Failure Trigger configuration | Enabled, synchronized, and ready before the test | Manus Trigger `RMpXPdAy9PR97gc5WnYbkk` |
| Initial execution count | 0 | Manus Trigger execution history |
| Controlled failure method | Temporary `DD_BACKUP_TMP_ROOT=/tmp` on the **backup worker only** | Railway production variable UI |
| Safety boundary | The wrapper rejects that temporary root before `review-backup.mjs`, upload, metadata read, or R2 download can run | `deploy/railway/railway-r2-backup.sh`, lines 94–117 |
| Trigger receipt | One execution delivered successfully, with the intended project and worker identity and bounded exit status `2` | Manus Trigger execution `FUiiuPjDKmUFmLPxHEv5FW` at 2026-10-07T19:13:48Z |
| Temporary override | Removed immediately after receipt | Railway production variable UI |
| Alert endpoint | Retained only as sealed `DD_BACKUP_FAILURE_WEBHOOK` on the private backup worker | Railway production variable UI |
| Restored normal run | Completed; encrypted logical snapshot uploaded and byte-verified | Railway deployment `66458a55-903f-4209-9268-1d51e3c17a59` |
| Restored snapshot | 1,726-byte encrypted object, verified at 2026-10-07 19:16 UTC | Railway deployment runtime log |

## Explicit boundaries preserved

- The main `dragondawwa.org` application service was not changed.
- No database credential, R2 credential, passphrase, or webhook value was exposed.
- No migration, cron schedule, retention policy, public endpoint, podcast operation, or Quran configuration changed.
- The worker remains a one-shot private service; the normal run completed after the temporary override was removed.

## Remaining Gate 1 work

**Freshness / missed-run detection is not yet configured.** The Trigger catalog exposes no Railway event capable of detecting a cron that never starts. The required next control is an independent, read-only monitor of the newest private R2 backup object, with a defined stale threshold and owner-visible alert. Daily Railway cron must remain disabled until that monitor has been approved, created, and tested.

## Sources

- Railway worker: `https://railway.com/project/786918bd-4ce1-4075-b763-93c7c6f729a1/service/fa68458e-15f8-4338-935b-70fe94b95748`
- Manus Trigger resource: `manus-resource://manus-triggers/trigger/RMpXPdAy9PR97gc5WnYbkk`
- Source wrapper: `deploy/railway/railway-r2-backup.sh`
- Source notifier: `deploy/railway/notify-backup-failure.mjs`


## Freshness-monitor follow-up

At 2026-10-07T19:35Z, the approved 30-minute **Dragon Dawwa R2 backup freshness** monitor was created and is ready. Its read-only dry run completed in 11.2 seconds without firing because the newest encrypted snapshot was current and structurally valid. It watches only the current and previous UTC backup prefixes, reads only object metadata, alerts after 26 hours (or on missing/invalid/unreadable metadata), and deduplicates unchanged alert states.

The user accepted an operationally read-only exception: the scheduled script uses the existing managed Cloudflare connector for two `GET List Objects` calls, because the runtime cannot safely store a new S3/SigV4 Object Read-only key. It does not perform R2 writes, deletes, downloads, or publication. The daily Railway cron remains disabled pending one observed natural monitor execution and a separate owner decision.

See [backup freshness monitor](./BACKUP_FRESHNESS_MONITOR.md) for the exact control boundary.
