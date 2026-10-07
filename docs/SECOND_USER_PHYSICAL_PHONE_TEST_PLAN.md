# Dragon Dawwa — second-user physical-phone acceptance plan

**Prepared:** 7 October 2026  
**Release scope:** one invited reader, one consenting adult, private Railway production only.  
**Not a community launch:** a pass authorizes no public signup, no wider cohort, no content publication, no Hadith migration, and no podcast activation.

> **Current gate state:** the Quran reader is available to the owner, the backup failure path and independent freshness monitor have passed, and the Railway backup cron is enabled at `15 2 * * *` UTC. The first natural scheduled backup has not yet occurred at the time this plan was prepared. Do **not** invite the tester until the post-run evidence confirms the new byte-verified snapshot and healthy monitor result.

## 1. Required human and operational preconditions

| Gate | Required proof before an invitation | Owner / operator action | Hard stop |
|---|---|---|---|
| Daily backup control | First `02:15 UTC` natural run logged as uploaded and byte-verified; a new R2 object has valid size and SHA-256 metadata; the following freshness check is silent and error-free | Review the recorded evidence only; do not change retention or lifecycle rules | Missing, stale, malformed, or unverified snapshot |
| Quran provider | Owner’s live private reader check remains healthy with named English/Tamil resources, honest Sinhala-unavailable handling, user-initiated audio, and no surprise autoplay | Retain the existing protected provider credentials; never copy them into the test material | Provider returns a configuration/authentication failure or audio is unsafe/unreliable |
| Tester consent | One **different consenting adult** accepts a short private test period and the limited device/observation record described below | Owner records a yes/no consent marker and a private expiry/removal plan; no credentials, 2FA codes, cookie values, or Google ID appear in the evidence file | No affirmative consent, shared credentials, or pressure to participate |
| Access grant | Exactly one pre-verified provider identity is invited as **reader only**, with no staff role | Owner uses the protected staff workflow and privately sends the approved test link | Identity mismatch, staff access, or broad/guessable invitation |
| Test assets | The physical device has its own normal browser and speaker/headphones. Any English/Tamil/Sinhala WAV samples are nonreligious, rights-cleared, and owner-approved | Keep samples outside the Quran/podcast pipeline; do not widen the paid AI canary merely for this test | Religious material is used as a fixture, an unapproved canary is widened, or audio is attributed as a human reciter |

## 2. Participants and evidence discipline

| Role | Responsibility | Must not do |
|---|---|---|
| Owner witness | Creates/revokes the one reader invitation, observes only the minimum test record, confirms cleanup | Ask for passwords, MFA codes, tokens, browser exports, recordings, or private notes |
| Consenting tester | Uses their own physical Android Chrome or iOS Safari device and their own identity; reports visible outcome and audio route | Share credentials, copy cookies, use a staff account, or test real community data |
| Operator | Confirms release SHA/deployment state, backup evidence, and resolved defects | Modify production data, retention/lifecycle, R2 contents, provider credentials, migrations, or feature flags during the test |

Record only: test date/time, release commit and deployment identifier, device model, OS, browser/version, network type, audio output route, pass/fail per step, owner witness, and a minimal remediation reference. Do **not** record the tester’s identity, tokens, Quran text, saved personal notes, microphone audio, a screenshot of private data, or any audio recording.

## 3. Execution sequence

### A. Access and isolation

| Step | Tester action on their own physical phone | Expected result | Stop-and-fix condition |
|---|---|---|---|
| A1 — anonymous boundary | Open the exact approved `https://dragondawwa.org` origin in a private browser tab before sign-in; try one private app route and one protected API route only through normal navigation | Login/legal/readiness is available; private page and API content are denied | Any anonymous private page, asset, data response, member content, or staff screen is visible |
| A2 — invited sign-in | Sign in with the pre-invited identity | A private reader session opens; no staff controls or other members’ information appears | Sign-in succeeds for the wrong identity, user receives elevated role, or access is denied despite a confirmed invitation |
| A3 — self-only data | Create the optional My Learning profile and save one reviewed original-publisher link | Tester sees only their own profile/save; owner’s minimal index does not expose saves or private fields | Another member’s content appears or profile input changes access rights |

### B. Quran reading and physical audio

| Step | Tester action | Expected result | Stop-and-fix condition |
|---|---|---|---|
| B1 — language and resource honesty | Switch interface language to Tamil, then inspect the selected named translation; switch to Sinhala only to verify an unavailable translation is honestly represented | Tamil selection uses the matching named resource; Sinhala does not silently present English as Sinhala | Tamil remains English after a language switch, resources are mislabelled, or Sinhala availability is misrepresented |
| B2 — cross-session resume | On the phone, save one Quran reading place using the normal reader control. On a separate tester-owned signed-in browser/device, open the reader and resume | The same saved place restores for the same reader; no browser-local note is sent to the server | Resume differs, another account’s place appears, or private notes upload |
| B3 — Quran Foundation playback | Start recitation through the normal user action; pause; change surah or reciter; then restart only if the tester chooses | Audible native playback through the stated route; no autoplay; pause works; prior playback stops on change | Silence, overlapping streams, pause failure, unsafe autoplay, or playback attributed to generated/AI recitation |
| B4 — nonreligious WAV decode (only if approved) | Play the pre-approved EN/TA/SI nonreligious samples locally on the physical device; verify Play, Pause, Replay, seek, and speed controls where supplied | Each file decodes without stutter; controls require a user action | Decode/playback failure, overlap, pronunciation concern, or any need to widen an owner-only app canary |

### C. Session, revocation, export, and cleanup

| Step | Tester and owner action | Expected result | Stop-and-fix condition |
|---|---|---|---|
| C1 — ordinary multi-session revocation | Tester signs in normally on a second tester-owned browser/device. From the first device, use the supported logout-all action. On the second device, make a normal private-page request | The old second session is denied; this tests revocation without extracting or replaying cookies/tokens | The second active browser still accesses a private route after logout-all |
| C2 — account export/deletion boundary | Tester signs in again normally while the reader role is still active and requests their own export/deletion through the intended workflow | Export relates only to the tester. After deletion, active profile/save/history/audio rows are absent; only the permitted operational tombstone may remain | Another person’s data appears, active private data survives deletion, or deletion is ambiguous |
| C3 — final role revocation | Owner verifies the reader role/invitation is removed, then tester attempts one ordinary protected navigation from their existing browser | Access is denied immediately; no staff or member API remains reachable | Revoked account still receives an app session or private response |

## 4. Decision matrix

| Outcome | Meaning | Next action |
|---|---|---|
| All required A–C steps pass; optional B4 is either passed or explicitly deferred without canary expansion | Private second-user/device gate is technically evidenced for this one tester | Owner decides whether to repeat on the other mobile platform; this is still not community-launch approval |
| Any access, isolation, session-revocation, deletion, or anonymous-boundary failure | **Release blocker** | Revoke the reader role, stop testing, record a minimal defect reference, and remediate before a repeat test |
| Quran provider or audio control failure | **Release blocker for Quran/mobile reader scope** | Stop the audio portion, retain private access, and diagnose without exposing credentials or generating replacement religious audio |
| Native-speaker pronunciation concern | Human language/religious-review hold, not a browser defect verdict | Do not call the material approved; obtain qualified human review before any wider audience |

## 5. Minimal evidence record template

| Field | Value to record |
|---|---|
| Test window | UTC start/end |
| Release | Git commit and Railway deployment identifier |
| Consent | `confirmed` / `not confirmed` only |
| Device | Model, OS version, browser/version, audio route |
| Backup prerequisite | Post-02:15 backup evidence reference |
| A1–C3 | `pass`, `fail`, or `not run`, plus short non-sensitive observation |
| Owner witness | Initials/role only |
| Cleanup | Reader role removed; no active sample data left |
| Decision | Hold / remediate / repeat on other platform — no community launch decision implied |

## 6. Owner actions needed to begin

1. Wait for and accept the first scheduled-backup verification record.
2. Nominate one consenting adult tester and a short test window.
3. Privately obtain their exact verified identity and invite **only** that reader identity with a defined expiry/removal plan.
4. Confirm whether the optional nonreligious WAV decode check is in scope **without** expanding any paid or owner-only canary.
5. Conduct the test with the owner present; then remove the test reader role and preserve only the minimal evidence template above.
