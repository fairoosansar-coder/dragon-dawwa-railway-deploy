# Editorial administration — new after version 7

This adds `/admin` and `/library` to the existing Dragon Dawwa Site. The new
library is linked from the home footer. Existing home readings, notebook,
government records, Arabic Quran text and Quran Foundation integration are
preserved. Publishing an editorial document does not change Site sharing.

## Workflow

1. Sign in to `/admin` with an authorized ChatGPT identity.
2. Create a draft in English, Tamil and/or Sinhala. A language can be omitted by
   leaving every field blank. Each included language needs a title, summary,
   plain-text body and actual author/translator attribution before submission.
3. Add HTTPS source references with titles, author/institution, passage locator,
   and a category: source text, translation, or interpretation/commentary.
4. Save and submit the exact saved revision for review. All submitted languages
   and source references belong to that revision's review.
5. A reviewer reads the material and records review notes. Request changes or
   explicitly confirm personal review and approve. Automated tests use labelled
   local fixtures; no real community content is approved automatically.
6. A publisher publishes the approved revision. It appears in `/library` only
   in languages actually supplied. Unavailable languages show an empty state;
   text is never silently machine-translated or relabelled.
7. Editing or restoring creates a new draft and invalidates approval. The last
   published snapshot remains readable until a new approval/publication replaces
   it or a publisher withdraws it. History is immutable through the API; older
   history pages can be loaded in the workspace.

The owner may self-review because this Site currently admits only its owner.
This is recorded by actor ID and role. It is **not independent review or
scholarly endorsement**. The workflow does not claim reviewer qualifications,
authenticity guarantees, or religious authority. Obtain qualified human review
where appropriate before publishing religious material.

## Server permissions

Sites dispatch owns sign-in and supplies `oai-authenticated-user-id` and
`oai-authenticated-user-email`. Authorization uses the stable Site-specific ID;
email is not an authorization key. Service access alone does not establish a
visitor identity and cannot administer content.

| Role | Permissions |
| --- | --- |
| Reader / unassigned signed-in visitor | Read published library only |
| Author | Create, read, edit, restore and submit their own documents |
| Reviewer | Read documents/history, request changes, approve submitted revisions |
| Publisher | Read documents/history, publish approved revisions, withdraw |
| Owner | All editorial actions; self-review is explicitly disclosed |

Role selection is server-side. Request bodies and browser controls cannot grant
permissions. Every mutation requires same-origin JSON, a bounded body, the
correct role/ownership, and the expected current revision. D1 transactional
writes and unique revision keys prevent stale or concurrent changes from
silently overriding newer work. Missing identity, configuration or database
fails closed; there is no browser-storage or memory fallback.

## Hosted configuration

- `.openai/hosting.json` declares logical D1 binding `DB`. Sites provisions it
  and applies committed Drizzle migrations before Worker deployment.
- Set `EDITORIAL_OWNER_ID` to the owner's verified **Site-specific** authenticated
  user ID through Sites runtime settings. `/api/admin/session` returns the
  caller's ID and role after sign-in; it performs no initialization or writes.
  Without this setting, unassigned users have no administration permission.
- Optional `EDITORIAL_ROLES` is a JSON object mapping verified Site-specific IDs
  to `author`, `reviewer`, or `publisher`. Default is `{}`. Do not use account IDs
  from the Sites sharing UI or email addresses as keys.
- Adding a role does not grant entry through Sites' audience. No new users or
  groups are admitted by this implementation. Sharing remains owner-private.
- Update only these keys through Sites. Preserve all Quran settings and secrets.
  Redeploy a saved version after changing runtime configuration.

## Storage and privacy

Editorial drafts, sources, review notes, immutable snapshots, actor IDs and
workflow timestamps are stored in this Site's server-side D1 database, unlike
home notebook data, which remains browser-local. Private draft/history APIs are
uncached and authorized. The published API returns only published content,
version, document ID and publication timestamp, never private review notes or
reviewer identities. Plain text is rendered with DOM text nodes, not HTML.

Withdrawal removes a reading from the library but retains its audit history.
There is intentionally no permanent deletion or silent history rewrite action.
The document list shows the latest 200 edited documents; revision history has
50-entry pages. R2/file uploads, reviewer invitations, scheduled publication and
migration of the original static readings are outside this release.

## Reproducible verification

Use the pinned pnpm 11.25.0 and Node >=22.13.0. On this Mac the bundled Node,
pnpm and Git paths are described in the original checkout's LOCAL_STATUS.md.

```sh
node --test scripts/check-editorial.mjs scripts/check-quran.mjs scripts/check-quran-ui.mjs
node scripts/check-research.mjs
pnpm exec tsc --noEmit --incremental false
pnpm build
```

`check-editorial.mjs` executes the generated migrations against SQLite and tests
permissions, ownership, review/approval gates, invalidation, withdrawal, restore,
concurrency, validation and fail-closed behavior. A separate actual Worker+D1
integration test (`check-editorial-http.mjs`) is restricted to loopback.

For a new local D1 database, apply the generated migration once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_speedball.sql
```

Local Vite sign-in uses `local_seedy`. An ignored `.dev.vars` can set
`EDITORIAL_OWNER_ID=local_seedy`. For built-Worker integration tests only:

```sh
pnpm start --port 8789 --var EDITORIAL_OWNER_ID:local_seedy --var 'EDITORIAL_ROLES:{"local_author":"author","local_reviewer":"reviewer","local_publisher":"publisher"}'
node scripts/check-editorial-http.mjs
```

The test creates and withdraws explicitly labelled local fixtures. It cannot run
against a hosted URL. Do not copy the local identity/roles or fixtures into Sites.
The generated archive excludes local runtime settings and local D1 state.
