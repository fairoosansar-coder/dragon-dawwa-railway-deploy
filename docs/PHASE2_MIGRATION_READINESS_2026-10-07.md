# Dragon Dawwa — Phase 2 migration readiness review

**Review time:** 2026-10-07T21:44Z
**Decision:** **prepare only; do not apply either migration yet.**

## Current operational prerequisite status

| Control | Verified state | Effect on migrations |
|---|---|---|
| Railway daily backup cron | Enabled at `15 2 * * *` / 02:15 UTC; the first natural 8 October run was explicitly uploaded and byte-verified | Backup control has passed; a fresh verified encrypted snapshot is still required immediately before each DDL event |
| Latest independent freshness evidence | The post-run monitor execution was healthy and silent; retain the first-run evidence record | Confirm the newest monitor run has no unresolved alert before opening a migration window |
| Second-user physical-phone gate | Test plan prepared; no consenting tester has been invited | Phase 1 remains incomplete |
| `008_hadith.sql` / `009_podcast_foundation.sql` | Both remain under `migrations/pending/` and outside the executable migration inventory | No live schema change has occurred |

> The first natural daily backup was independently accepted on 8 October. Do not treat that accepted evidence as a substitute for the fresh encrypted snapshot and isolated verification required immediately before each future DDL event.

## 1. `008_hadith.sql` — reviewer-authored report foundation

### What it correctly creates

| Object | Purpose | Readiness finding |
|---|---|---|
| `hadith_reviewer_attestations` | Owner-granted/revocable qualified-reviewer status with a stated basis and historical grant/revocation metadata | Supports the human approval boundary without importing any corpus |
| `hadith_reports` | Content-immutable report revisions with logical report key, revision number, digest, approval/withdrawal fields, and attestation snapshot | Correctly models a reviewable revision rather than mutable research notes |
| `hadith_claims` | Immutable, ordered claims with book/reference, edition, checked wording, named grader, grading reference, entering staff ID, and report foreign key | Supplies the source-claim IDs required by the future audio script |

### Integrity and operating notes

- `content_digest`, revision uniqueness, report/claim foreign keys, and `ON DELETE RESTRICT` prevent accidental removal of source material that later claims or episodes depend on.
- The migration itself does **not** import a Hadith dataset, create a provider secret, or create a public route. That matches the Phase 2a human-authored scope.
- Database columns intentionally use flexible status strings. The application service, not the schema alone, must enforce state transitions, reviewer attestation, the content-immutable rule, and audit events. The Phase 2a regression suite is the acceptance control for that behavior.
- The application must continue preventing a privileged owner from self-approving a report; an active qualified reviewer attestation is the approval requirement.

## 2. `009_podcast_foundation.sql` — private audio metadata foundation

### What it correctly creates

| Object group | Purpose | Readiness finding |
|---|---|---|
| `podcast_voices`, `podcast_assets` | Six-seat voice configuration and approved private asset metadata | Stores opaque private object keys, hashes, approvals, and no audio bytes |
| `podcast_episodes`, `podcast_line_cache`, `podcast_jobs` | Approved script metadata, provider-cache metadata, failure stages, and provider usage records | Prevents duplicate unchanged-line generation and supports per-job audit/cap controls |
| `podcast_usage_daily`, `podcast_runtime_locks` | Global daily credit accounting and one-at-a-time worker protection | Supports the approved 20,000-credit future measurement cap; it does not spend credits itself |
| `podcast_episode_chapters`, `podcast_transcript_lines`, `podcast_transcript_claim_links` | Four chapter metadata, saved line timing, human-recitation marker, and source-claim links | Enables the private synchronized transcript without a public media URL |
| `podcast_member_progress` | Per-member resume position | Provides cross-device resume without saving audio in the database |

### Integrity and operating notes

- `009` deliberately has foreign keys to `hadith_reports` and `hadith_claims`; **it cannot run before 008**.
- It has no BLOB audio, no audio URL field, no provider secret, no seed render, and no worker trigger. Final and cached audio are represented only by opaque private-store keys.
- The `podcast_episodes` state machine and the required four chapters are application validations. Before activation, test the UI/API and worker against the migrated database, not only the fixture schema.
- `script_json` and transcript text remain private application data and therefore appear in encrypted database backups; MP3/clip bytes remain outside those backups. Capacity should be watched as reports accumulate, but this is materially different from backing up media files.

## 3. Required migration order and evidence

| Step | Action | Required evidence | Stop condition |
|---|---|---|---|
| 0 | Retain the accepted daily-backup evidence and check current monitor health | 8 October upload/byte-verification, new R2 metadata, healthy post-run monitor, plus a current healthy monitor state | Any unresolved monitor failure or stale/unverified current snapshot |
| 1 | Close the physical second-user gate | Witnessed, consented physical-phone acceptance record | Any anonymous/private-data, revocation, deletion, or playback safety defect |
| 2 | Take a fresh verified encrypted backup immediately before DDL | New snapshot and restore/metadata evidence | No current verified restore point |
| 3 | Move and apply `008_hadith.sql` through the normal operator migration path | Ledger increments from 001–007 to include 008; Phase 2a tests pass against migrated schema | Migration error, schema mismatch, audit/approval failure |
| 4 | Exercise one synthetic nonreligious report lifecycle | Attestation, report/claim creation, qualified approval, approved-adapter return, withdrawal/supersession denial | Any owner self-approval or unapproved revision exposure |
| 5 | Move and apply `009_podcast_foundation.sql` | Ledger includes 009; private-media and transcript-link regression tests pass; backup size remains within policy | Any foreign-key, backup-capacity, private-routing, or feature-flag failure |
| 6 | Keep rendering disabled | `PODCAST_RENDER_MODE=disabled`; no ElevenLabs key/worker release | Any nonzero provider call or public media route |

## 4. Blocking inputs after schema readiness

1. A named qualified Hadith reviewer, stated attestation basis, and Tamil language reviewer.
2. The approved Bukhari 6306 report revision and a **machine-readable final Tamil script with claim IDs**. The repository currently contains no actual episode script.
3. The already-approved dedicated private R2 design must be implemented at the post-009 storage/asset milestone: create the bucket and two scoped credentials before any render, but not as a prerequisite for 008/009.
4. Owner-supplied, privately imported/approved canvas assets and human recitation.
5. An exact script-derived cost estimate and the already-approved one-episode cost-measurement configuration with the 20,000-credit hard ceiling.

## Recommendation

Do not unpark 008 or 009 merely because the source migrations are clean. The fixed first-episode path is: close Phase 1; execute the backed-up `008` then `009` sequence; attest the qualified reviewer and approve the report; create the already-approved private R2 bucket and import/approve the canvas assets plus human recitation; bring the exact script-derived estimate to the owner; then perform one owner-approved capped measurement render. Dataset licence discovery, imports, reference-library schema, and research agents belong only to Phase 2b and do not block Bukhari 6306.
