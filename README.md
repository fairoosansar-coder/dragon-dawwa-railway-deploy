# Dragon Dawwa — private, source-grounded review candidate

Adapted from the verified version-8 handoff source at `0a9baadd6682fb30f8514fe06d25a998f881a853`. The original owner-private Site, DNS, production D1, credentials and publication state were not changed. The historical source README is preserved at [`docs/SOURCE_V8_README.md`](docs/SOURCE_V8_README.md); its old Sites Worker instructions **do not apply** to this review runtime.

The live local Preview runs `node server/index.mjs` on port 3000. It uses verified Manus OAuth sessions with database-backed logout/revocation, an exact-ID invitation list, a separate managed MySQL review database and server-only Quran Foundation/Gemini access. Quran.ai evidence comes from its public read-only MCP endpoint. Quran study is **AI-generated, not religious authority**; original/named evidence is separate from model prose and historical unreviewed home lessons are withheld. No visitor route or access policy makes this an authorized public launch.

## Routes and modules

| Area | Review path and implementation |
|---|---|
| Home, source-governed Quran reading and private evidence-backed study | `/`, `/quran`, `/study`; `lib/quran.mjs`, `server/quran-ai.mjs`, `server/gemini-study.mjs`, `server/study.mjs` |
| Published-only editorial readings and twelve link-only original-publisher resources | `/library`, `/library/:id`, `/resources`; `lib/editorial.mjs`, `server/manage.mjs` |
| 108-row government-source directory, entry detail and owner-supplied Jamia Kadheeja profile | `/mosques`, `/mosques/:serial`, `/mosque`, `/research` |
| Genuine-only events, participation, methods and policy pages | `/events`, `/events/:id`, `/participate`, `/about`, `/privacy`, `/terms`, `/sources`, `/accessibility` |
| Invited My Learning, opt-in local bookmark/Quran-marker imports, private export and deletion | `/member`, `server/member.mjs`; ordinary profile fields never confer a staff role |
| Unified staff hub, editorial, operations, owner study/report/usage panel | `/staff`, `/admin`, `/operations`; server-side role checks on every API |
| Provider-owned login/recovery and server-revoking **POST** logout | `/auth/login`, `/recover`, `/auth/logout`, `/auth/logout-all` |

The optional anonymous published-only visitor mode exists solely for a **second localhost-bound test** and is disabled for the real Preview. Mohideen Jumma Mosque has fifteen exact-name official entries; the directory labels these as one name group rather than falsely selecting one site.

## Reproducible checks and operator constraints

Use Node 22.13+, pinned pnpm 11.25.0 and the committed lockfile. Run `pnpm install --frozen-lockfile`, then `pnpm check:all` for nonpaid lint, TypeScript, unit/source checks and preserved Vinext build. Real-HTTP and paid-provider canaries in `scripts/check-master-*.mjs` are **operator-only**, bounded and use synthetic identities. Read [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) before interpreting results: a synthetic cookie is not a second human's actual OAuth enrollment.

Seven additive review migrations have been explicitly applied **only to the separate review MySQL**; startup verifies rather than modifying schema. Future schema changes require a paused review, confidential encrypted snapshot, an isolated restore and an explicit `scripts/migrate-review.mjs` run. `GET /healthz` is the unauthenticated probe; ordinary pages and APIs require a verified invited session. Runtime secrets must be configured through protected project settings, not committed, linked in public assets or pasted into chat. Gemini generation is disabled by default without a deliberate one-account canary and bounded owner quotas. See [`docs/OPERATIONS.md`](docs/OPERATIONS.md), [`docs/RETENTION.md`](docs/RETENTION.md), [`docs/DEPLOYMENT_DECISION.md`](docs/DEPLOYMENT_DECISION.md) and [`docs/STARTER_RESOURCES.md`](docs/STARTER_RESOURCES.md).

**Source checkpoint versus release:** Auto-publish was confirmed **OFF** on 5 October 2026, so the tested continuation may be saved to the managed `main` as an unpublished source checkpoint after final checks. The older `7bd5b91` checkpoint predates this continuation. A commit is not a durable invite-only host, and no purchase, DNS action, production data migration, public posting or new third-party registration has been authorized. See the exact proposed third-party stack and owner approval gate in `docs/DEPLOYMENT_DECISION.md`.
