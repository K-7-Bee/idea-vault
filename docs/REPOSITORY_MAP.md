# Repository map — actual implementation

Audited 2026-11-15 (Asia/Seoul). Scope: current local repository, the attached Audit/Locate/Reuse/Repair request, the current final master prompt, existing plans and handoff history. No application changes, database calls, migration, deployment or deletion performed. New documents were checked for absence before creation; existing `docs/vault/` plans remain intact.

## Stack and configuration

| Actual path | Purpose/dependencies | Status and disposition |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Next 16.4.3, React/React DOM 19.3.0; Supabase SSR/client; Tailwind 4; TypeScript 5 range; three.js 0.170 range; ESLint 9. | Reuse. Installed Next version independently checked. No framework replacement justified. |
| `next.config.ts` | Cache Components, Partial Prefetching, Turbopack Tailwind loader, service-worker headers. | Reuse; authenticated cache behavior needs security tests. No deployment-specific credentials here. |
| `tsconfig.json`, `eslint.config.mjs` | Strict TS, `@/*` alias, generated Next types, Next ESLint presets. | Working checks; reuse. |
| `.env.example` | Supabase URL, publishable key, allowed email names only. | Reuse. `.env.local` is absent at audit time; no secret values printed. |
| `.gitignore` | Ignores env files except example, dependencies/build outputs, Vercel local config and backup artifacts. | Preserve. Hidden `.git` exists; no `.vercel`, `.github`, `.agents`, `.codex` directory/config found in this checkout. |
| `.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`, `node_modules/` | Generated/runtime/dependency artifacts. | Not authoritative source or deployment proof. Do not retire source based on generated-file duplication. |

## Routes, UI and content

| Actual path | Purpose and connections | Status / action |
| --- | --- | --- |
| `src/app/layout.tsx` | Root metadata, Geist fonts, global CSS, skip link. | Reuse. Public/private metadata separated in nested layouts. |
| `src/app/page.tsx` | `/`: Home; About/Work/Lab/Journey/Contact anchors; inline education/experience/social/contact data; static project cards; Vault footer login link. | Implemented; repair only approved sections. Not a DB-driven public projection. |
| `src/app/portfolio/hero.tsx` | Hero, falling screws, interactive K/themes, desktop nav, mobile menu; imports terminal event from companion. | Active, not abandoned. Falling-screw retirement is specified for future cleanup, not performed. |
| `src/app/portfolio/mobile-menu.tsx` | Toggleable small-screen navigation, Escape closes and returns focus. | Reuse. |
| `src/app/portfolio/companion.tsx` | Opt-in BYTE, native dialog terminal, local commands; `vault` navigates to `/login`. | Reuse/review. Commands/tips link to motor/Ohm/Lab and must change with any later cleanup. No external AI. |
| `src/app/portfolio/motor-explorer.tsx` | Lazy three.js/OrbitControls motor, SVG fallback, selected part controls, resource cleanup. | Active homepage demo. Archive before any approved retirement; only source consumer of three.js found. |
| `src/app/portfolio/ohm-lab.tsx` | React/SVG ideal DC demo with voltage/resistance inputs and calculated current/power. | Active homepage demo. Future retirement requested; not broken merely because unwanted. |
| `src/app/portfolio/fonts.ts`, `src/app/globals.css` | Shared portfolio font variables, theme, layout, responsive/reduced-motion/focus styles. CSS also scopes Vault/start-page themes. | Reuse. Changes must preserve `/start`, login and Vault. |
| `src/lib/projects.ts` | Static public `Project` type, three case studies, `getProject(slug)`. | Authoritative current public catalog. No private project CRUD, status or published field. Reuse content/rendering after owner validates publication eligibility. |
| `src/app/projects/page.tsx`, `src/app/projects/layout.tsx` | `/projects`: cards/navigation, public fonts/metadata. | Implemented; same static catalog as home. Layout's Engineering lab link depends on `/#lab`. |
| `src/app/projects/[slug]/page.tsx` | Case-study pages, static params, metadata, unknown-slug `notFound`, related links. | Reuse renderer; no publication authorization predicate currently. |
| `src/app/start/page.tsx`, `clock.tsx`, `search-form.tsx`; `src/lib/start-page.ts` | `/start`: system-theme clock/date, Google GET search, quick links to Vault/public portfolio/external apps. | Reuse; does not read private DB. Public even though noindex. |
| `src/app/login/page.tsx`, `layout.tsx` | `/login`: Supabase password form and allowed-email denial message; metadata noindex. | Reuse existing auth; errors surfaced. No signup/reset/OAuth app flow found. |
| `src/app/vault/page.tsx`, `layout.tsx` | `/vault`: request-time Supabase idea query under Suspense, all-idea metadata index, private metadata and worker registration. | Implemented capture workspace, not project dashboard. Initial read errors are discarded. |
| `src/app/vault/capture.tsx` | Capture, edit/delete, upload/remove, tag/status/content filters, pagination, queue replay, counts, prompts, list/grid and keyboard shortcuts. | Main authoritative client controller; reuse and target specific error/recovery gaps. No duplicate controller found. |
| `src/app/vault/status.ts`, `sparks.ts`, `icons.tsx`, `fonts.ts` | Status presentation, local prompt/cheer lists, SVG icons and typography. | Reuse. Actual status values originate in `src/lib/ideas.ts` and SQL, not only labels. |
| `src/app/vault/use-recorder.ts`, `use-online.ts`, `use-local-value.ts` | MediaRecorder lifecycle, connectivity subscription, local draft/view state. | Reuse. Draft/queue ownership and unsaved file limits require repair design. |
| `src/app/vault/logout-button.tsx` | Deletes origin caches, signs out, redirects to login. | Repair: ignores returned sign-out error and does not resolve pending drafts/queue. |
| `src/app/favicon.ico`, `public/k-mark.png` | Existing public icons/branding. | Preserve. No certificate scan, résumé PDF or project-photo asset found in public assets. |

## Auth, persistence and API boundaries

| Actual path | Purpose/dependencies | Status / action |
| --- | --- | --- |
| `src/proxy.ts` | `getUser()` refresh + server `ALLOWED_EMAIL` check on `/vault/:path*`. | Reuse navigation guard; not sufficient as sole owner authorization layer. |
| `src/lib/supabase/server.ts`, `client.ts` | Supabase SSR cookie and browser clients using public URL/publishable key. | Reuse. Existing DB access is direct SDK/PostgREST, not custom API CRUD. |
| `supabase/schema.sql` | `ideas`, UUID/auth owner FK, checked status, timestamps, index, RLS. | Existing bootstrap; do not rerun/reset live. Deployed schema unverified. |
| `supabase/002_tags.sql` | Adds tag array/index, backfills hashtags from content. | Existing migration; rerunning/backfilling can overwrite tags. Preserve. |
| `supabase/003_files.sql` | Private 25 MiB attachments bucket and UID-prefix policies; `idea_files` with FK/cascade and RLS. | Preserve; parent/path integrity policy gaps require isolated tests and a reviewed additive repair. |
| `src/lib/ideas.ts`, `tags.ts` | Row types/columns/statuses, file signing/formatting/sanitization, Unicode tag parsing. | Reuse. Signing helper currently drops error information. |
| `src/lib/outbox.ts`, `sync.ts` | IndexedDB `idea-vault` v1/outbox, durable capture/file/tombstone queue; Supabase upload and deletion retries. | Reuse existing workflow. No owner field in queue; DB/object changes are not atomic. |
| `src/app/sw-register.tsx`, `public/sw.js` | Production root-scope worker; cached Vault HTML and static assets; online-first page fetch. | Repair privacy/cache ownership and failure handling without erasing pending data. |
| `src/app/manifest.webmanifest/route.ts`, `src/lib/vault-manifest.ts` | Public manifest GET route delegates to manifest utility. | Both used; not duplicate/abandoned implementations. |
| `src/app/pwa-icon/[size]/route.tsx` | Public generated icon GET route (Next image response). | Reuse; does not expose private content. |

There is no `src/app/api/` tree, no custom private API route, no Server Action module, and no app OAuth callback found. Future API endpoints will need their own auth checks; the existing proxy matcher will not protect arbitrary `/api/*` routes.

## Tests, tools, documentation and hosting

| Actual path | Purpose | Status / action |
| --- | --- | --- |
| `tests/vault.test.mjs` | Five mocked/source-driven deletion/pagination/recording regression tests. | Passing; retain; no live RLS/browser proof. |
| `tests/start-page.test.mjs` | Three clock-greeting/search/helper/source checks. | Passing; retain. Historical BUG-001/002 in handoff were fixed; not reopened here. |
| `tests/preservation.test.mjs` | Five crypto/inventory/local extraction/simulated device-export tests. | Passing; retain. No actual production restore verified. |
| `scripts/vault/preservation.mjs`, `backup.mjs`, `export-device.js`, `README.md` | Local preservation tools from prior work; encryption/hash/local comparison/extraction, offline read-only device download. | Reuse subject to documented 256 MiB/memory/ACL limits. No Supabase exporter/automatic live restore. |
| `docs/vault/ARCHITECTURE.md`, `DATA_MODEL.md`, `MIGRATION.md`, `SECURITY.md`, `ROADMAP.md`, `DECISIONS.md`, `TEST_PLAN.md`, `PROGRESS.md`, `PRESERVATION_STATUS.md` | Earlier inventory and proposed 3.0 design, risks and backup gate. | Historical plans, not implemented features. Propose reconciliation; do not treat proposed schema/routes as existing. |
| `PORTFOLIO_IDEA_VAULT_FINAL_MASTER_PROMPT.md` | Future connected Portfolio Manager/project publishing/Story Studio specification. | Requirements, not source implementation. Its alternative palette and phase sequence need reconciliation with earlier plans. |
| `AGENTS.md`, `README.md`, `admin.md`, `shared-file.md`, `Custom Browser Start Page.pdf` | Agent rules, setup, owner decisions, historic verification/handoff, start-page brief. | Reuse. Old handoff clean-worktree/no-decisions status was stale. The PDF is not a résumé/certificate. |

`IDEA_VAULT_3_CODEX_MASTER_GUIDE.md`, referenced by AGENTS and earlier plans, is absent now (it was read earlier in this conversation). It was untracked previously, so absence does not prove a Git deletion. Do not recreate a purported authoritative original silently.

Owner previously confirmed production URL `https://kaushik-kamal.vercel.app/vault`, use on phone and PC, and Vercel/Supabase connection. Hosting settings, environment values, actual DB policies and live records are not independently verified. No tracked CI/deployment manifest was found. No app Drive/Gemini integration, credentials or external AI calls found. All declared runtime dependency families have current consumers; no dependency removal is justified in this audit.
