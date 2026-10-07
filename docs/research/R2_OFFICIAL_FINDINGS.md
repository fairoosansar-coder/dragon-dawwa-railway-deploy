# Cloudflare R2 — official research findings

Collected 7 October 2026 for the Dragon Dawwa private podcast-store decision. These are provider facts, not a decision to create a bucket, issue a token, enable a domain, or accept a retention rule.

## Private-by-default access

Cloudflare states that R2 buckets are never publicly accessible by default; public access requires explicit enablement. It can be enabled through a custom domain or a managed `r2.dev` development subdomain. The `r2.dev` path is non-production and must be disabled if another public-access method is used. This supports a design with neither a custom domain nor an `r2.dev` endpoint, with media returned only through the authenticated Dragon Dawwa application.

Source: [Cloudflare R2 Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## Least-privilege token model

R2 S3-compatible credentials can be scoped to selected buckets. The documented `Object Read & Write` and `Object Read only` permissions are available for bucket-scoped S3-compatible API use. Cloudflare distinguishes them from broad admin permissions that can create/delete/list buckets or change bucket configuration. The secret access key is displayed once only.

Source: [Cloudflare R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/)

## Cost facts relevant to the design

R2 Standard storage is documented at $0.015 per GB-month, Class A operations at $4.50 per million and Class B operations at $0.36 per million. The stated Standard free tier is 10 GB-month, 1 million Class A operations and 10 million Class B operations per month. R2 egress is documented as free, but reads are still Class B operations. Infrequent Access adds data-retrieval charges and a 30-day minimum storage duration; it is not a default fit for active podcast playback.

Source: [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)

## Lifecycle facts

Lifecycle rules can expire objects or transition them from Standard to Infrequent Access. Cloudflare notes deletion/transition is typically applied within 24 hours but can be delayed, and lifecycle configuration is a bucket-level write action. Retention/deletion requires a separate owner decision; no lifecycle should be applied during the initial private-store pilot.

Source: [Cloudflare R2 Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## Provider encryption boundary

R2 documents automatic AES-256-GCM encryption at rest and TLS in transit, with Cloudflare-managed keys. This is useful infrastructure protection but does not replace Dragon Dawwa access control, application authorization, opaque-object-key design, audit logging, or a decision on object retention.

Source: [Cloudflare R2 Data security](https://developers.cloudflare.com/r2/reference/data-security/)
