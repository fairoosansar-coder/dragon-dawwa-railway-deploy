# Dragon Dawwa — Hadith Research Agents (Feature Brief for Manus)

Oct 5, 2026 · @FEROZ

## Purpose and fit with the master brief

Add a **Hadith Research** feature: a member submits a hadith (text or a photo of a plaque), six AI agents gather and cite what recognised sources and scholars have already said, and a qualified human reviewer approves the report before members see it. An optional podcast reads the approved report aloud in English, Tamil or Sinhala.

This builds on the master brief rather than replacing it. Section C already forbids "invented hadith references, authenticity gradings, scholar endorsements or claims of universal scholarly agreement", and says an "approved" workflow state must not imply qualified religious review. This feature is designed to satisfy those rules, not work around them.

It is a **phase 2 feature**. It starts only after the first community-ready release (sections A–H) is delivered, and it is off by default until the owner separately approves its AI spending.

## What the full source review changed

The uploaded source and docs were read in full before this revision. Five findings changed the design.

| Finding in the source | Effect on this feature |
| --- | --- |
| The uploaded zip is the Tailscale-era source (Manus OAuth / Tailscale Serve, 98 tests, one Railway Dockerfile). It predates checkpoint `e3393f4` (Google OIDC, `dragondawwa.org`, 114 tests). | Manus must build on `e3393f4` or later and confirm the next migration number there. |
| Roles are fixed sets (`reader`, `author`, `reviewer`, `publisher`, `owner`) repeated in `access.mjs`, `manage.mjs`, `member.mjs`, `study.mjs` and `lib/editorial.mjs`. The admin guide already says owner self-review is not independent review or scholarly endorsement. | No new role. An existing reviewer gets a separate, owner-granted **qualified hadith reviewer** attestation. |
| `study.mjs` already grounds AI answers: an evidence packet marked as untrusted data, no use of model memory, citation IDs that must match retrieved sources exactly, and no member ID sent to the provider. | The agents reuse this pattern instead of a new one. |
| Study audio is a WAV `MEDIUMBLOB` in MySQL behind a private endpoint, never an object-storage URL. The approved daily encrypted backup fails above 128 MiB. | Podcast audio and the reference library must not push the backup past its cap. |
| Member deletion removes study answers and audio in one transaction; retention periods are still owner-review targets. | Hadith cases a member submits follow the same deletion and retention rules. |

The editorial library already has `hadith` as a source kind, and its code notes that the kind describes provenance, not authenticity. Approved hadith reports are published through that same exact-revision workflow.

## Non-negotiable rules

1. **No agent grades a hadith.** Agents only find, quote and cite gradings that named scholars have already made. The grade members see is always the scholars' grade, attributed by name.
2. **No claim without a verified citation.** Every claim must point to a source in the reference library, with a location (book, volume, page or number) and the quoted original wording. A code check, not an AI, removes anything that fails.
3. **No publication without qualified human review.** Only a reviewer the owner has marked as a qualified hadith reviewer, with the basis recorded, can approve a report. Owner self-review and automated processes never count as qualified review.
4. **Disagreement is shown, not hidden.** If scholars differ (e.g. Sahih versus Hasan), the report says so. It never claims universal agreement unless every cited grading agrees.
5. **AI text is labelled.** Agent-written explanation is marked as machine-generated and kept visually separate from quoted sources, as the Quran study feature already does.
6. **The Arabic text is never altered.** It is shown exactly as in the cited source. Translations come from named published sources only, never AI translation of the Prophet's ﷺ words.
7. **Members see only approved reports.** Draft, in-progress and rejected cases are visible only to staff, and must not be fetchable through member or visitor endpoints.

## The six agents

Agent 1 runs first because the others need its chains; agents 2–5 then run in parallel; agent 6 runs last, using only claims that passed the verification gate. Character names are optional and used only for presentation and the podcast.

| # | Agent | What it does | What it returns |
| --- | --- | --- | --- |
| 1 | Takhrij (Source Finder) | Finds every collection and number where the text appears, and the wording differences between them | Sources with exact text from each, and each chain of narrators |
| 2 | Isnad (Chain Checker) | Checks every link in each chain: clear hearing ("haddathana", "sami'tu") versus "'an", and whether teacher and student lived at the same time | Each link marked connected, broken or uncertain, with the cited reason |
| 3 | Rijal (Narrator Judge) | Looks up each narrator in the narrator-criticism books | One record per narrator with the critics' quoted verdicts and references |
| 4 | Shawahid and Matn (Witness Finder) | Finds supporting chains and similar narrations, and checks for contradictions or recorded hidden defects | Supporting reports, contradictions and defects, each cited |
| 5 | Scholars' Verdicts (Grading Collector) | Collects named gradings from recognised scholars | Table of scholar, grade, book and page |
| 6 | Synthesis (Final Report) | Reconciles agents 1–5, shows agreement and disagreement, writes the report and the podcast script | Draft report and script for human review |

Agents must return structured JSON, not free text. Each claim has this shape:

```json
{ "claim": "Ibn Hibban listed al-Kirmani among trustworthy narrators",
  "source_id": "thiqat-ibn-hibban", "locator": "7/372",
  "quote_ar": "…", "agent": 3 }
```

## Verification gate and scholar review

The gate is deterministic code that runs after agents 1–5 and before agent 6. It accepts a claim only if all of these pass:

- The `source_id` exists in the reference library.
- The quoted Arabic appears at the stated `locator` (normalised match: diacritics and spacing ignored, letters not).
- Narrator names in the claim match narrators in the chain agent 1 returned.
- Any grading claim comes from agent 5's table and names a scholar and a book.

Rejected claims are stored with the reason and shown to the reviewer, but never passed to agent 6 or shown to members.

The review screen reuses the existing editorial workflow (draft, request changes, exact-revision approval, publish, withdraw, revision history). The reviewer sees each claim beside its quoted source, can strike claims, and approves a specific report revision. Only a reviewer with the qualified hadith reviewer attestation can approve; the attestation, who granted it and its stated basis are audited. Editing an approved report requires fresh review.

## Reference library

Agents cite only from a fixed, versioned library loaded into MySQL, never from open web search. Open web results bring in forum posts and fabricated gradings.

Minimum contents for the first version:

- The six major collections plus Musnad Ahmad, with standard numbering.
- Narrator-criticism works, starting with Taqrib al-Tahdhib.
- Grading works of al-Albani and of Shu'ayb al-Arna'ut's team, where licensing allows.

Manus must confirm the licence and provenance of every dataset before loading it, record it in a `hadith_sources` row (title, edition, publisher, licence, import date, file hash), and stop to ask the owner if a licence is unclear. Labelled web lookup can be considered later as a separate, clearly marked extra.

**Size and backups.** Hadith collections and narrator works can reach hundreds of megabytes, far above the 128 MiB backup cap. Keep the library in a separate read-only schema, excluded from the daily member-data backup. Its source files are stored once with recorded hashes, so it can be rebuilt instead of backed up daily. Manus must measure its real size before choosing this layout.

## Database, worker and integration

Add one additive migration, `008_hadith.sql`, following the rules of migrations 001–007: no seed data, no startup DDL, applied only through the operator migration process after a verified backup.

| Table | Holds |
| --- | --- |
| `hadith_sources`, `hadith_texts`, `hadith_chains`, `narrators`, `narrator_verdicts`, `scholar_gradings` | The reference library (read-only to the app) |
| `hadith_cases` | One row per submitted hadith; status `queued → researching → gated → synthesised → in_review → published / rejected` |
| `hadith_agent_runs` | One row per agent run: model ID, prompt version, tokens, cost, raw output (like `study_responses`) |
| `hadith_claims` | Accepted and rejected claims, with the rejection reason |
| `hadith_reports` | Final report revisions, reviewer ID, approval time, `source_digest` |
| `hadith_audio_jobs` | Podcast jobs, same idempotency and two-attempt limit as `study_audio_jobs` |

Run agents in **one background worker service** with no public domain. It claims cases from `hadith_cases` using MySQL 8 `SELECT … FOR UPDATE SKIP LOCKED`, one case at a time. No separate queue system is needed.

Reuse what exists:

- the active sign-in provider (Google OIDC under the approved Railway plan) and exact-ID invitations;
- the evidence-packet, untrusted-data and exact-citation checks in `server/study.mjs`, with no member ID sent to the provider;
- the allow-listed Gemini models and server-only keys in `server/gemini-study.mjs`, with no fallback to another vendor;
- the per-user and global caps in `STUDY_USAGE_LIMITS`;
- the member report queue pattern of `study_response_reports`, so members can flag a published report.

The current private database transport allows only the `app` and `migrator` roles and checks the web service's own settings. The worker needs its own reviewed, fail-closed connection mode using the `app` role. Member-submitted cases and any photo-derived text must be removed by the existing account-deletion transaction. Photos are processed by OCR and not stored; the member confirms the extracted text before research starts.

## What members see

The headline is always the scholars' attributed grade, for example "Sahih according to al-Albani; Hasan according to Darussalam". There is no single AI percentage such as "87% authentic", because that would be an AI grading the hadith.

Below the headline, an **evidence summary** (the "purity" view) shows the research in plain terms:

| Check | Example (Masjid Quba hadith, Ibn Majah 1412) |
| --- | --- |
| Chain connected | Yes, every link uses clear hearing or narration |
| Narrators | All reliable; one (al-Kirmani) with a lower but accepted rating |
| Supporting narrations | Yusuf ibn Tahman's chain; Usayd ibn Zuhayr's hadith; Quba visits in Bukhari and Muslim |
| Contradictions or hidden defects | None recorded |
| Scholars' gradings | 4 cited, all accept it (Sahih or Hasan) |
| Certainty level | Ahad, not Mutawatir |

Each row expands to the cited sources. The report shows the reviewer's name and approval date, and states that agent-written explanation is machine-generated.

## Podcast

The podcast is an optional way to listen to an **approved** report. It never adds facts the report does not contain.

1. Agent 6 writes a two-voice script (a host who asks, a researcher who answers) only from the approved report.
2. The script passes the same verification gate, and the qualified reviewer approves it.
3. Text-to-speech produces English, Tamil and Sinhala versions on request, using the existing TTS client and audio job pattern.
4. The Arabic hadith text is shown on screen, not spoken by AI, to avoid mispronouncing the Prophet's ﷺ words. A human recitation clip can be added later.
5. Audio follows the existing rule: stored privately and served only through the authenticated audio endpoint, never a public or object-storage URL. Audio is generated once per language and shared by all members for that approved report.
6. Audio can be regenerated from the approved script, so it should be excluded from the daily backup or stored compressed. Manus must show the backup stays under 128 MiB with podcast audio present.
7. Sinhala and Tamil scripts need human language review before release, as the master brief requires for all interface languages.

The player follows the Quran reader rules: no autoplay, one recording at a time, clear pause and resume.

## Cost, authorization and phasing

The feature ships **disabled**. Manus may build and test it with mocked agents and the reference library, but must not enable live AI calls, a new provider key or the worker service until the owner explicitly approves them.

- **AI cost:** about six agent calls per hadith, plus TTS per podcast language. Results are cached, so each hadith is paid for once, not on every view. Manus must estimate cost per case from real token counts before asking for approval.
- **Hosting cost:** the worker adds to the Railway bill. It must run small, one case at a time, and be measured in a real cost trace before any spending limit is raised.
- **Hosting choice:** the latest approved hosting plan is the private Railway service at `dragondawwa.org`. This feature must fit whichever hosting the owner has approved at the time.

Build order:

1. Reference library and migration 008.
2. Agents 1 and 5 with the verification gate. Collecting cited existing gradings is useful on its own.
3. Agents 2–4, agent 6, and the scholar review screen.
4. Podcast.

## Acceptance tests

These must pass with real workflows, not only unit tests:

- [ ] A hadith with a settled Sahih grade (e.g. the Masjid Quba hadith, Ibn Majah 1412) produces a report whose cited gradings match the scholars' published gradings exactly.
- [ ] A hadith widely graded weak produces a report showing that weakness and its cited reasons.
- [ ] A hadith graded fabricated is clearly shown as fabricated and never presented as a saying of the Prophet ﷺ.
- [ ] A fake source ID, wrong page or altered quote planted in an agent's output is rejected by the gate.
- [ ] A report cannot be published without approval from a reviewer holding the qualified hadith reviewer attestation; owner self-review alone cannot publish it.
- [ ] Editing an approved report requires fresh review before members see the change.
- [ ] Unapproved cases and reports cannot be fetched through member or visitor endpoints.
- [ ] Deleting a member account removes that member's submitted cases.
- [ ] With AI disabled, submitting a case shows an honest "not available" message rather than a fake result.
- [ ] Podcast audio plays only for approved reports, follows the no-autoplay and one-at-a-time rules, and is served only through the authenticated endpoint.
- [ ] The daily encrypted backup stays under 128 MiB with the reference library and podcast audio in place.
- [ ] Quota limits stop requests once the daily caps are reached.

## Interface for the podcast pipeline

The podcast pipeline foundation (already built, disabled) needs one read-only function from this feature. Implement it exactly:

```js
// Returns null unless the revision exists, is approved, and its approver
// held the qualified hadith reviewer attestation at approval time.
getApprovedRevision({ reportRevisionId }) => {
  id: 'immutable-report-revision-id',
  status: 'approved',
  claimIds: ['approved-claim-id-1', '...'],   // only gate-accepted claims
  qualifiedReviewerId: 'verified-reviewer-id',
  approvedAt: 'ISO-8601 time'
}
```

- `id` is the immutable `hadith_reports` revision ID; editing a report creates a new revision and the old one is never re-approved.
- `claimIds` are the accepted `hadith_claims` rows linked to that revision; rejected claims are never included.
- Withdrawn or superseded revisions return null, so the pipeline stops any episode built on them.

## Message to paste into Manus

```markdown
ADDENDUM — PHASE 2 FEATURE: HADITH RESEARCH AGENTS

Please add the attached "Hadith Research Agents" feature brief to the Dragon Dawwa scope as a phase 2 feature.

Order of work:
- Finish and verify the first community-ready release (sections A–H of the master brief) first.
- Build from checkpoint e3393f4 or later, not the older Tailscale-era export.
- Then build this feature following the brief's build order.

Key rules (full detail in the brief):
- No AI agent grades a hadith. Agents only collect and cite gradings already made by named scholars, from a licensed reference library.
- Reuse the grounding and exact-citation checks in server/study.mjs. A code gate rejects any claim without a valid source, location and matching quote.
- Only a reviewer I mark as a qualified hadith reviewer can approve a report. Owner self-review or automated approval does not count.
- Members see only approved reports. Arabic text is never altered or spoken by AI.
- Keep audio private behind the authenticated endpoint, and keep the daily backup under its 128 MiB cap.
- The feature ships disabled. Do not enable live AI calls, new provider keys or the worker service without my explicit approval. Bring me a measured cost-per-case estimate first.
- Confirm the licence of every hadith and narrator dataset before loading it, and ask me if any licence is unclear.

Report acceptance results against the brief's checklist, including anything still unverified.
```

Export this doc to Markdown or PDF from the doc menu and attach it alongside the message.
