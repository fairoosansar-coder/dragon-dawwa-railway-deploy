# Podcast brief reconciliation — 7 October 2026

The supplied [Hadith Research Agents brief](HADITH_RESEARCH_AGENTS_BRIEF.md) is retained beside this reconciliation record.

## Decision authority

When the Hadith Research Agents brief and the Automated Podcast Pipeline brief conflict **about the podcast**, the **Automated Podcast Pipeline brief controls**. This decision was supplied by the owner on 7 October 2026.

## Resolved differences

| Subject | Hadith Research Agents brief | Automated Podcast Pipeline brief | Implemented ruling |
| --- | --- | --- | --- |
| Render cast | Agent 6 drafts a two-voice host/researcher dialogue. | Six-person research-table show. | **Six voices.** A two-voice research draft is not renderable. It may be editorial input only; a separately approved six-speaker script, restricted to the same accepted report claims, is required before TTS. |
| Primary purpose | Optional read-aloud of approved report. | Finished researched programme with intro, stings, room tone, reactions, table sounds and final listen gate. | The Pipeline brief’s six-voice production, mixing, QA and final-listen controls govern any render. |
| Arabic treatment | Arabic hadith is never AI-spoken; human clip may be later. | AI must never voice Arabic; human dua recitation is required and dry. | No Arabic Unicode may reach the TTS client. The Pipeline’s human-recitation / no-effects controls apply. |
| Storage language | Private authenticated endpoint, not an object-storage URL. | Private storage outside the daily database backup; storage location requires approval. | The application will authenticate and stream from a private store using opaque keys. No public object URL is returned; a store provider remains pending owner approval. |

## Shared upstream contract

The two briefs agree that only an approved, qualified-human-reviewed report may enter podcast work. The supplied Hadith brief specifies the exact adapter already expected by the foundation:

```js
getApprovedRevision({ reportRevisionId }) => ({
  id,
  status: 'approved',
  claimIds,          // accepted claims only
  qualifiedReviewerId,
  approvedAt,
})
```

Withdrawn or superseded revisions must return `null`. The foundation already rejects absent, mismatched or malformed responses and validates every spoken script line against the returned accepted-claim set.

## Migration sequencing correction

The Hadith brief requires `008_hadith.sql` as the first phase-two migration. The research reference library needs a separate read-only schema and licence/provenance decision, so it must not be improvised inside the existing member-data migration path.

Accordingly, `009_podcast_foundation.sql` is retained under `migrations/pending/` and is **not executable**. It will move into the migration ledger only after the approved Hadith feature implements `008_hadith.sql`, its report/claim contract and its separate-library design. The current live migration inventory remains `001`–`007`.

## Still blocked by design

The Hadith feature is a phase-two feature and has not been implemented. There is no licensed source library, qualified-reviewer attestation, report revision, approved script, human recitation, private audio store or owner-approved bounded cost-measurement authorization. The pipeline remains disabled and cannot make an ElevenLabs request.
