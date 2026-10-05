# MANUS START HERE — Dragon Dawwa

Owner: Feroz
Role: take ownership of implementation, testing, and delivery of the first community-ready release.
Do not rewrite the application only to match a template. Preserve working behaviour, provenance, and security.

## Source this package is

This archive is the latest reachable reconciled tree:

- Repository: fairoosansar-coder/dragon-dawwa-railway-deploy
- Branch: main
- Tree SHA at packaging: see HANDOFF_MANIFEST.md
- It is adapted from the verified Sites version-8 handoff commit `0a9baadd6682fb30f8514fe06d25a998f881a853`.
- Historical Sites notes are in `docs/SOURCE_V8_README.md`. Those Sites Worker build instructions do not apply to this review runtime.
- The owner-private Site https://dragon-dawwa.feroz1890.chatgpt.site (project `appgprj_6ac1b39f751881919376fe2236ba133d`) was still returning 401 on 5 October 2026. Do not change its audience, DNS, credentials, or publication state.

Local path `/Users/dragonx/Documents/Codex/dragon-dawwa-release` was not reachable from the packaging environment. Uncommitted work on that Mac, if any, is not in this archive. Do not treat an older version-6 export or `local-launch-fixes` as newer than this tree.

## Start

1. Inspect this tree before replacing anything.
2. Node 22.13+, pnpm 11.25.0, `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to a local secret store. Names only were packaged. Never commit values.
4. `pnpm check:all` for lint, TypeScript, unit checks, and the preserved build.
5. Live Preview is `node server/index.mjs` on port 3000. Paid-provider canaries are operator-only.
6. Read `CURRENT_STATE.md`, `docs/ACCEPTANCE.md`, `docs/OPERATIONS.md`, `ADMINISTRATION.md`.

## Product rules

- Free Islamic learning platform: English, Sri Lankan Tamil, Sinhala. Calm, mobile-first.
- Arabic Quran text is source. Name every translation and author.
- Tamil resource IDs previously listed: 229 Omar Sharif bin Abdul Salam, 50 Jan Trust Foundation, 133 Abdul Hameed Baqavi. Re-verify.
- Do not generate a Sinhala Quran translation.
- Do not invent hadith references, grades, scholar endorsements, speakers, dates, or mosque endorsement.
- Census figures are public aggregates, not membership.
- Jamia Kadheeja Jummah Mosque: registration R/2141/A 112, government serial 97, 516/23 Udhaya Mawatha, 2nd Building, Anuradhapura. Recheck https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/ANURADHAPURA-DISTRICT.pdf before changing facts. Directory has 108 records. Keep original serials.
- Owner access is not a scholar credential.
- No new paid subscription is authorized by this brief.

## Quran secrets

`QURAN_CLIENT_ID`, `QURAN_CLIENT_SECRET`, `QURAN_ENVIRONMENT=production` exist only in the Sites runtime. They are not in this archive. If you stay on that Site, reuse its secret store. If you move host, ask the owner to enter secrets in the new protected settings. Never request secrets in chat.

## Editorial data

Do not assume live D1 or review MySQL rows are in this zip. Schema and migrations are included. An authorized migration of editorial records must be a separate export, with owner approval. See CURRENT_STATE.md.

## Delivery bar

Working review URL, secure admin setup, source, release id, implemented list, real acceptance results, unverified items, owner inputs still needed, costs, and a launch recommendation. Do not call it market-ready while audio, auth, or review flows are unverified.
