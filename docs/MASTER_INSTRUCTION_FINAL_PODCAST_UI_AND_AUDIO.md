# Dragon Dawwa — Master Instruction: Final Podcast UI and Audio

Oct 7, 2026 · @FEROZ

The fastest safe route to a finished Bukhari 6306 Tamil episode is a reviewer-authored report that does not wait for hadith dataset licences, plus five owner decisions you can give today.

## Review of Manus's documents

All six documents are sound and consistent with the briefs. Nothing in them needs correcting.

| Document | Verdict | Key point |
| --- | --- | --- |
| Hadith reference datasets | Correct and careful | No source can be imported automatically: OpenITI needs per-work clearance; Sunnah.com, HadeethEnc, Shamela, Waqfeya and the al-Albani / al-Arna'ut grading editions need written permission or a publisher licence |
| R2 decision memo | Correct; recommend "Balanced" | Separate private Standard bucket, separate read/write and read-only credentials, no r2.dev or custom domain, no lifecycle rule, streamed only through the app |
| R2 research findings | Matches Cloudflare's documentation | Private by default; bucket-scoped tokens; $0.015/GB-month with a 10 GB free tier; free egress |
| Phase-one release gates | Correct priority | Three gates remain before the first tester: backup failure alert, Quran Foundation credentials, and a second real user on a physical phone |
| Release plan and outcome tracker | Accurate record | Podcast stays disabled; `009` stays parked behind `008` |

**The real blocker for the podcast is not code.** As planned, the podcast needs an approved hadith report, the report needs the six-agent research feature, and that feature needs a licensed reference library. The licences could take months. Section 2 removes that dependency for the first episodes without weakening any safety rule.

## The unblocking move: a reviewer-authored report path

Split Phase 2 into two parts:

- **Phase 2a — reviewer-authored reports (build now).** The qualified hadith reviewer writes or confirms each claim by hand in a staff form: the claim, the source (book and hadith number, or volume and page), the edition, the quoted wording the reviewer checked, and the scholar's grading with its reference. No dataset is imported, no AI agent researches anything, and every claim is entered and attested by a human. This is the same standard a printed booklet from your masjid would meet.
- **Phase 2b — the six research agents (later).** Starts only after the licences are cleared. When it arrives, agents propose claims into the same tables, and the reviewer still approves them.

Phase 2a needs only a **minimal `008_hadith.sql`** with `hadith_reports` (immutable revisions), `hadith_claims` (each with source reference, edition, quoted wording, grader and the entering staff ID) and the reviewer attestation. It leaves the reference-library schema for 2b. It implements `getApprovedRevision()` exactly as already agreed, so the parked `009` podcast migration can then run.

This keeps every rule intact: no AI grading, a qualified human approves everything, and members only see approved reports. It also matches what was already researched for Bukhari 6306: the reviewer can confirm those findings directly from the books.

## Owner decisions to give now

| # | Decision | Recommended answer | Why |
| --- | --- | --- | --- |
| 1 | Phase 2a reviewer-authored reports | **Approve** | Unblocks the podcast without any dataset licence |
| 2 | Hadith datasets | **Approve the rights-discovery phase only** (Manus's "Balanced"); no imports | Licences run in the background for Phase 2b |
| 3 | R2 podcast bucket | **Approve the design now; create the bucket at milestone 5** | Nothing to store until then; keeps it reversible |
| 4 | Cost-measurement run | **Approve one run for Bukhari 6306 Tamil, capped at 20,000 ElevenLabs credits**, at milestone 6 | Earlier test scenes used about 6,700 credits; 20,000 covers a full episode plus asset regeneration with headroom |
| 5 | Asset library | **Use the approved canvas assets** (intro, sting, room tone, table sounds, reactions); you download them from ElevenLabs and hand them to Manus | Already approved by ear; avoids paying to regenerate |

**People you must arrange yourself** (no software can do these):

- A **qualified hadith reviewer**, named, who agrees to author or confirm reports and approve scripts.
- A **Tamil language reviewer** for scripts.
- A **human recitation** of Sayyid al-Istighfar by a qari or imam, recorded in a quiet room (a phone is fine), as a WAV or high-quality MP3.
- A **consenting second tester** with their own Google account and phone (needed for Phase 1 anyway).

## Build order to the final MP3

Each milestone ends with evidence Manus reports back. Phase 1 gates continue in parallel and still come first for any outside tester.

1. **Phase 1 gates (in parallel, priority).** Backup failure alert and freshness check, Quran Foundation credentials, second-user physical-phone acceptance — exactly as in Manus's release-gates document.
2. **Phase 2a schema and staff report form.** Minimal `008_hadith.sql`; staff form to enter claims with source, edition, quoted wording and grading; reviewer attestation (owner-granted, with stated basis); exact-revision approval; `getApprovedRevision()` implemented and tested. *Evidence:* a test report with non-religious fixture claims passes approval; owner self-approval is refused.
3. **Unpark `009_podcast_foundation.sql`.** Apply it after `008` through the normal operator migration with a verified backup. *Evidence:* migration ledger shows 001–009; backup still under 128 MiB.
4. **Podcast UI (both member and staff screens, section 5), built against fixture audio.** Use a short silent or synthetic test MP3; no ElevenLabs calls. *Evidence:* screenshots and a recorded walkthrough at 390 px and desktop, EN and TA.
5. **Storage and assets.** Create the dedicated private R2 bucket per the memo; issue the two scoped credentials; import the owner-supplied canvas assets and the human recitation as private assets; staff approve each by ear in the asset screen. *Evidence:* public access shows "Not allowed"; an asset streams only to a signed-in staff user.
6. **Bukhari 6306 report and script.** The qualified reviewer enters or confirms the Bukhari 6306 claims and approves the report. The Tamil six-voice script (already written and approved by ear by the owner) is entered against those claim IDs; reviewer and Tamil language reviewer approve it.
7. **Capped cost-measurement render.** Owner switches `PODCAST_RENDER_MODE` to `cost_measurement` for this one episode with a 20,000-credit cap. Worker renders lines, runs Scribe line checks, mixes with ffmpeg 6, runs loudness and gap checks. *Evidence:* credit ledger total, QA results, and the MP3 in the staff listen screen.
8. **Final listen and publish.** Owner and reviewer listen to the whole episode and approve; it appears to signed-in members on the report page. *Evidence:* member playback on a physical phone.
9. **Production decision.** With the measured cost known, owner decides whether to enable `production` mode and the English version (five more English voices to choose).

## Podcast UI specification

Mobile-first, calm, in the site's existing design language, in English and Tamil (Sinhala shows an honest "not available yet" state).

### Member screens

**The Research Table page** (`/podcasts`, Tamil title "ஆய்வு மேசை"): a list of published episodes. Each card shows the episode title, hadith reference (e.g. Bukhari 6306), language, length, the scholars' attributed grade (e.g. "Sahih — al-Bukhari"), and "Reviewed by \[name\], \[date\]". No AI percentage or score anywhere.

**Episode player** (on the hadith report page and at `/podcasts/<id>`):

- Large play/pause; 15-second back and forward; seek bar with **four chapter marks** (Sources, Chain and narrators, Supporting chains and scholars, Translation and verdict).
- Speed 0.75×, 1×, 1.25×, 1.5×. **No autoplay.** Starting the podcast pauses any Quran recitation or study audio, and vice versa — one sound at a time across the site.
- Resume position saved per member and restored on any device.
- Lock-screen and notification controls through the browser Media Session API (title, "Dragon Dawwa", play/pause, skip).
- **Live transcript** below the player: each line shows the speaker's name, the current line is highlighted, and tapping a line jumps the audio there. Lines that state a fact show a small "source" chip that opens the cited claim from the approved report.
- At the recitation point, the transcript shows the **Arabic dua exactly as in the cited source**, right-to-left, with "Recited by \[name\]".
- Speakers are shown with **calligraphic initials or geometric icons, not faces or human images**, which suits the audience and avoids implying real people.
- A clear label under the player: "AI-voiced research discussion. Content approved by \[reviewer\] on \[date\]. For personal rulings, consult a scholar you trust."
- "Report a problem" uses the existing member report queue.
- Accessible: keyboard operable, labelled controls, 44 px touch targets, visible focus, reduced-motion respected; the transcript doubles as captions.

### Staff screens

- **Production board:** every episode with its current stage (the ten stages in the pipeline brief), blocked reason if any, and who acts next.
- **Script review:** each line with speaker, tone tags and linked claims; validation errors inline; approve buttons for the hadith reviewer and the language reviewer, each recorded separately.
- **Recitation:** upload, waveform preview, play, approve or replace.
- **Asset library:** every intro, sting, room tone, table sound and reaction clip with play, version, approve and retire.
- **Render:** current mode, credit cap, credits used so far; the start button stays disabled until every gate shows green, with the missing gate named.
- **Line QA:** each line's clip, Scribe transcript, match percentage, and a one-time regenerate button.
- **Final listen:** full player with loudness and peak readings, approve or reject with notes, then publish or withdraw. Every action is audited.

**Transcript timing:** the mixer must save each line's start and end time (from its timeline) alongside the MP3, so the member transcript can follow the audio exactly.

## Definition of the final output

The job is done when all of these are true:

- [ ] A finished **Bukhari 6306 Tamil MP3** (about 9–10 minutes, stereo, 128 kbps, −16 LUFS ±1, true peak ≤ −1 dBTP) with intro melody, four segments, stings, room tone, reactions, three table sounds, the human recitation (dry, no effects) and the closing.
- [ ] All six Tamil voices as cast; no whisper tags; no AI-voiced Arabic.
- [ ] Every spoken factual line traces to a claim in the reviewer-approved report revision.
- [ ] Owner and reviewer have approved the final listen, recorded in the audit log.
- [ ] The episode plays for a signed-in member on a physical phone, with the synced transcript, chapters, speed control and lock-screen controls working, and pauses the Quran player when started.
- [ ] An anonymous visitor and a signed-out member cannot reach the audio; no public URL exists.
- [ ] The credit ledger shows the measured cost of the episode, under the 20,000-credit cap.
- [ ] A rerun of the unchanged episode makes zero ElevenLabs calls.
- [ ] The daily database backup is still under 128 MiB.

## Master instruction to paste into Manus

```markdown
MASTER INSTRUCTION — FINAL PODCAST UI AND AUDIO (owner decisions, 7 October 2026)

I have reviewed your dataset list, R2 memo, R2 research, phase-one gates, release plan and tracker. They are accepted. My decisions:

1. Phase 1 stays the priority. Continue the three phase-one gates exactly as you documented (backup failure alert + freshness, Quran Foundation credentials, second-user physical-phone acceptance).

2. APPROVED: Phase 2a, reviewer-authored hadith reports. Build a minimal 008_hadith.sql with immutable hadith_reports revisions, hadith_claims (claim text, source book and number or volume/page, edition, quoted wording checked by the reviewer, named grader and grading reference, entering staff ID) and the owner-granted qualified-reviewer attestation with stated basis. No dataset import and no AI research agents in 2a. Implement getApprovedRevision() exactly as agreed. The licensed reference library and the six research agents become Phase 2b.

3. APPROVED: hadith dataset rights-discovery only (your Balanced option). No imports.

4. APPROVED: the dedicated private R2 bucket design (Balanced). Create the bucket and the two scoped credentials only at milestone 5 of the attached build order.

5. After 008 passes, apply the parked 009_podcast_foundation.sql through the normal backed-up operator migration.

6. Build the podcast UI from the attached master instruction: member player with chapters, synced transcript, speed, resume, Media Session controls, one-audio-at-a-time, Arabic recitation shown from the cited source, icons not faces; and the staff production board, script review, recitation, asset library, render, line QA and final-listen screens. Build and test it with fixture audio first; no ElevenLabs calls. The mixer must save per-line start/end times for the transcript.

7. Assets: I will supply the approved ElevenLabs canvas assets (intro, sting, room tone, table sounds, reaction clips) and the human recitation. Import them as private assets for staff approval by ear.

8. APPROVED IN ADVANCE, ONLY WHEN ALL GATES ARE GREEN: one cost_measurement render of the Bukhari 6306 Tamil episode, capped at 20,000 ElevenLabs credits, using the six approved Tamil voices and the script approved by the qualified reviewer and the Tamil language reviewer. Stop and report if the cap would be exceeded.

9. Final listen by me and the reviewer, then publish to signed-in members only. Production mode and the English version need a separate decision after I see the measured cost.

Follow the build order and the definition of final output in the attached document. Report evidence at the end of each milestone, and state anything unverified.
```

Attach this doc (exported as PDF or Markdown) with the message, together with the Automated Podcast Pipeline brief.
