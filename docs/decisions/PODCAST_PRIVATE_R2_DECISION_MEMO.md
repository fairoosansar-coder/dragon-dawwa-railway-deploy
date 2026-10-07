# Decision memo — dedicated private Cloudflare R2 bucket for podcast audio

**Decision requested:** approve or reject a future, dedicated **Cloudflare R2 Standard** bucket for Dragon Dawwa podcast audio. This memo is a design decision only. It does not create a bucket, token, custom domain, lifecycle rule, worker, public route, provider key, or audio object.

## Recommendation

Approve a **separate private Standard-storage bucket** in the existing owner-controlled Cloudflare account, provisionally named:

```text
dragon-dawwa-podcast-private
```

Use it only after the Hadith report/reviewer gates, human recitation, asset approval, measured-cost authorization and production-render approval are separately met. Keep it separate from the existing encrypted database-backup bucket to isolate credentials, retention, blast radius and cost attribution.

## Why this is the balanced choice

R2 buckets are private by default, and public access requires an explicit action. A dedicated bucket permits bucket-scoped S3 API credentials, while a shared bucket would require the application to police prefixes in code and would mix backup recovery data with media access. Cloudflare’s documented `Object Read & Write` and `Object Read only` permissions can be scoped to specific buckets, but not to object prefixes; separation at the bucket boundary is therefore the primary least-privilege control. [1]

Use **Standard**, not Infrequent Access, for the initial pilot. The private player will read final episodes and staff may re-listen to QA copies. Standard has no retrieval charge or minimum duration; Infrequent Access adds a retrieval charge and 30-day minimum storage duration. [2]

## Required architecture

| Component | Required decision | Boundary |
| --- | --- | --- |
| Bucket | One dedicated `dragon-dawwa-podcast-private` bucket, in the owner-selected R2 jurisdiction | No database backups, general uploads or unrelated application objects in this bucket |
| Public exposure | No `r2.dev` URL; no custom domain; no R2-origin link in database/API responses | App routes authenticate the member/staff role and stream from the private S3 API using an opaque key |
| Render-worker credential | Dedicated **Object Read & Write** S3 credential scoped to this bucket only | Stored only as protected worker runtime variables after production approval; never frontend, Git, logs, or chat |
| Playback credential | Dedicated **Object Read only** credential scoped to this bucket only | Used only by the authenticated application delivery process; no client-side presigning or redirect |
| Provisioning authority | A short-lived, owner-controlled configuration action, not a production runtime token | Create bucket/token/lifecycle only through protected Cloudflare UI/API after owner approval |
| Object naming | Random/opaque keys, e.g. `episodes/<opaque-id>/final.mp3`, `cache/<content-hash>.mp3`, `assets/<asset-version>.mp3` | The database retains keys and metadata, never audio BLOBs, public URLs, provider text, or credentials |
| Encryption | R2 provider AES-256-GCM at rest and TLS in transit | This does not replace Dragon Dawwa authorization, authenticated streaming, audit records, or secure credential handling [3] |

The existing podcast storage adapter already models opaque-key private access. The final implementation should instantiate this R2 adapter only after the approval gates above; it must not fall back to a public URL or database BLOB.

## Security controls required before the first object

1. Confirm **Public URL Access: Not allowed**, no `r2.dev` public-development endpoint, and no custom domain. Cloudflare warns that a custom domain or `r2.dev` exposure makes bucket objects publicly reachable and that `r2.dev` must be disabled even when another access-control product is used. [4]
2. Create separate least-privilege object credentials for write/render and read/playback. Do not reuse the existing database-backup bucket credentials.
3. Store endpoint, bucket name and credentials only in protected runtime configuration. The application logs only safe operation metadata: opaque object ID, size, result code and request correlation ID—not script text, audio bytes, secret values, bearer headers or a direct object URL.
4. Enforce application authorization before every stream and return `Cache-Control: private, no-store`. Do not emit a redirect/presigned URL, because it bypasses the requested authenticated endpoint control.
5. Keep `PODCAST_RENDER_MODE=disabled` until the separate Bukhari 6306 Tamil bounded-cost run is explicitly approved. Storage approval alone does not permit an ElevenLabs call.

## Retention and lifecycle

**Initial setting: no lifecycle rule.** Cloudflare lifecycle rules can delete or transition objects but deletion is asynchronous and can be delayed. They are a bucket-level write action. [5] The owner should first approve a podcast retention policy that distinguishes: final private episode, regenerable TTS line cache, approved reusable asset, failed render artifact and human recitation source. No automatic deletion, storage-tier transition or legal/rights retention assumption should be made during the pilot.

## Cost exposure

Cloudflare currently documents Standard storage at **$0.015/GB-month**, Class A operations at **$4.50/million**, Class B reads at **$0.36/million**, and a Standard free tier of **10 GB-month, 1 million Class A and 10 million Class B operations each month**. R2 egress is documented as free, although reads still count as Class B operations. [2]

This means early private use is likely storage-cheap, but it is **not an audio-production cost quote**. R2 storage and playback are separate from ElevenLabs credits, ffmpeg worker CPU/RAM, audit storage and any other platform charges. The first full Bukhari 6306 Tamil render cost must be measured only after its script, human recitation, assets, report approval and bounded owner authorization exist.

## Approval choices

| Choice | Effect | Risk/reward |
| --- | --- | --- |
| **Conservative — defer** | Keep the current adapter unconfigured and all podcast work disabled | No new storage surface or cost; delays cost measurement and production proof |
| **Balanced — approve bucket design only** | Permit a dedicated private R2 bucket and least-privilege credential plan, but create nothing until report/cost gates pass | Preserves security architecture and readiness without allowing provider spend |
| **Aggressive — create a private empty bucket now** | Create the bucket, validate that public access is disabled, and stop before token issuance/rendering | Low direct storage cost but adds an account resource before upstream report and approval gates; not recommended unless ownership wants early operational readiness |

**Recommendation:** choose **Balanced**. It maximizes separation and reversibility while preserving the owner’s no-spend and disabled-pipeline controls.

## References

[1]: https://developers.cloudflare.com/r2/api/tokens/ "Cloudflare R2 Authentication"
[2]: https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 Pricing"
[3]: https://developers.cloudflare.com/r2/reference/data-security/ "Cloudflare R2 Data security"
[4]: https://developers.cloudflare.com/r2/buckets/public-buckets/ "Cloudflare R2 Public buckets"
[5]: https://developers.cloudflare.com/r2/buckets/object-lifecycles/ "Cloudflare R2 Object lifecycles"
