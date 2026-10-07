# Dragon Dawwa — automated podcast pipeline foundation

**State:** implemented in source as a **disabled foundation** on 7 October 2026. It is not connected to a Hadith report, a worker, private object storage, ElevenLabs generation, staff asset import, or a member-facing player. No provider audio was generated and no credits were spent.

## Non-negotiable activation gates

`PODCAST_RENDER_MODE` defaults to `disabled`. A key in the environment can never activate the feature.

| Mode | Additional mandatory gates | Intended use |
| --- | --- | --- |
| `disabled` | None | Shipped default; all render attempts fail before any provider client call. |
| `cost_measurement` | Exact `PODCAST_COST_MEASUREMENT_EPISODE_ID`, explicit cost-measurement approval, non-zero daily credit cap, approved private storage, approved assets/recitation, connected report adapter and ffmpeg worker approval | One bounded, named measurement run. |
| `production` | All shared gates plus explicit production approval | Normal queued production after owner accepts measured cost. |

Neither mode is enabled in `.env.example`, and no key name/value is added there.

## Upstream contract required from Hadith Research Agents

The current source tree has no Hadith Research Agents feature. The future integration must implement `getApprovedRevision({reportRevisionId})` and return exactly:

```js
{
  id: 'immutable-report-revision-id',
  status: 'approved',
  claimIds: ['approved-claim-id-1'],
  qualifiedReviewerId: 'verified-reviewer-id',
  approvedAt: 'ISO-8601 time'
}
```

The pipeline rejects absent/mismatched revisions, unapproved reports, malformed claims and scripts that reference a claim outside this exact revision. It does **not** invent an upstream report table or a qualified-reviewer flag.

The foundation requires a claim ID on every spoken line. This is intentionally stricter than the brief because code cannot reliably classify arbitrary prose as factual without using another AI judgment layer, which would weaken the rule.

## Implemented controls

- Strict JSON script validation: six database-provided cast IDs, fixed tone-tag allowlist, explicit whisper rejection, no Arabic Unicode in AI TTS text, abbreviated-honorific rejection, maximum line/SFX/reaction bounds, valid recitation slot and exact claim membership.
- Separate durable fields for script review, language review, recitation state, line cache QA, mix QA and listen approval.
- Server-only ElevenLabs client contracts: `POST /v1/text-to-speech/{voice_id}` with `eleven_v4`, `POST /v1/music` with **`music_v2_5`**, `POST /v1/sound-generation` with `eleven_text_to_sound_v2`, and `POST /v1/speech-to-text` with **`scribe_v2`**. The earlier brief’s `eleven_music_v2_5` and `scribe_v1` identifiers are not used.
- Hash cache key over language, speaker, voice ID, model ID and exact text; no text/audio/key enters job metadata or logs.
- ffmpeg timeline/mixer and QA helpers. The recitation channel remains dry—no generated voice, music, echo, compression or de-essing. A production worker must verify **ffmpeg 6+** before rendering.
- Storage interface accepts opaque private object keys only. Finished MP3s and cached clips have no BLOB columns and cannot obtain public URLs from the foundation.

## Storage decision for approval

### Recommended: dedicated private Cloudflare R2 bucket

Create a dedicated bucket such as `dragon-dawwa-podcast-private` after owner approval. Keep it private, grant the application a narrowly scoped write/read credential, and store only opaque keys such as `podcasts/episodes/<id>/final.mp3` and `podcasts/lines/<sha256>.mp3`.

The application will authenticate the member/reviewer, authorize access to the linked approved episode, then stream the object from the server with `Cache-Control: private, no-store`. It must not create public R2 URLs, bucket-public custom domains or signed URLs returned to the browser. Database rows retain only storage keys, integrity hashes and bounded metadata; finished MP3s therefore remain outside the 128 MiB daily database backup.

| Option | Upside | Downside / decision risk |
| --- | --- | --- |
| **Private Cloudflare R2 (recommended)** | Aligns with existing Cloudflare/R2 recovery footprint; no per-object public exposure; inexpensive storage; easy opaque-key design | Requires a separate least-privilege bucket credential, lifecycle/retention decision and an object-store restore test. |
| Private S3-compatible bucket | Same adapter and isolation model; portable across providers | New account/key/billing/operations overhead; no strategic advantage currently. |
| MySQL BLOB storage | Simple implementation | **Rejected**: would inflate daily backups and violate the brief’s database-backup constraint. |
| Public CDN/signed-link delivery | Low server bandwidth | **Rejected**: breaks the requirement that audio has no public URL and is served only through authenticated access. |

No bucket, credential, DNS record, lifecycle policy or paid storage operation was created in this phase.

## Measured-cost status: Bukhari 6306 Tamil

**Not measurable yet — no estimate is presented as a measurement.** A defensible full-episode measurement requires all of the following: the approved Bukhari 6306 report revision and its claim IDs, approved Tamil script, human recitation, approved imported asset library, approved private storage, ffmpeg 6+ worker, and the owner’s bounded `cost_measurement` authorization with a daily credit cap.

The brief itself prohibits spending before the owner approves a measured cost. The safe resolution is a one-episode, explicitly capped `cost_measurement` authorization after the storage decision: record provider `character-cost`/credit metadata per call in `podcast_jobs`, sum the final ledger, verify no cache miss on a rerun, and return that observed cost for approval before enabling production.

## Current verified constraints

- ElevenLabs documentation currently confirms `/v1/text-to-speech/{voice_id}`, `/v1/music`, `/v1/sound-generation`, `/v1/speech-to-text` and `GET /v1/models` request contracts.
- Safe read-only workspace checks found `eleven_v4` with Tamil and English listed, and the six stated Tamil IDs plus English Sarah available. No music, sound or transcription request was made.
- The repository’s prerequisite Hadith report workflow is absent; the addendum supplied on 7 October repeated the podcast requirements but did not supply that report/claim contract.
- The current repository Docker base has no approved separate ffmpeg-6 worker image. The mix module refuses an older runtime.

## What must happen next

1. Supply the actual Hadith Research Agents brief or merge its implementation, including report/claim/review APIs.
2. Approve one private object-store option and narrow credentials; then implement its adapter and authenticated episode endpoint.
3. Import/approve the existing canvas asset pack and human recitation(s) as private assets.
4. Build and validate the isolated ffmpeg 6+ one-at-a-time worker.
5. Approve one bounded Bukhari 6306 Tamil cost-measurement run; then report observed provider credits/cost and cache behavior before deciding production enablement.
