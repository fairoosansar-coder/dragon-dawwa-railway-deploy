# Bukhari 6306 Tamil — ElevenLabs cost estimate

**Prepared:** 2026-10-07
**Result:** **an estimated rate card only — not a measured episode cost and not authorization to spend.**
**Provider calls made for this document:** none.

## Executive finding

The actual reviewer-approved Bukhari 6306 Tamil script is **not in the repository or supplied uploads**. The current source contains only a synthetic test fixture, including a 100-character provider-job example; that fixture is not religious content and cannot be used as the episode character count.

The owner instruction states that the Tamil script was already written and approved by ear, but it has not been entered into the private report/script workflow or attached as a machine-readable JSON/text file. Therefore no honest calculation can claim to be based on its actual character count.

> **Decision:** retain `PODCAST_RENDER_MODE=disabled`. Do not add a provider key, enable the worker, or spend credits. Upload or enter the final approved Tamil script with claim IDs first; then the exact no-spend estimate is a deterministic count rather than a duration proxy.

## Current source and price basis

| Item | Evidence | Meaning |
|---|---|---|
| Required TTS model | `eleven_v4` | Available in the configured ElevenLabs workspace and lists Tamil as supported |
| Current provider TTS rate | [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), checked 7 October 2026 | `$0.022` per 1,000 v4 characters during the displayed 72% promotion, stated to run until 12 October; taxes excluded |
| Current QA STT rate | [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) | Scribe v2: `$0.22` per audio hour |
| Music / SFX rates | [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) | Music `$0.15`/minute; Sound Effects `$0.12`/minute — relevant only if reusable assets are not imported |
| Historical owner-workspace trial | `DragonDawwa—AutomatedPodcastPipeline(BuildBriefforManus).md` | 12 Tamil v4 lines plus one music clip: 3,760 credits / about `$0.62`; studio pack: 2,985 credits / about `$0.49` |
| Existing owner decision | `MASTER_INSTRUCTION_FINAL_PODCAST_UI_AND_AUDIO.md` | One future `cost_measurement` render remains capped at **20,000 credits** after all gates are green |

The promotional TTS price is time-limited. The same page does not state a post-promotion v4 price in the extracted text. The `$0.0786` per 1,000-character figure used below is only the mathematical undiscounted equivalent of `$0.022 ÷ 0.28`, **not** a future provider quote.

## Exact formula once the final script is available

Let **C** equal the exact sum of every non-recitation `line.text.length` sent to the `/v1/text-to-speech` endpoint:

- include Tamil letters, spaces, punctuation, and permitted tone tags because they are part of the request payload;
- exclude the human Arabic recitation because it is never sent to TTS;
- exclude cached unchanged lines from a re-run because their hash avoids a new call;
- count any regenerated line as a new TTS request and re-run its Scribe QA.

| Component | No-spend calculation |
|---|---|
| v4 TTS at the displayed promotion | `C ÷ 1,000 × $0.022` |
| Scribe v2 QA proxy | actual rendered audio minutes `÷ 60 × $0.22` |
| First-pass variable provider subtotal | v4 TTS + Scribe QA |
| One-time music/SFX | `$0` if the owner-supplied, approved canvas assets are imported; otherwise measure the exact requested output durations at the current provider rate |
| Human recitation | `$0` ElevenLabs TTS — it is a private human upload |
| ffmpeg, Railway worker, R2 storage, database, tax | excluded — these are not ElevenLabs charges |

The future worker must reserve a conservative credit amount before each provider call, record the provider's returned cost metadata where supplied, and stop before exceeding the daily **20,000-credit** cap. USD rate-card arithmetic is not a substitute for that credit guard.

## Duration-only planning proxy — not a script measurement

ElevenLabs' current API pricing page represents 1,000 v4 characters as approximately one minute. The owner brief targets a 9–10 minute final episode. Treating that page convention as a proxy gives 9,000–10,000 TTS characters before any approved-script count exists.

| Scenario | 9,000 characters | 10,000 characters | Notes |
|---|---:|---:|---|
| v4 TTS at displayed promotion | `$0.1980` | `$0.2200` | Current displayed rate, before tax |
| Scribe v2 QA proxy | `$0.0330` | `$0.0367` | Assumes one transcription pass over roughly 9–10 minutes of rendered TTS audio |
| First-pass recurring ElevenLabs subtotal | **`$0.2310`** | **`$0.2567`** | Reused assets; no retry; no human recitation charge |
| Worst case if every line requires the single allowed retry | `$0.4620` | `$0.5133` | Doubles first-pass TTS and QA only; not a likely outcome |
| Mathematical post-promotion v4 equivalent, plus one QA pass | `$0.7401` | `$0.8224` | Uses the non-contractual `$0.0786` inferred from the displayed 72% discount |

The historical brief's own planning band remains more conservative: **approximately `$1.50–$2.50` per language for a 46-line full episode**. Use that band for decision planning until the exact script count and current provider quote are locked. It absorbs uncertainty in line segmentation, tags, QA retries, and any missing asset import better than the duration-only rate-card proxy.

## Credit-cap interpretation

The brief's historical samples imply approximately `$3.28–$3.30` for 20,000 credits at the observed 7 October workspace conversion. This is **not** a fixed dollar cap: credit economics vary by plan, model, promotion, and provider pricing. The enforceable control is the 20,000-credit reservation ceiling, not a USD conversion.

## Required input to replace this estimate

Provide one of the following through the private staff report/script workflow or as a private upload:

1. the exact final Tamil script JSON with `segments`, `line.text`, `speaker`, `claim_ids`, and `recitation_after_line`; or
2. a final Tamil text file with a line map identifying the human-recitation exclusion and all allowed tone tags.

The next no-spend action is then:

1. validate the script against six-speaker, claim-link, no-Arabic, no-whisper, and full-honorific rules;
2. count `C` exactly as sent to the provider;
3. calculate v4 TTS plus expected Scribe QA and identify any non-imported asset generation;
4. present the exact estimated credit reservation and USD rate card for owner approval;
5. only after every Phase 1/2 human, storage, and migration gate is green, enable one episode-specific `cost_measurement` run under the 20,000-credit cap.
