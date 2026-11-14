# IDEA VAULT 3.0 — CODEX MASTER IMPLEMENTATION GUIDE

## Product objective
Rebuild the existing private `/vault` inside the portfolio as a personal R&D workspace for embedded engineering, 3D animation, and other ideas. Preserve existing data, authentication, and working capabilities. Google Drive stores user files; a database stores structured app data and Drive file metadata. AI assistance is optional, contextual, permission-limited, and never silently changes user files.

## Non-negotiable operating rules for Codex
1. Inspect the repository, dependencies, routes, auth, schema, hosting, storage, and deployment setup first. Do not assume a tech stack.
2. Audit the current `/vault` features: quick capture, tags, status folders (Raw, Exploring, Building, Done), idea sparks, search, attachments, recording, list/grid views, and counters.
3. Identify where the nine existing ideas and attachments are persisted. Back up and test restoration BEFORE migrations. Never delete or reset live data.
4. Create `docs/vault/ARCHITECTURE.md`, `DATA_MODEL.md`, `MIGRATION.md`, `SECURITY.md`, `ROADMAP.md`, `DECISIONS.md`, `TEST_PLAN.md`, and `PROGRESS.md`. Keep an `AGENTS.md` concise, pointing to these documents.
5. Implement in small, testable phases. Before each phase, present scope, files affected, risks, acceptance tests, and rollback. Avoid sweeping rewrites.
6. Preserve the existing portfolio, public routes, and styling unless a specific change is approved.
7. Never invent credentials or claim integrations are connected. Use environment variables, least-privilege OAuth, and server-side token handling.
8. Do not call external AI models or mutate Drive data without explicit user configuration and authorization.
9. Do not claim features work until automated tests and manual verification pass.
10. At the end of each phase update `PROGRESS.md` with successes, failures, fixes, remaining issues, and the next action.

## Product information architecture
- Dashboard `/vault`: quick capture, resume project, current tasks, recent files, idea inbox, active projects, optional AI entrypoint.
- Ideas `/vault/ideas`: inbox, full-text search, tags, filters, sorting, cards/list, bulk actions; idea details and conversion to project.
- Projects `/vault/projects`: list, filters, templates, active/paused/complete; detail `/vault/projects/[id]` with Overview, Tasks, Journal, Files, Research, Decisions, AI.
- Engineering Lab `/vault/engineering`: filtered engineering projects; BOM, parts inventory, datasheets, pinouts, firmware repo links, experiment/test logs, measurements, safety checklist.
- Animation Studio `/vault/animation`: animation projects; characters, reusable assets, shots, scenes, storyboards, rigs, Blender file references, render logs, continuity notes.
- Knowledge Library `/vault/library`: cross-project references, source metadata, notes, linked documents, reusable assets.
- Search `/vault/search`: unified results with source labels and permission filtering.
- Settings `/vault/settings`: account, Drive connection, AI provider configuration, export/import, privacy, backups.

## Layout and interaction design
Desktop: fixed 232px left sidebar (Dashboard, Inbox, Projects, Engineering, Animation, Library, Search, Settings), top toolbar with global search and quick capture, main responsive content area, optional right contextual assistant drawer. Tablet: collapsible sidebar. Mobile: bottom navigation or drawer and prominent quick capture. Keep dark graphite surfaces with restrained orange highlight, readable contrast, accessible focus rings, keyboard shortcuts, loading/empty/error states, and consistent spacing. Avoid dashboards dominated by vanity metrics. Use real data only; no fake progress or fabricated counts.

### Dashboard widgets
- Quick capture: one-line idea, optional detail, tags, voice note and attachment; autosave drafts locally if safe, explicit Save to persist.
- Resume Project: last activity, last successful step, unresolved blocker, next actionable task, recent files.
- Today: overdue and upcoming tasks, no fabricated AI priorities.
- Recent activity: audit-friendly timeline of project and file changes.
- Idea inbox: unprocessed ideas with one-click classify or convert.

### Idea detail
Title, summary, original capture, tags, type, status, created/updated dates, linked projects, references, notes, versioned activity. Actions: edit, archive, duplicate, convert to project, export. Do not silently auto-convert.

### Project detail
Header with name, category, status, last edited, next action; tabs Overview, Tasks, Journal, Files, Research, Decisions, AI. Engineering and Animation add domain-specific tabs. Every project should support a manual next action and a `Resume Project` summary assembled from verified activity.

## Domain-specific requirements
### Embedded engineering
- Component catalog: part number, manufacturer, vendor URL, quantity, cost/currency, voltage/current limits, datasheet Drive file reference.
- BOM with revision, subtotal and unknown-price flags; never invent prices.
- Experiment log: objective, setup, firmware commit, measured values with units, outcome, issue, corrective action, attachments.
- Firmware references: Git repo URL, branch/commit, board, toolchain, build notes; do not use Drive as a replacement for Git.
- Circuit and electrical calculator tools are optional; if added, require input validation, unit display, and tests. AI wiring advice must be reviewed against datasheets and electrical safety constraints.

### 3D animation
- Asset records: characters, hair, clothes, rigs, props, environments, actions; ownership/license, source, format, versions, thumbnail, Drive file ID.
- Character bible: visual reference, proportions, clothing, rig compatibility, facial expressions, consistency checklist.
- Shot list: scene, shot, storyboard, duration, status, assigned assets, Blender file link, render output, notes.
- Rig and workflow journal: successful script/configuration, tested Blender version, failed approaches and reproduction steps.
- Store `.blend` files and renders in Drive as snapshots/backups; work locally in Blender. Warn about sync conflicts and file sizes. Do not imply the web app renders Blender files by itself.

## Google Drive architecture
- Use Google OAuth authorization code flow with PKCE where appropriate, secure state validation, encrypted token storage server-side, refresh handling, revocation, and disconnect flow.
- Prefer the narrowly scoped `drive.file` permission when suitable. Explain limitations for files not created/opened with the app. Add a picker/import flow if necessary; request broader scopes only with explicit rationale and approval.
- Create a designated app root folder on Drive after user authorization. Under it create `00_Inbox`, `01_Projects/Engineering`, `01_Projects/Animation`, `02_Research`, `03_Reusable_Assets`, `04_Archive` as needed, not on every page load.
- Store Drive file ID, project ID, name, MIME type, size, checksum when available, modified time, and sync state in database. Use stable IDs, not paths, as identity.
- Support resumable upload for large files, pagination, retry/backoff, quota errors, expired tokens, permissions errors, disconnected accounts, deleted/moved files, and duplicate names.
- Avoid public sharing by default; signed/server-authorized access where feasible. Do not embed refresh tokens in client bundles or logs.
- Document storage limits and backup/export strategy. Database backups and Drive backups are separate concerns.

## Data model (adapt to existing DB)
User, Idea, IdeaTag, Project, ProjectMember (optional for future), Task, Milestone, JournalEntry, DecisionRecord, Experiment, Component, BOMLine, AnimationAsset, CharacterProfile, Shot, ResearchSource, FileReference, ProjectFileLink, ActivityEvent, AIConversation, AIMessage, DriveConnection, AuditEvent. Use UUID IDs, timestamps, foreign keys, owner scoping, soft deletion for recoverable content, indexes on common filters. Preserve legacy idea IDs with migration mapping.

## AI assistant design
- Explicitly invoked by user; context selector (current project, chosen files, selected notes), model/provider configuration and visible cost/usage indicators where supported.
- Modes: Engineering Review, Animation Workflow, Research Summary, Project Planner.
- Retrieval: first structured DB metadata and notes, then selected document text; cite source titles/IDs and flag unavailable sources. Do not claim the model has read an unprocessed file.
- AI outputs are proposals, never automatic truth. Provide Accept/Reject for suggested tasks, edits, and plans.
- Permission tiers: read-only answer; draft proposal; user-approved mutation. No automatic destructive action.
- Protect against prompt injection from documents; uploaded content is data, not instructions. Redact secrets from prompts/logs; rate-limit calls and cap context sizes.
- No background agent until explicit user need, monitoring rules, budget, and cancellation controls exist.

## Search
Phase 1: database text search across ideas, project names, notes, task titles, tags, and file metadata with filters. Phase 2: optional text extraction for supported file types, with permission checks, size caps, and indexing status. Do not claim semantic search or PDF understanding without actual implementation.

## Security and privacy
- Protect all `/vault` routes and server APIs; enforce ownership on every query, not just UI gating.
- CSRF/state protection for OAuth and state-changing requests, rate limits, upload size/type checks, content security policy, XSS-safe rendering, secret management, audit logs, and export/delete controls.
- Never place Drive tokens or model API keys in browser storage. Avoid exposing private file URLs through public portfolio pages.
- Include a threat model for unauthorized project access, OAuth token theft, malicious file uploads, and prompt injection.

## Recommended incremental delivery
### Phase 0 — Discovery and preservation
Inspect repo and existing UI, map data flows, create backup/restore test, document architecture, confirm design and migration plan. Gate: zero data loss and working baseline tests.
### Phase 1 — Foundation and UX
Build shell, responsive nav, dashboard, idea inbox/detail, search, project model, idea-to-project conversion. Gate: existing nine ideas visible and editable.
### Phase 2 — Project execution
Tasks, milestones, journal, decisions, Resume Project, activity timeline. Gate: complete an end-to-end project workflow without AI.
### Phase 3 — Drive integration
OAuth, designated folders, file metadata, upload/link/download, connection recovery, permission errors. Gate: authorized file can be uploaded and retrieved, and disconnect works safely.
### Phase 4 — Specialized labs
Engineering BOM/experiments and animation assets/shots/character bible, project templates. Gate: complete sample workflows for both domains.
### Phase 5 — AI assistant
User-invoked modes, selected context, source citations, proposal review, token/usage controls. Gate: no unapproved file or DB changes.
### Phase 6 — Polish and release
Accessibility, performance, backup/export, error monitoring, security review, responsive QA, documentation, deployment and rollback.

## Test and acceptance checklist
- Existing ideas, tags, status, dates and attachments survive migration and restore.
- Authenticated user can capture, edit, search, archive and restore an idea.
- Convert idea to project without deleting original; link both records.
- Project has tasks, journal entries, decisions, and next action; Resume Project reflects actual saved data.
- Engineering project can save a component, BOM line, and measured test log.
- Animation project can save a character, reusable asset, shot and Blender file reference.
- Drive upload, listing, preview/download, reconnect, token expiry, permission denial, quota failure, and delete/move behavior are handled.
- Unauthorized user cannot read or mutate project records or files.
- AI cannot act on unselected private files or silently overwrite content.
- Mobile and keyboard workflows pass accessibility checks; no broken existing portfolio routes.
- Tests, build, lint and typecheck pass; no secrets in git or client bundles.

## Ready-to-paste Codex starting prompt
You are the lead engineer upgrading my existing portfolio's `/vault` application into Idea Vault 3.0. The complete product requirements are in `IDEA_VAULT_3_CODEX_MASTER_GUIDE.md`. First inspect the actual repository and report the current stack, auth, persistence, routes, UI features, deployment configuration, and data-loss risks. Do not write application code in the first pass. Create concise architecture, migration, security, phased implementation and test documents under `docs/vault/`, and a small `AGENTS.md` that links to them. Propose Phase 0 and Phase 1 as small verifiable changes, preserving all existing ideas, tags, attachments and public portfolio functionality. Ask only for decisions that cannot be safely inferred, especially Google OAuth configuration, existing data store, and AI provider. Do not claim a feature is complete without tests and manual verification. Once I approve the plan, implement one phase at a time, with rollback steps and updates to `PROGRESS.md`.

## Prompts for subsequent phases
**Phase 1:** Implement only the foundation/UX phase from the guide. Preserve existing data, show diffs, add migration tests, run checks, and report acceptance criteria.
**Phase 2:** Implement project tasks, journals, decisions and Resume Project from saved data only. No AI or Drive integration yet. Test create/edit/delete/recover flows.
**Phase 3:** Implement Google Drive integration using approved OAuth scope and server-side token storage. Provide setup instructions for Google Cloud Console and test token expiry, permission denial, quota and upload recovery. Do not request broader scopes without approval.
**Phase 4:** Add embedded engineering and animation-specific models and workflows. Keep common project logic shared; validate both example project flows.
**Phase 5:** Add user-invoked contextual AI with citations, usage controls and explicit approval for all mutations. Treat retrieved files as untrusted.

## Questions to resolve during repository audit
1. What backend/database/auth are already in use?
2. Where are the existing nine ideas and attachments stored?
3. Is Google Drive the only file store or will temporary upload staging be needed?
4. Which AI provider, model, monthly budget, and data retention policy are acceptable?
5. Is the Vault strictly single-user, and is portfolio publishing manual only?
6. Which Blender versions and engineering toolchains should the app track?

## Avoid building in v1
Autonomous agents, full 3D rendering in the browser, circuit simulators, vector databases, live multi-user collaboration, custom cloud sync clients, or automatic Drive-wide indexing. Add only when justified by demonstrated needs.
