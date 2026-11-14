# Idea Vault and public portfolio — current architecture

Audit date: 2026-11-15. This document maps source behavior and separates future requirements. It does not certify production security, data integrity or connected integrations.

## How the existing application works

```mermaid
flowchart TD
  Public[Public routes: home and projects] --> Catalog[Static src/lib/projects.ts]
  Public --> Login[Footer or terminal: /login]
  Start[/start quick link] --> Guard
  Login --> Auth[Supabase password auth]
  Auth --> Guard[/vault proxy: getUser and allowed email]
  Guard --> SSR[Vault page: server client and Suspense]
  SSR --> DB[(Supabase ideas and idea_files with RLS)]
  SSR --> UI[Existing Capture client]
  UI --> Queue[(IndexedDB outbox and File bytes)]
  Queue --> Sync[Existing sync and retry helpers]
  Sync --> DB
  Sync --> Files[(Private Supabase attachments bucket)]
  UI --> Files
  Worker[Production service worker] --> Cache[(Vault HTML and static asset cache)]
```

Public pages never import the Supabase data clients. The current connection is shared application/routes, login links, shared styles/fonts/branding and a static public case study explaining Vault. It is **not** a project-data/publishing bridge. The static catalog is reused by home, index, detail, metadata, generated slugs and related-project links. `Companion` separately repeats a project-name list in its terminal.

## Existing data lifecycle

1. `/login` calls Supabase `signInWithPassword`; the SSR helpers manage cookie sessions. `/vault` proxy verifies user/email. DB and Storage policies apply separately to direct client requests.
2. `/vault/page.tsx` fetches 100 complete ideas and a paginated metadata index in chunks of 1000. `withFileUrls` creates one-hour signed attachment URLs. Source queries rely on RLS for owner scoping; there is no additional allowed-owner check in `VaultContent`.
3. `Capture` manages the existing UI and queries Supabase directly. Content search is debounced `ilike`; tags use array containment; status uses equality. Timestamp+ID cursors handle tied dates. This is not unified full-text or semantic search.
4. Save writes a fixed-ID record and actual File blobs to IndexedDB before clearing the composer. Sync inserts the idea, uploads each file, inserts metadata and retries with the same IDs. Per-file failure retains the queued capture. Draft text uses localStorage; unsaved attachments/edit text/active recordings remain in memory.
5. Edits/status changes write directly to Supabase with optimistic UI/rollback on returned errors. There is no revision check/history or durable edit queue.
6. Confirmed idea deletion writes a durable tombstone, then removes objects before deleting the idea row. File removal similarly removes bytes before metadata. Cross-service failure can leave missing bytes with surviving metadata; there is no soft delete/restore.
7. The service worker can serve previous `/vault` HTML offline without a fresh server check. Cache and queue identity are not user-bound. Logout clears origin Cache Storage but leaves queue/draft storage and ignores the sign-out result. This needs a preservation-aware privacy repair, not blanket device-data deletion.

## Actual schema versus requested workflow

| Concern | Source-defined state | Requested rule / consequence |
| --- | --- | --- |
| Ideas | `ideas`: UUID, user_id, content, tags, status, created_at. `idea_files`: UUID, idea_id, user_id, path/name/MIME/size/date. | Preserve every existing value/ID/file and browser queue. Nine expected records still not verified live. |
| Statuses | SQL check and `src/lib/ideas.ts`: raw, exploring, building, done; presentation in `status.ts`. | Owner requires Exploring → Analyzing → Building → Completed for project workflow. Do not map raw to Analyzing or relabel existing values silently. Clarify idea-vs-project lifecycle and deployed schema first. |
| Private projects | No private Project table/CRUD/model found. `src/lib/projects.ts` is a public static content type. | Reuse confirmed live project logic if it exists outside this checkout; otherwise report the gap and obtain approval for a minimal extension, not a parallel database. |
| Publication | No published/completed flags, preview, snapshots, unpublish or cache invalidation path. A source comment calls catalog content published but enforces no rule. | Only Completed AND explicitly Published may be public. No private records currently flow through this absent bridge; absence is a requirement gap, not proof of a private-data leak. |
| Storage | Supabase private bucket plus DB metadata and device queue. | Owner confirmed Drive for attachments/recordings; Supabase for idea text/tags/status. Retain original bytes until verified backup and separately approved transfer. |

## Proposed minimal future connection (not implemented)

Keep one application, one login and one Supabase database. Resolve real project schema before designing additions. Preserve the existing capture controller, helpers and rows; add only reviewed missing functionality after backup/restore. Keep project execution stage independent from publication state.

The publication boundary should resolve a trusted current project with `status = completed` and explicit published approval, then return only an allowlisted public snapshot. Private notes/chats/source files never become public through whole-record serialization. Public media must be a separately approved public derivative or authorized public-serving reference; never reuse private signed download URLs or Drive originals as showcase media by default.

Use the same eligibility predicate for cards, direct details, metadata/OpenGraph, static generation, related links, journal/teaser references and media. Unpublish/revert status must revoke delivery and invalidate app/CDN caches with a tested strategy. Do not simply add client-side filtering or trust a stale snapshot's eligibility. Exact schema and caching design await owner approval and installed Next documentation review.

Existing static cards/case-study layouts can render that projection later. Until eligibility of the three existing public entries is explicitly confirmed, do not auto-import them as Completed/Published or silently hide them in this audit.

## Future layout notes for review only

These are conceptual arrangements for later approval, not a redesign implemented now:

```text
Public: existing header/nav
        verified identity and introduction
        About / Education / actual Experience
        eligible approved project cards -> existing case-study renderer
        Journal only when approved content exists
        Contact / resume only when supplied

Private: existing login -> existing Vault
         existing idea capture/list and preserved idea folders
         future Portfolio Manager:
           section chooser | draft fields | saved preview
           completed-project queue | curated showcase fields
           explicit Publish / Unpublish | history / rollback
```

The final prompt calls for no public screws, Ohm demo or decorative motor. Inventory shows they are active with nav/terminal/CSS links; archive and remove only in an approved cleanup stage. Keep the existing responsive navigation/font/metadata infrastructure. No new public chatbot or 3D creation module is justified.

## Planning reconciliation before implementation

Earlier `docs/vault/` documents propose raw/exploring/building/done ideas plus active/paused/complete projects and Animation Studio. The new prompts specify Exploring/Analyzing/Building/Completed, Engineering/Story/Hybrid types, Story Studio and Portfolio Manager. These are not interchangeable labels or existing schema. Latest user requirements govern the next approved plan; earlier proposals must be updated explicitly rather than implemented verbatim.

The final prompt also names Gemini, while earlier planning leaves AI provider undecided, and appends a palette that differs from its charcoal/cyan paragraph and the earlier graphite/orange Vault design. No AI integration or visual choice is enabled by this audit. Restore the absent original guide or confirm which retained requirements remain authoritative before future development.
