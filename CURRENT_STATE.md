# CURRENT_STATE — Dragon Dawwa

Export date: 5 October 2026. This file distinguishes what the packaged tree contains from what has been verified on the owner-private Site.

## Source used

Latest reachable reconciled source is private repository `fairoosansar-coder/dragon-dawwa-railway-deploy`, `main`.
The mirror commit `b849aea3c8d4f220196e4df03d3dbcc623a09b45` records private source `e3393f48639d7237645bb01ec3ccd87294d258b2`, adapted from Sites version-8 handoff `0a9baadd6682fb30f8514fe06d25a998f881a853`.
This is newer than checkpoint `7bd5b91`. A version-6 export and `local-launch-fixes` were not used.
The Mac checkout `/Users/dragonx/Documents/Codex/dragon-dawwa-release` was not readable. Any uncommitted work there is absent and was not discarded from that machine; it is simply not in this package.

Hosted site `https://dragon-dawwa.feroz1890.chatgpt.site` returned 401 on 5 October 2026. Audience, DNS, credentials and publication state were not changed. Live version was therefore not re-confirmed in a browser.

## Implemented in this tree

- Multilingual routes for home, Quran, study, library, resources, mosques, research, events, participation, about, privacy, terms, sources, accessibility.
- Server modules for Quran, editorial, member, study, and staff/admin APIs.
- Schema and migrations for editorial and community data (`migrations/`, `drizzle/`).
- Government-source mosque directory data and census explorer notes (108 Anuradhapura records; Jamia Kadheeja serial 97).
- Invite-based Manus OAuth review runtime (`server/index.mjs`), not the original Sites Worker build.
- Env template with names only (`.env.example`).
- Acceptance, operations, retention and deployment notes under `docs/`.
- ESLint config is present (`eslint.config.mjs`). Whether `pnpm check:all` passes was not re-run in this packaging environment.

## Verified only as recorded, not re-run here

- README states auto-publish was confirmed off on 5 October 2026.
- README states review migrations were applied only to a separate review MySQL.
- `docs/ACCEPTANCE.md` and `docs/SECOND_USER_MOBILE_ACCEPTANCE.md` are prior evidence. A synthetic cookie is not a second human OAuth enrollment.
- This package has not been tested inside Manus.

## Partially verified or stale in archived notes

- `docs/SOURCE_V8_README.md` still describes a prelive Quran catalogue (Al-Fatihah and Al-Baqarah) and says production was not claimed. The owner brief says production keys are configured in the Sites runtime. Treat the archived readme as historical. Re-verify the production catalogue, including Tamil resources 229, 50 and 133. No Sinhala Quran translation resource was reported.
- Audio playback, pause, single-recording behaviour and reciter changes were previously unverified because of Play and passkey blockers. Do not repeat those as current facts without a new check.

## Not in this package

- Quran client id and secret. They remain in the Sites secret store.
- Live editorial rows in Sites D1 and the separate review MySQL. Schema is here; row data is not. Do not infer that drafts, approvals or submissions moved.
- Browser sessions, API tokens, private keys, `node_modules`.
- Uncommitted files on the Mac checkout.

## Editorial migration, if authorized later

Export D1 or review MySQL separately, encrypted, with owner approval. Do not place that dump inside this source archive. Restore only into the new review database after a snapshot. Startup in this tree verifies schema; it should not silently migrate production.
