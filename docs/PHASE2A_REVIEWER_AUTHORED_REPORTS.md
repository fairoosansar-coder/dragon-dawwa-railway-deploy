# Phase 2a — reviewer-authored Hadith reports

**State:** staged in source; disabled at runtime; not migrated on Railway.

## What this phase does

Phase 2a is the authorised bridge to a first reviewed episode without importing a Hadith corpus or operating AI research agents. A verified staff member can enter an immutable report revision and one or more checked claims. Each claim requires: claim text, source book, book/number or volume/page reference, edition checked, quoted wording checked by the reviewer, named grader, grading reference and the entering staff identity.

The owner may record a distinct verified `reviewer` account’s stated qualification basis. Only an actively attested reviewer role can approve a draft report. The owner role cannot approve a report through this pathway. Withdrawal preserves the revision and prevents it from being returned by the podcast adapter. Corrections are new immutable revisions, not edits to an approved record.

## Exact podcast boundary

`createHadithReportAdapter({db}).getApprovedRevision({reportRevisionId})` returns only this object for an approved revision with at least one claim:

```js
{
  id,
  status: 'approved',
  claimIds,
  qualifiedReviewerId,
  approvedAt,
}
```

A draft, withdrawn, superseded, absent or malformed revision returns `null`. The adapter does not query a corpus, generate a grading, call an AI model, or expose claim text outside the authenticated staff path.

## Deployment boundary

`migrations/pending/008_hadith.sql` and `migrations/pending/009_podcast_foundation.sql` are deliberately excluded from normal startup. `HADITH_PHASE2A_ENABLED=false` is the source default. The correct order is: verified Phase 1 backup/freshness evidence; backed-up operator migration of 008; moved/applied 009; private R2/assets/recitation; reviewer/Tamil script approval; then the separately authorised capped measurement render.

No report, audio object, R2 credential, ElevenLabs key, provider request, human recording, actual Bukhari claim or member-facing episode was created by this implementation.
