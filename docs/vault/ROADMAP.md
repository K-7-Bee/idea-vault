# Phased delivery and approval gates

Status: the owner's subsequent "start" instruction authorized starting Phase 0 preservation; local tooling is in progress. Feature phases remain proposals and the restore gate remains mandatory. Before each slice present scope, exact files, risks, tests and rollback again; complete and record that slice before expanding scope.

## Phase 0 — discovery and preservation

- **0A (this pass):** repository audit and eight planning documents; concise AGENTS links. Files: `docs/vault/*.md`, `AGENTS.md` only. Risk: documentation could confuse assumptions with facts; explicitly mark unknown live state. Acceptance: source-backed inventory, risks, proposed UI, gates and decisions. Rollback: revert only documentation additions, preserving original Next rules and master guide.
- **0B (after approval/access):** read-only live inventory, per-device export, encrypted independent database/object backups and isolated restore rehearsal. Proposed files: `scripts/vault/` export/verify tools, preservation fixtures/tests under `tests/`, docs updates; exact implementation to be reviewed first. Risk: auto-sync on opening live Vault, mishandled private exports, wrong restore target. Acceptance: every expected idea and attachment reconciled, field/hash equality, restored auth/RLS/files and baseline workflow proven. Rollback: stop tooling; live remains unchanged; retain encrypted artifacts. No live restore/reset.
- **0C:** baseline browser/accessibility/security checks on restored system, host/config confirmation, approve Phase 1 design. Gate: verified restoration and no unexplained missing data, baseline tests passing, explicit scope approval.

## Phase 1 — foundation and UX, split into reviewable slices

| Slice | Scope and likely files | Risks | Acceptance | Rollback |
| --- | --- | --- | --- | --- |
| 1A | Vault shell/nav/toolbar, responsive graphite/orange styling; preserve capture logic. `src/app/vault/layout.tsx`, new shell components, scoped CSS, Vault page | Public CSS leakage, focus/mobile/offline regressions | Portfolio/start/login unchanged; all existing capture/tag/status/search/file/record/view flows reachable; real errors differ from empty state | Disable shell flag/redeploy compatible prior app; no schema changes |
| 1B | `/vault/ideas` and detail, reversible archive/restore, additive Idea fields/history and owner-safe access. New routes/data layer, reviewed new SQL migration, existing capture/sync compatibility only as necessary | Old devices/outbox, ownership, edited dates/original capture loss | Nine expected ideas reconciled and editable, all attachment bytes preserved; archive restores; RLS tests pass; old queue replay preserved | Disable new routes/writes; retain additive fields/history and new records; keep old compatible reader |
| 1C | Minimal Project and explicit transactional conversion/link; DB text search route for implemented entities. New project/search routes, DAL, additive SQL/tests | Duplicate conversion, mistaken public publishing, incomplete search indexing | Retry conversion returns same project; original remains; owner-filtered real source-labelled results; no file-text claims | Disable new features; retain projects/links; no destructive schema reversal |

No Drive or AI in Phase 1. Avoid empty dashboard widgets for nonexistent data. New project shell initially has Overview; execution tabs arrive in Phase 2.

## Subsequent phases

| Phase | Scope / likely files | Principal risk | Required acceptance | Rollback |
| --- | --- | --- | --- | --- |
| 2 Execution | Task/milestone/journal/decision/activity DAL, SQL, project tabs | Misleading resume summary, stale edits | Complete manual project workflow; next action and Resume Project derive from committed records; recovery/conflict checks | Disable new tabs/writes; keep records |
| 3 Drive | Server OAuth/callback/token storage/file operations, settings/files UI, provider SQL | Token theft, file loss, quotas/runtime limits | Approved scope, upload/retrieve/reconnect/expiry/denial/quota/move/delete/disconnect tests; Supabase originals readable | Disconnect/disable provider; use retained legacy references; never delete source files |
| 4 Labs/library | Engineering BOM/components/experiments, animation assets/characters/shots, research/library and templates | Invented prices/measurements, unsafe electrical guidance, Blender sync conflicts | One real persisted workflow in each domain; units/currencies/licenses/version references explicit; `.blend`/renders are snapshots, local Blender remains editor | Disable domain tools; keep generic projects/files and domain rows |
| 5 Optional AI | Provider adapter/config, context selection, conversations, reviewable proposals | Exfiltration, prompt injection, costs, unapproved mutation | Selected context only, real citations, caps, retention controls, accept/reject and zero unapproved mutations | Kill switch/revoke key, retain accepted user data |
| 6 Release | Accessibility/performance/monitoring, hardened export/import and backup scheduling, deployment runbook | Public regressions, failed rollback/recovery | Tests/build/lint/typecheck, keyboard/mobile QA, security and restore drills; approved deployment | Compatible previous app + retained additive schema; reconcile writes before any restore |

Backup/restore work starts in Phase 0 and remains mandatory throughout, not deferred to release. File text extraction is a separately approved later search slice; no vector DB, Drive-wide indexing, browser rendering engine, custom sync client or multi-user collaboration in v1.
