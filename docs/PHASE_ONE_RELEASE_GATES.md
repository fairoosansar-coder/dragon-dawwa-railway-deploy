# Phase-one community-ready release gates — 7 October 2026

Phase one (sections A–H) remains the priority. The source system is feature-complete enough for its private release path; the remaining gates are **operational proof and human acceptance**, not a reason to enable the parked Hadith or podcast phase-two work.

## Release position

**Do not call the current state a community launch.** The private Railway HTTPS application, owner Google sign-in, server-side role gate, logout-all, restricted MySQL, and one encrypted off-host restore have been observed. The remaining gates below must close before one consenting non-owner tester is invited. Public access remains outside scope.

## Gate 1 — prove daily backup failure detection before scheduling

**Current evidence:** one encrypted R2 upload, byte-identical R2 download, and independent target-engine MySQL restore have passed. The sealed worker failure notifier has passed a controlled failure-path test and a following normal encrypted, byte-verified backup. The independent R2 monitor has completed four natural healthy reads without error or alert. Railway production cron is enabled as `15 2 * * *` (**02:15 UTC**). The only remaining Gate 1 proof is the first natural scheduled worker run plus its following monitor check; retention/lifecycle deletion remains off.

**Owner/operator sequence:**

1. In the protected Railway service-variable UI for **only** the private backup worker, add `DD_BACKUP_FAILURE_WEBHOOK` using the current generated Trigger endpoint. Treat the endpoint as an operational secret.
2. Read the worker configuration back to confirm the variable exists without revealing its value. Confirm the normal one-shot entrypoint and `restartPolicyType=NEVER` remain unchanged.
3. Run one tightly controlled non-secret failure test that exits nonzero after the worker has started. Do not use a real database error, alter credentials, or change the application service.
4. Confirm one owner-visible backup-failure notification arrives, with the expected project/service identity and only bounded exit status. Confirm the Trigger execution is recorded.
5. Remove the temporary failure override. Run one normal unscheduled backup and confirm encrypted upload, metadata readback, download hash match and source cleanup.
6. Design and test a **separate freshness/missed-run control** before cron: a process crash webhook cannot prove that a Railway cron was never invoked. Also record storage growth and the 128 MiB ceiling status.
7. Only after steps 1–6 pass, set the already approved `15 2 * * *` UTC schedule, read it back, and inspect the first natural run. Do not configure automated retention/deletion without a separate owner-approved retention decision.

**Stop conditions:** no Trigger execution; unexpected payload/service; missing normal backup after failure-test restoration; a skipped run without an independent freshness signal; encrypted backup over 128 MiB; or any need to reveal a secret to diagnose the path.

## Gate 2 — restore dedicated Quran Foundation access

The authenticated Quran API has a protected production Quran Foundation client and the owner-only live reader check passed with named English/Tamil resources, honest Sinhala-unavailable handling, and user-initiated playback. This is distinct from any Hadith or podcast work. The remaining language/audio evidence is a physical-device and consenting-second-user check under Gate 3, not a reason to broaden access.

## Gate 3 — witnessed second-user and physical-device acceptance

After Gate 1 and Gate 2 pass, the owner selects one different consenting adult with their own Google identity and physical Android Chrome or iOS Safari device. Invite only their exact verified opaque identity with a reader role and an expiry/removal plan. Follow [`SECOND_USER_MOBILE_ACCEPTANCE.md`](SECOND_USER_MOBILE_ACCEPTANCE.md) and the detailed [`SECOND_USER_PHYSICAL_PHONE_TEST_PLAN.md`](SECOND_USER_PHYSICAL_PHONE_TEST_PLAN.md) without recording credentials, private content, Quran verses, microphone recordings or copied cookies in the evidence record.

The witness must prove anonymous/private-route denial, self-only profile and saves, cross-session Quran place, real Quran playback, nonreligious EN/TA/SI WAV playback, logout-all/copy-token denial, immediate role removal, and export/deletion boundaries. Native language and religious review remain human gates, not browser-test assertions.

## Phase-two protection

Keep `PODCAST_RENDER_MODE=disabled`; leave `migrations/pending/009_podcast_foundation.sql` parked; do not add an ElevenLabs key, make an API call, create a podcast bucket, import a Hadith dataset, or schedule a media worker. The requested dataset and storage materials are approval memos only.

## Required evidence pack before the first tester invitation

| Gate | Evidence required | Owner decision |
| --- | --- | --- |
| Backup alert and freshness | One recorded alert execution, one restored normal backup, tested freshness/missed-run control, and no unapproved retention rule | Authorize the daily cron only after evidence is reviewed |
| Quran provider | Protected configuration confirmation and live owner-path playback/failure-retry record | Confirm the dedicated provider account is suitable for the private test |
| Second user and devices | Consent marker, private invitation, device/browser/audio observations, role-removal and deletion results | Decide whether to invite a broader limited cohort; this is **not** public launch approval |
| Human content review | Named qualified reviewer and bounded material reviewed | Separate content release decision; technical pass does not supply religious approval |
