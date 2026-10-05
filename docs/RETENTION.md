# Community submission retention and deletion

**Status: review-build operating policy.** This document applies to the `community_submissions` and `community_submission_audits` records introduced by migration `002_community.sql`, and the invited-member records from additive `003_members.sql`. It does not authorize collection of real outside-community submissions until the owner has reviewed access, backup, and deletion procedures.

## What is collected

The public intake endpoints deliberately accept a small, fixed set of fields:

| Record | Required data | Optional data | Not collected by this module |
|---|---|---|---|
| Participation | purpose (`interest`, `volunteer`, or `inquiry`); contact preference | bounded details; email or phone only when that preference is selected and the visitor explicitly consents | name, account, address, cookies for identity, group membership, message-delivery status |
| Correction | correction purpose; bounded correction details; contact preference | email or phone only with explicit contact consent | source request body, identity headers, automatic directory edits, message-delivery status |

A contact preference of `none` stores no contact value and cannot carry a contact-consent flag. The public success response is **`stored_for_review`**. It means only that a database record was stored; it does **not** mean that anyone was contacted, a correction was accepted, or a visitor was enrolled in a group. The module has no outbound email, messaging, or enrollment integration.

## Access and handling

- Only the verified **owner** actor may use `GET /api/admin/submissions` or delete a submission. Publishers and reviewers cannot access submissions.
- Event staff access is separate: verified owner, publisher, and reviewer actors may read event administration; only owner and publisher actors may change events.
- The API returns `Cache-Control: no-store`; implementation errors are generic and the handler deliberately does not log payloads, contact data, identity values, or database errors.
- Intake requires a same-origin POST, JSON size and field bounds, a blank honeypot, server-side purpose/contact validation, and explicit contact consent whenever email or phone is requested. These controls reduce routine abuse but are not a substitute for network-level rate limiting at the parent server.

## Retention schedule

Until the owner supplies a different approved schedule, use this conservative review-build schedule:

| Data | Maximum active retention | Required disposition |
|---|---:|---|
| Unresolved participation or correction record | 90 days from receipt | Owner reviews and deletes sooner when no follow-up is needed; delete at 90 days if not retained under a separately documented lawful purpose. |
| Resolved record | At resolution, and no later than 90 days from receipt | Owner deletes through the administrative delete route. |
| Deletion tombstone and action audit | 12 months from deletion | Retain only record ID, kind, selected purpose, timestamps, deleting owner ID, and audit metadata; never retain contact text or submission details. |
| Encrypted backups containing active or pre-deletion rows | Until the backup's documented expiry, maximum 30 days | Restrict backup access and expire the backup on schedule. A restore can temporarily reintroduce deleted data, so repeat deletion after a restoration if the source snapshot predates it. |

There is **no automatic purge job in this module**. The owner must operate the 90-day review and backup expiry procedure before accepting real personal data. Any longer retention, legal hold, or change to the above schedule needs a documented owner decision and an updated implementation/operations review.

## Invited-member profile and account deletion

An invited member may choose a display name, a preset avatar, preferred interface language, provider-validated optional translation/reciter, optional city and self-selected mosque or learning place, and optional email/phone contact **only after explicit contact opt-in**. An address, identity document, religious declaration and upstream Manus password are never requested. `GET /api/member/me` exposes a member’s own profile, saved resource IDs and Qur’an position to that same verified account. The owner’s member index returns display name, preferred language, optional city/mosque and created date; it **does not** return contact value, opt-in, saves or reading position. Other members cannot query it. The owner should not treat a self-selected mosque as membership proof or permission to publish a person’s affiliation.

`POST /api/member/delete` requires the exact phrase `DELETE MY ACCOUNT`. In a database transaction it removes that reader’s profile, saved IDs, cross-device Qur’an marker, private study answers, reports and associated WAV assets; it disables their reader invitation and retains a keyed pseudonymous deletion record (`member_deletion_audit`) with date and former role. Existing role/staff audit identifiers remain where necessary. A privileged staff/owner profile cannot self-delete while that role is active; the owner must transfer or change permissions first. **This is app-profile deletion, not deletion of the person’s Manus account or their sign-in provider data.** A pre-deletion encrypted backup can temporarily retain earlier data for its approved expiry; a restore must reapply later deletions. The `dd-note`, `dd-question`, legacy `dd-saved` and local `dd-quran-place` on a member’s own browser are separate browser-local data, never silently imported and not erased from all devices by server deletion.

No automatic purge or agreed duration exists for member deletion-audit entries or inactive member profiles. The owner must approve a lawful retention schedule, a recurring deletion/backup operator, and clear review privacy wording **before inviting real outside-community members**. This private QA build has only synthetic test deletions; do not present an unimplemented automated purge as operating.

## What deletion does

`POST /api/admin/submissions/:id/delete` is owner-only and same-origin protected. It atomically:

1. clears `contact_value`, `details`, and the consent timestamp;
2. changes the stored contact preference to `deleted` and records the deletion time and verified owner ID; and
3. records a payload-free `deleted` audit action.

The surviving row is an **audit tombstone**, not a recoverable private submission. The delete action is idempotency-safe in the sense that a second or concurrent deletion is rejected rather than creating a second deletion audit row. Database administrators must not reconstruct clear-text data from application logs; this handler intentionally creates none.

## Backup and restore procedure

Before any database change or hosted cutover:

1. Export an encrypted database backup using the managed database's protected administration path. Do not put exports in source control, browser downloads shared with others, or chat.
2. Record the migration version and backup timestamp, then restore only into an isolated database with restricted owner access.
3. Run `node scripts/review-backup.mjs verify /restricted/snapshot.enc` for the logical SQLite rehearsal, and `node scripts/verify-isolated-sql-restore.mjs /restricted/snapshot.enc` against a **separate disposable local Unix-socket MariaDB** with restricted access. The full seven-migration review snapshot has **30 tables**; compare all row counts, foreign keys and a rolled-back application write without printing personal payloads. This MySQL-compatible local drill is **not** a managed-MySQL clone, off-host backup or authorization for a live restore. Run `node scripts/check-community.mjs` for source regressions as a separate check.
4. Test owner-only list and deletion behavior with marked non-personal fixtures. Delete fixtures after the test.
5. A schema rollback is not a blind `DROP`: stop the new routes, restore the compatible isolated backup if needed, and preserve additive migration/audit evidence. Coordinate any production rollback with the database operator.

## Owner review checklist

- Confirm the owner-role mapping is verified on every request by the parent server.
- Confirm parent-server request-body limits and rate limits are active before real intake is enabled.
- Confirm encrypted backup storage, access list, and 30-day backup expiry.
- Calendar the 90-day owner review; keep evidence without copying private payloads.
- Keep the public wording accurate: records are stored for review, and no communication, invitation, endorsement, speaker verification, or correction outcome is promised.

## Study answers, audio jobs and operator approval boundary

`study_responses` stores the displayed source-backed explanation and citations for the verified member, including responses for which **Save history** was not checked. That choice controls *listing in personal history*, not immediate erasure: a private saved response remains needed to serve its cited evidence, a later user-triggered Listen and its `study_audio_assets` WAV. The model provider receives the requested question and source packet without the member ID. Only the owner can see aggregate usage and a reporter-supplied reason/details in a restricted queue; the management index does not expose another member's original question, generated answer, narration or saves. The member can delete their profile/answer/audio, subject to expiring encrypted backups and the retained payload-free audit.

The current release does **not** impose an automatic expiry on unlisted study answers, completed speech jobs, expired session-revocation rows, unused media or dormant profiles. Staff can run a **count-only intake retention dry run**; its configurable number of days does not authorize deletion. The proposed 90-day active intake, 12-month tombstone and 30-day backup periods above are owner-review targets rather than an active, assured schedule. Before inviting outside users, the owner must approve realistic lawful periods for all of these categories, an operator or protected callback schedule, an encrypted **off-host** backup location and key custodian, and a deletion/reconciliation process for records restored from old backups. Do not activate a purge, webhook or paid job on the basis of this document alone.
