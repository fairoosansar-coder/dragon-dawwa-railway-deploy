# Dragon Dawwa — Phase 2 execution and second-user acceptance runbook

**Status:** planning and control document only. No migration, flag change, provider call, R2 change, or deployment is authorized by this document.

> **Authoritative sequence:** close Phase 1 → backed-up `008_hadith.sql` → evidence → backed-up `009_podcast_foundation.sql` → qualified human review and approved report → approved private R2 assets/recitation → exact script count → owner-approved capped measurement render.

## 1. Current control position

| Control | Current position | Effect |
|---|---|---|
| Daily Railway backup | The first natural `02:15 UTC` run was recorded as uploaded and byte-verified; the subsequent monitor check was healthy and silent. | Backup prerequisite has passed, but take a new verified encrypted snapshot immediately before each DDL event. |
| R2 freshness monitor | Enabled as an independent read-only control. | Confirm the most recent run is healthy and has no unresolved alert before starting a migration window. |
| Second-user physical-phone acceptance | Protocol is ready but no independent consenting tester has been invited. | **Phase 1 remains open; do not start 008 or 009.** |
| `008_hadith.sql` / `009_podcast_foundation.sql` | Both are under `migrations/pending/` and excluded from normal migration discovery. | No Phase 2 table exists in production from these files. |
| Runtime controls | `HADITH_PHASE2A_ENABLED=false`, `PODCAST_RENDER_MODE=disabled`, cost and production approvals false. | No reviewer-report API use, podcast render, provider spend, worker, or public media route is active. |

## 2. Required authorizations

The owner should authorize the following as **separate decisions**. A migration approval does not authorize later provider spend or production publication.

1. Close the witnessed second-user physical-phone gate and accept its evidence.
2. Approve a tightly scoped `008_hadith.sql` database change window.
3. After 008 evidence is accepted, approve a separately scoped `009_podcast_foundation.sql` database change window.
4. After 008, separately authorize enabling Phase 2a reviewer-report workflow only when a qualified reviewer is ready. This has no provider spend.
5. After 009, separately authorize creation of the already-approved private R2 bucket and import of owner-supplied assets/recitation.
6. After a final approved Tamil script is available, review the exact character-based estimate and explicitly authorize one named capped `cost_measurement` render.

## 3. Non-negotiable migration rules

- Never run DDL from normal web-server startup, a web request, a backup worker, or the app database role.
- Never move a pending migration into `migrations/` on `main` before its database DDL succeeds. The deployed app verifies that all top-level migrations are in the ledger at startup; publishing source first can create a startup/schema mismatch.
- Use a short-lived non-deploy operator branch/checkout containing only the staged migration being applied. Publish to `main` only after the DDL and evidence succeed.
- Use the dedicated migrator database identity only. The web app stays on the non-DDL `dd_app` identity.
- Do not use an existing scheduled backup as the sole restore point. Make and verify a fresh encrypted snapshot immediately before **each** DDL event.
- MySQL DDL can auto-commit. There is no automatic down migration or safe “undo” button. On an error, stop; do not drop new tables or retry blindly.
- Never expose provider secrets, database URLs, backup passphrases, session cookies, R2 object keys, digests, report text, or human recitation in a console transcript or status record.

## 4. Preflight checklist for each migration window

Before either 008 or 009:

1. Confirm the exact target is Dragon Dawwa production `main` and the protected Railway project/environment, not a preview, original site, or another database.
2. Confirm the independent freshness monitor’s newest execution is healthy and no alert remains unresolved.
3. Confirm the most recent full test suite and staged-migration regression suite are green for the exact source SHA.
4. Create a new encrypted backup through the approved backup path.
5. Verify the new snapshot before DDL:
   - Railway worker records encrypted upload and byte verification;
   - private R2 metadata shows a newly created positive-size object with valid checksum metadata;
   - isolated logical restore/verification succeeds;
   - the following freshness-monitor execution is healthy and silent.
6. Freeze unrelated app configuration changes for the window. Do not alter retention/lifecycle, podcast flags, provider settings, or R2 assets.
7. Record only the UTC window, commit SHA, operator role, backup-evidence reference, and a non-sensitive go/no-go decision.

## 5. Exact `008_hadith.sql` procedure

### A. Stage, but do not deploy

1. Start from current `main`; fetch and fast-forward only.
2. Create a short-lived non-deploy operator branch, for example `ops/phase2-008`.
3. Move only this file in that branch:

   ```text
   migrations/pending/008_hadith.sql
   → migrations/008_hadith.sql
   ```

4. Do not change `HADITH_PHASE2A_ENABLED`; it remains `false`.
5. Run the relevant source checks, including `scripts/check-hadith-phase2a.mjs`, public-route checks, and the full project validation suite.

### B. Run the operator-only migrator

Run from a protected operator environment/check-out that contains the moved `008_hadith.sql`, using the Railway **migrator** connection only. The protected environment must supply, without printing values:

```text
DATABASE_URL                 # dd_migrator, exact production schema only
REVIEW_DB_TRANSPORT=railway-internal-wireguard
REVIEW_DB_ROLE=migrator
AUTH_PROVIDER=google-oidc
REVIEW_BIND_HOST=0.0.0.0
RAILWAY_PROJECT_ID           # Railway-injected exact project
RAILWAY_ENVIRONMENT_ID       # Railway-injected exact environment
BACKUP_PASSPHRASE            # protected value, never shell history/chat
```

Then execute the existing operator gate with the **absolute path** to the new encrypted snapshot:

```bash
node scripts/migrate-review.mjs /absolute/private/path/to/verified-snapshot.enc
```

The script itself refuses to continue unless the snapshot is private, the passphrase is present, isolated backup verification passes, the exclusive MySQL lock is acquired, and member ownership constraints are clean.

### C. Required 008 evidence

Accept 008 only if all of the following are true:

- migrator output reports `PASS explicit review migration`;
- `review_migrations` contains `008_hadith.sql` after `001`–`007`;
- exactly these new tables exist: `hadith_reviewer_attestations`, `hadith_reports`, `hadith_claims`;
- report-to-attestation and claim-to-report foreign keys are present;
- normal application role still cannot perform DDL;
- no public route or provider call was added;
- the app health check is clean after deploying the matching source commit.

### D. Publish matching source only after DDL

1. Commit the source move and evidence record on the operator branch.
2. Fast-forward that exact commit to `main`; do not rebase in unrelated changes.
3. Push `main` and wait for Railway deployment.
4. Verify application health, anonymous/private-route denial, and disabled flags.
5. Keep `HADITH_PHASE2A_ENABLED=false` until a qualified reviewer is actually ready and the owner separately authorizes report-workflow activation.

### E. Stop conditions

Stop immediately on backup verification failure, monitor alert, failed lock, schema mismatch, missing ledger row, foreign-key error, app health failure, or any unexpected public/API behavior. Preserve the evidence reference and seek a separate recovery decision; do not delete tables or attempt an improvised rollback.

## 6. Exact `009_podcast_foundation.sql` procedure

Do not begin 009 until 008 is deployed, healthy, documented, and accepted.

1. Repeat the entire preflight checklist, including a **new** verified encrypted snapshot.
2. Create a separate short-lived non-deploy branch, for example `ops/phase2-009`.
3. Move only:

   ```text
   migrations/pending/009_podcast_foundation.sql
   → migrations/009_podcast_foundation.sql
   ```

4. Keep all podcast controls disabled. Do not add an ElevenLabs key, create an R2 object, import assets, schedule a worker, or set a nonzero provider cap.
5. Run the operator-only migrator with the new snapshot, same protected migrator role, and the checkout that now contains both 008 and 009. The ledger skips already-applied 008 and applies only 009.
6. Accept 009 only if:
   - `review_migrations` contains `009_podcast_foundation.sql`;
   - the expected tables exist: `podcast_voices`, `podcast_assets`, `podcast_episodes`, `podcast_line_cache`, `podcast_jobs`, `podcast_usage_daily`, `podcast_runtime_locks`, `podcast_episode_chapters`, `podcast_transcript_lines`, `podcast_transcript_claim_links`, and `podcast_member_progress`;
   - episode/report, transcript/episode, claim-link, and member-progress foreign keys are present;
   - storage metadata contains opaque keys only and no audio BLOB/public URL column exists;
   - `PODCAST_RENDER_MODE=disabled` and all approval/cap flags remain disabled/zero;
   - the private routing and staged-podcast regression tests pass.
7. Commit/push the matching source move to `main` only after the DDL evidence succeeds; then verify health and disabled state after deployment.

## 7. Post-009 path — still no rendering

Applying 009 does **not** authorize a podcast render. The next ordered work is:

1. Attest the qualified Hadith reviewer with a stated basis.
2. Create and approve an immutable Bukhari 6306 report revision and claims.
3. Enter and approve the final Tamil script with claim IDs and Tamil-language review.
4. Create the approved dedicated private R2 bucket; keep it separate from the backup bucket, private, without a public domain, and without lifecycle deletion.
5. Import owner-supplied canvas assets and human recitation; approve each by ear.
6. Count the final script and present the exact estimate to the owner.
7. Only after explicit owner approval, set one named cost-measurement episode with a nonzero cap no higher than 20,000 credits. The worker remains one-at-a-time and report-bound.

## 8. Second-user physical-phone acceptance protocol

### Preconditions before inviting anyone

- Backup evidence is accepted; this is now complete.
- Quran reader owner path works, including named English/Tamil resources, honest Sinhala-unavailable behavior, user-initiated playback, and no autoplay.
- One **different consenting adult** has accepted a short test period.
- The tester has their own physical Android Chrome or iOS Safari device and their own provider identity.
- The owner has a private expiry/removal plan and invites only the exact verified identity as `reader`; never grant a staff role.
- Optional EN/TA/SI WAV fixtures, if used, are nonreligious, rights-cleared, owner-approved, and outside the Quran/podcast pipeline.

### Evidence minimization

Record only UTC window, release SHA/deployment identifier, consent marker, device/OS/browser/audio route, pass/fail per test, owner-witness role/initials, and cleanup result. Do not record identity, password, MFA/OTP, cookie/token, Quran text, saved note, microphone recording, screen capture of private data, or audio recording.

### Witnessed execution steps

| Step | Tester action | Required result | Stop condition |
|---|---|---|---|
| A1 — anonymous boundary | In a private tab, open the approved origin before sign-in; attempt one ordinary private page and one protected API via normal navigation. | Login/legal/readiness only; private page/API/data/staff content denied. | Any private page, asset, data, member content, or staff UI is visible. |
| A2 — exact invited sign-in | Sign in using the pre-invited identity. | Private reader session only; no staff controls and no other member data. | Wrong identity signs in, role is elevated, or a confirmed invitation fails. |
| A3 — self-only data | Create optional My Learning profile and save one reviewed link. | Tester sees their own profile/save only. | Another member’s record appears or profile data changes permissions. |
| B1 — language honesty | Switch to Tamil; inspect named translation; then switch to Sinhala. | Tamil is a matching named Tamil resource; Sinhala remains honestly unavailable. | English is silently labelled Tamil/Sinhala or resource labels are wrong. |
| B2 — cross-device resume | Save Quran place on phone; sign in normally on a second tester-owned browser/device and resume. | Same reader restores the same place; no private notebook text is uploaded. | Different place, cross-account data, or uploaded private notes. |
| B3 — native Quran audio | Start recitation deliberately; pause; change surah/reciter; restart only if desired. | Audible native playback; no autoplay; pause works; prior stream stops on change. | Silence, overlap, pause failure, unsafe autoplay, or AI-recitation attribution. |
| B4 — optional WAV fixture | If owner approved, decode approved nonreligious local WAV samples and use available controls. | Decode without stutter; all controls require user action. | Any decode/control failure, pronunciation concern, or canary expansion requirement. |
| C1 — normal logout-all revocation | Maintain two ordinary tester-owned signed-in sessions. Use logout-all on one, then request a private page normally from the other. | Second active session is denied. | Second session remains usable. |
| C2 — export/deletion | Re-authenticate normally and use intended export/deletion flow. | Tester-only export; active profile/save/history/audio rows are removed, retaining only permitted operational tombstone. | Another person’s data appears or deletion is ambiguous/incomplete. |
| C3 — invitation removal | Owner removes reader role; tester performs one ordinary protected navigation from existing browser. | Immediate denial; no member/staff API accessible. | Revoked identity still receives private response. |

### Pass/fail decision

- **Pass:** all A–C required steps pass; optional B4 either passes or is explicitly deferred without expanding a canary.
- **Hard fail:** any anonymous-boundary, role, isolation, revocation, deletion, or private-data fault. Revoke reader access, stop, create a minimal defect reference, and remediate before repeating.
- **Audio hold:** provider/audio issue or native-language pronunciation concern. Do not call it approved or generate replacement religious audio; obtain human language/religious review.

## 9. Visitor-safe routing boundary

### Public-read enablement matrix

| Configuration | Visitor-safe reading |
|---|---|
| `DD_PUBLIC_READ_MODE=private` | Disabled; all app pages/APIs require a verified role. |
| `DD_PUBLIC_READ_MODE=approved-public-readonly` | Enabled for the exact GET/HEAD allowlist below. |
| No explicit mode, `AUTH_PROVIDER=google-oidc`, and `REVIEW_PUBLIC_ORIGIN=https://dragondawwa.org` | Enabled automatically for the exact GET/HEAD allowlist. |
| Any other host/configuration | Disabled by default. |
| Tailscale mode | Visitor reading is not used; the router requires identity/session handling. |

### What a visitor may read when enabled

Only the explicit visitor pages (home, about, Quran, Quran-study, library/published readings, resources, research, mosque/directory, published events, contact, privacy, terms, sources, accessibility), their listed static assets, and published/read-only content, event, Quran, resource, and mosque APIs.

### What remains private in every mode

- Member profile, saves, resume/history and export/deletion APIs.
- Study questions, history, voice/transcription, generated audio, and report workflows.
- Staff, admin, operations, Hadith reports, podcast production, and all admin APIs.
- Podcasts and individual episodes.
- Every API write: POST/PUT/PATCH/DELETE.
- Unlisted assets and data files.

The router rejects unauthenticated private APIs with `401 sign_in_required` and redirects unauthenticated private pages to login. Non-GET/HEAD requests require same-origin checks; cross-site requests are denied. Visitor traffic receives a signed opaque rate cookie so an untrusted forwarded identity cannot widen a reader quota.

## 10. Operator checklist

Before opening the physical test: obtain the independent tester’s affirmative consent, bounded time window, exact identity through the protected workflow, and optional WAV decision. Do not transmit credentials or identity in chat.

Before either DDL: obtain the explicit migration approval, a fresh verified backup, recent healthy monitor evidence, a frozen change window, a protected migrator environment, and an operator checkout that has not yet deployed the moved migration to `main`.
