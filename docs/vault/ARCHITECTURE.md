# Idea Vault 3.0 architecture and repository audit

Audit date: 2026-11-14 (Asia/Seoul). Status: proposed architecture; no feature implementation authorized. The master guide was read completely. Evidence below is repository inspection, not verification of production configuration or saved records.

## Current system

| Area | Observed implementation and evidence |
| --- | --- |
| Framework | Next.js 16.4.3 App Router, React/React DOM 19.3.0, TypeScript 5 ranges (`package.json`; installed Next package also 16.4.3). |
| Styling/graphics | Tailwind 4, Turbopack CSS loader, three.js 0.170 range. Shared CSS has separate portfolio and warm light/dark Vault palettes. Google fonts via `next/font`. |
| Rendering | `next.config.ts` enables Cache Components and Partial Prefetching. `/vault/page.tsx` reads Supabase cookies at request time under Suspense, then passes ideas to client `capture.tsx`. |
| Authentication | Supabase password login (`/login`), browser/server SSR clients; `/vault/:path*` proxy calls `getUser()` and compares email to server `ALLOWED_EMAIL`. No application signup or Google OAuth flow found. |
| Database | Supabase PostgreSQL accessed directly through Supabase clients; SQL defines `ideas` and `idea_files`. No ORM found. RLS scopes rows by `auth.uid()`. Actual deployed schema and policies remain unverified. |
| File storage | Private Supabase `attachments` bucket; configured 25 MiB per file. Metadata in `idea_files`; object paths `<user UUID>/<idea UUID>/<file UUID>-<sanitized name>`. Signed links last one hour, refreshed after 45 minutes on eligible checks. |
| Device persistence | IndexedDB `idea-vault`, version 1, store `outbox`: captures, actual File blobs, retry state/deletion intent. localStorage `vault-draft` and `vault-view`. Pending unsaved attachments and edit text are React memory. |
| Offline | Production-only root-scope service worker caches static assets and `/vault` navigation HTML; online-first page loading. Direct Supabase requests and file bytes are not cached by it. |
| Hosting | README describes any Next-capable host, with Vercel as example. No tracked CI/hosting configuration found. Existing `.next` output is not proof of deployment. Deployment host, domain, environment, backups, and runtime limits unknown. |
| Configuration | `.env.example` names Supabase URL, publishable key, allowed email. No `.env.local` found. No credentials requested or printed. |
| Integrations | No app Drive or external AI integration found. Connected tools in this agent session do not establish app integrations. |

## Existing routes and public boundaries

- `/`: public portfolio with hero/navigation, about, selected work, interactive motor explorer, Ohm lab, education/experience/contact, BYTE companion and terminal.
- `/projects` and `/projects/[slug]`: public case studies from static `src/lib/projects.ts` (waste-to-energy-lighting, cha-restaurant, idea-vault). These are not private database projects.
- `/start`: browser start page with clock, Google search and quick links; noindex metadata, but no authentication.
- `/login`: public password form. `/vault`: private capture workspace. No nested Vault pages or custom data API routes found.
- `/manifest.webmanifest`, `/pwa-icon/[size]`, `/sw.js`: PWA support.

Private workspace records must never be automatically published to public case studies. Preserve all these routes, root metadata, interactions, and palette isolation.

## Vault feature inventory

| Feature | Current source behavior | Limit / missing capability |
| --- | --- | --- |
| Quick capture | Text or attachment-only capture; Ctrl/Cmd+Enter; queue before clearing form | Text draft local only; unsaved files not durable until Save |
| Tags | Hashtag extraction, lowercasing, clickable tag counts/filter; array persisted | No separate tag-management entity |
| Status folders | Raw, Exploring, Building, Done, with counts and status selector | Hard-coded lifecycle; no archive/restore |
| Idea sparks | Local static prompts, shuffle/use and save celebration | Not AI-generated |
| Search | Debounced server `ilike` content search, tags/status filters, timestamp+ID cursor; 100 rows/page | Not full-text/unified/semantic search; server search needs connection |
| Attachments | Multiple files/photos, image preview, audio playback, signed links, add/remove on saved ideas | 25 MiB; no Drive; upload and metadata writes separate |
| Recording | MediaRecorder with format fallback, timer, stop/cancel and stream cleanup | Permission/browser dependent; no transcription |
| Views/counters | Saved list/grid preference; expanded card; total, status/tag counts, week count and streak | Counts derive from paginated metadata; read errors can look empty/partial |
| Edit/delete | Optimistic content/tag/status edits; confirmed permanent deletion; durable deletion retry | No history/conflict detection/soft deletion; edits require server access |
| Offline | New captures and attachments queued with fixed IDs; retry on reconnect/visibility/timer | Not a complete offline copy; per-device and origin; no owner field on queued items |

## Proposed architecture

Owner confirmed in conversation on 2026-11-14: keep idea text, tags and status in Supabase; use Google Drive for attachments and recordings. Concern is Supabase limitations; no particular quota usage or exhausted limit has been verified. This confirms the storage split, not a completed Drive connection or permission to delete legacy objects.

Keep the existing Next/React/Tailwind/Supabase stack and password login. Extend PostgreSQL additively; retain current IDs, content, tags, status, dates, and Supabase objects. Keep legacy browser sync compatible until queued records from supported devices are reconciled. Add a server-only data access layer for new private reads/mutations with validated session, owner checks, input validation, and RLS. Browser legacy access remains protected by audited database policies during transition.

Add project execution entities before external integrations. Use transactions for related database changes (especially conversion), owner-consistent foreign keys and optimistic concurrency. Files use provider-aware references: existing Supabase and future Drive records coexist. Drive OAuth, refresh tokens, uploads and AI credentials remain server-side. Use durable operation records for file operations that cannot share a database transaction; reconcile instead of deleting on ambiguous failure.

Session-derived reads remain request-bound or explicitly owner-scoped; never share private HTML/data across users. Installed guides consulted: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and `01-app/02-guides/authentication-with-cache-components.md`. Re-read relevant local guides before implementation; Proxy is not the sole authorization layer.

## Proposed UI structure

Desktop: 232px left navigation, top toolbar (search and quick capture), responsive main content, optional explicitly opened assistant drawer. Tablet: collapsible sidebar. Mobile: drawer with prominent quick capture; choose bottom navigation only after usability review. Use graphite surfaces and restrained orange within Vault; keep existing public styling. Preserve accessible focus, reduced motion, keyboard workflows and loading/empty/error/offline states. Preserve the existing light theme unless owner chooses otherwise.

| Route | Proposed content |
| --- | --- |
| `/vault` | Quick capture, real idea inbox; Resume Project, Today, recent files/activity appear as their data sources ship. Honest empty states; no fabricated progress. |
| `/vault/ideas`, `/vault/ideas/[id]` | Inbox, tags/status/search/sort, cards/list, later bulk actions. Detail: original capture, title/summary, notes, dates, links/history; edit/archive/restore/duplicate/export/explicit conversion. |
| `/vault/projects`, `/vault/projects/[id]` | Active/paused/complete projects and templates; Overview, Tasks, Journal, Files, Research, Decisions, AI as implemented. Manual next action and verified resume summary. |
| `/vault/engineering` | Engineering-filtered projects; component catalog, BOM revisions/prices, datasheets/pinouts, firmware Git references, measured experiments and safety checklist. |
| `/vault/animation` | Animation-filtered projects; assets, character bible, shots/scenes/storyboards, rigs, workflow and render logs. Local Blender work; Drive snapshots only. |
| `/vault/library` | Cross-project references, reusable assets, source and license metadata. |
| `/vault/search` | Owner-filtered results with source labels; start with DB text/metadata, extraction later. |
| `/vault/settings` | Account, backup/export/import, privacy; Drive and AI configuration only when implemented. |

Sidebar labels: Dashboard, Inbox, Projects, Engineering, Animation, Library, Search, Settings. Do not expose unfinished destinations as working features. All existing capture capabilities remain reachable during rollout. See ROADMAP for delivery boundaries.
