# Dragon Dawwa — first natural Railway backup verification

**Verified:** 8 October 2026
**Scope:** Read-only evidence review after the production backup worker's first scheduled `15 2 * * *` UTC execution.
**Configuration changes:** None. This verification did not change the Railway cron, retention, lifecycle, R2 objects, backup-worker variables, migrations, or podcast flags.

## Result: PASS — Gate 1 backup control is proven

| Independent check | Evidence | Result |
| --- | --- | --- |
| Railway scheduled worker | Railway reports the `dragon-dawwa-r2-backup` service's last scheduled run as succeeded. The execution started at `2026-10-08T02:18:59.958Z` and completed at `2026-10-08T02:19:14.946Z`; Railway dispatch occurred shortly after the configured 02:15 UTC schedule. | Pass |
| Railway runtime log | At `2026-10-08T02:19:13.518614582Z`, the worker emitted its explicit success message: **encrypted Railway logical snapshot uploaded and byte-verified**. Object key and digest are intentionally not copied into this record. | Pass |
| Independent private R2 metadata | A Cloudflare connector `GET` list found one newest 8 October snapshot. Its `last_modified` was `2026-10-08T02:19:07.585Z`, after the scheduled run; size was positive; custom `sha256` metadata matched the 64-hex-character SHA-256 form; storage class was Standard. | Pass |
| Post-run freshness monitor | The 30-minute monitor ran at `2026-10-08T02:30:01.871Z`, completed at `2026-10-08T02:30:16.745Z`, had no failed stage/error code/error message, matched no alert condition, and emitted no payload. | Pass |

## Non-blocking log note

Railway labels two Node.js `SQLite is an experimental feature` runtime warnings with an `error` severity during startup. They are warnings from the Node runtime, not backup-worker failures: the same execution completed normally and logged the explicit upload/byte-verification pass above. Track them during the next code-maintenance cycle; do not treat them as evidence of a failed backup.

## Control state after verification

- The Railway schedule remains **`15 2 * * *` UTC**.
- Retention and R2 lifecycle deletion remain off; neither was modified.
- The backup bucket remains private and was inspected only through existing authenticated metadata access.
- `008_hadith.sql` and `009_podcast_foundation.sql` remain parked; no podcast flag or provider spend control changed.

## Phase-one consequence

The daily encrypted-backup gate is now accepted. The remaining Phase 1 gate is the **one consenting second-user physical-phone acceptance**, using the existing bounded procedure. It authorizes neither a broader cohort nor a public launch.
