# Existing features and confirmed gaps

Audit: 2026-11-15. “Implemented” means verified in source and compatible with current automated checks; it does not mean manually verified on real devices or against live Supabase. Findings use AUD identifiers to avoid confusing historical closed BUG-001/002 in `shared-file.md`.

## Feature status and reuse

| Feature | Current state / evidence | Disposition |
| --- | --- | --- |
| Public portfolio and navigation | Implemented: `src/app/page.tsx`, `portfolio/hero.tsx`, `mobile-menu.tsx`, global skip/focus/reduced-motion styles. | Reuse; later targeted cleanup only. |
| Education and experience | Inline records show Jeonbuk/CCN education, Altech Aluminum 2022 internship, unnamed transformer factory 2020 internship, first-prize Innovation Fair claim. | Existing text is evidence of what is displayed, not independent credential verification. Request exact roles/dates/responsibilities/certificate metadata before enrichment. |
| Certificates/résumé | Award text exists; no certificate document, certificate management or résumé asset/route found. | Report missing; do not fabricate documents/claims. `Custom Browser Start Page.pdf` is unrelated. |
| Public projects | Three static cases and detail/index routes in `src/lib/projects.ts` and `src/app/projects/`. | Reuse content/renderers. No private project CRUD or publication gate. |
| Login and route guard | Supabase password login + owner email proxy; server/browser clients. | Reuse; strengthen authorization/error handling after approval and isolated tests. |
| Capture/tags/statuses | Text/file-only capture, Unicode hashtag extraction, folders/counts, status edits. | Reuse. Required project stages differ; preserve current rows unchanged. |
| Sparks/counters/views | Static prompts/shuffle, list/grid, streak/week/total/tag counts. | Reuse; no AI involved. Read failures can mislead counts. |
| Idea search/pagination | Content `ilike`, tag/status filters, 100-row pages and tie-safe cursor. | Reuse; unified/text-extracted/semantic search not present. |
| Attachments/recording | Supabase uploads, private signed links, image/audio display, file removal, MediaRecorder formats/timer/cleanup. | Reuse; partial failure handling needs repair. |
| Offline capture | Durable IndexedDB queue+File bytes, fixed IDs, retries/tombstones; cached Vault HTML. | Partially robust; owner/account privacy, conflict recovery and actual device tests remain. |
| Editing/deletion | Optimistic edits/status changes; confirmed permanent deletion. | No archive/history/revision/restore. Keep data intact while planning repairs. |
| Existing backup tools | Local encrypted archives/hash checks and simulated export tests in `scripts/vault/`, `tests/preservation.test.mjs`. | Reuse. Real backup and isolated restore remain undone. |
| Start page | `/start` clock/search/quick links, metadata separation. | Reuse; do not regress during public cleanup. |
| Animation/demos | Active screws/K effects, lazy motor, Ohm demo, opt-in BYTE/terminal. | Not abandoned code. Future public removals need dependency/link inventory and archive. |
| Portfolio Manager/publication/history | No editor, draft/public schema, preview/publish/unpublish or curated projection found. | Genuinely missing in checkout; future scope approval required. |
| Private projects/labs/Story Studio | No project creation/edit/delete workflow, Analyzing stage, tasks/BOM/story/character/shot modules found. | Planned; verify whether live/other branch differs before introducing schema. |
| Drive/Gemini/AI | No OAuth/token/provider/configuration implementation found. | Future integrations; session connector availability does not establish application integration. |

## Confirmed source findings (unfixed)

| ID / priority | Evidence and trigger | Observed result / expected behavior | Proposed action |
| --- | --- | --- | --- |
| AUD-001 / high | `src/app/vault/page.tsx` `VaultContent` and `ideaIndex`: Supabase returns an error with null data. | Main query becomes `[]`; metadata index stops silently and can be partial. Expected explicit failed/partial state, not “No ideas” or seemingly authoritative counts. Source-confirmed; not reproduced against production. | Targeted read-error handling and mocked failure tests. |
| AUD-002 / high | `src/lib/ideas.ts` `signFiles`: signing fails wholly/partly. | Error details discarded, file URL becomes null and UI falls back to plain filename without explicit recovery reason. Expected visible unavailable/retry state while retaining metadata. | Preserve signing errors in result contract, retry UI; do not discard attachments. |
| AUD-003 / high | `src/app/vault/capture.tsx` `deleteFile`, `src/lib/sync.ts` `deleteSavedIdea`: object removal succeeds, next DB deletion fails. | Bytes already gone while metadata can remain; single-file UI restores an apparently present file. Queued idea deletion retries, but does not restore removed bytes. Existing tests confirm deletion ordering, not atomicity/recovery. | Preservation first; reviewed recoverable deletion/operation design. No transactional guarantee across storage and SQL. |
| AUD-004 / high | `src/lib/outbox.ts`, `capture.tsx`, `use-local-value.ts`, `logout-button.tsx`, `public/sw.js`. | Queue/draft/cache keys are not account-bound, survive some auth transitions, and replay uses current session. Private HTML can be read offline without fresh auth. Confirmed design; wrong-account replay/cache leak is a conditional risk, not a demonstrated live exploit. | Owner-bound preservation/recovery policy; no silent purge. Test account changes, expired sessions and logout races. |
| AUD-005 / medium | `src/app/vault/logout-button.tsx`: Supabase signOut returns an error. | Returned error ignored and route changes as if logout succeeded; unexpected rejection also has no recovery. Expected verified result/error and safe busy-state recovery. | Minimal returned-error handling, keep queue untouched; focused tests. |
| AUD-006 / medium | `capture.tsx` at composer/search/edit textareas and general error paragraph. | No explicit programmatic labels on composer/edit/search; generic error paragraph has no alert/live announcement. Several important controls are labelled already. | Add labels/error association/announcements and verify actual accessibility tree/focus on phone/keyboard. No whole-page rewrite. |
| AUD-007 / high requirement gap | `src/lib/projects.ts`, home/index/detail/metadata/static params consumers. | Static entries have neither completion nor explicit publish state; no predicate enforces the requested conjunction. Expected all public surfaces to share eligibility. No private DB reads found in public routes. | Owner confirms existing entries and real project model before designing/reviewing minimal bridge. |
| AUD-008 / documentation | `AGENTS.md` and old docs link absent `IDEA_VAULT_3_CODEX_MASTER_GUIDE.md`; old handoff claimed clean tree/no pending decisions. | Documentation could misdirect next work. Expected explicit current source/version and plan status. | Record missing source and append corrective audit; request source reconciliation rather than invent/recreate it. |

## Security/integrity risks needing isolated verification

- **AUTH-01:** `src/proxy.ts` enforces allowed email only for Vault navigation; SQL permits each authenticated user their own rows and bucket prefix. This does not establish the intended single-owner policy for direct SDK calls. It is not proof that another user can read the owner's ideas. Verify signup/account settings and actual policies with anonymous/second-user tests.
- **AUTH-02:** `supabase/003_files.sql` insert policy checks file-row user_id but not parent idea owner/path correspondence; FK alone does not express the owner invariant. Isolated forged parent/path tests required. No exploit run against live data.
- **DATA-01:** edits have no revision check; zero affected rows are not distinguished from successful updates; concurrent phone/PC edits can overwrite. No actual lost record is established.
- **DATA-02:** duplicate-ID errors are accepted without payload/hash equivalence; storage and metadata operations can leave orphans. Actual inventory must reconcile both kinds, not clean them automatically.
- **DATA-03:** browser storage eviction and unsaved in-memory files/recordings are outside server backup. The owner uses both phone and PC; device counts and pending captures are unknown.
- **SEC-01:** no app CSP/rate limiter/file-type allowlist/scanning pipeline found; host/Supabase controls unknown. Assess against actual upload types/preview behavior before choosing controls.
- **UI-01:** responsive breakpoints, target sizes, keyboard shortcuts, reduced-motion guards and motor fallback are present. Current-run phone/tablet/desktop, screen-reader and contrast tests were not performed. Historical browser checks in handoff are not current-run evidence. Small grid/focus/error issues need manual verification.
- **MAINT-01:** hero tween/timeouts are not all cancelled on unmount; potential detached animation work, not a demonstrated regression. Lower priority than privacy/data recovery; avoid polishing animations scheduled for retirement.

No broken imports or compile failures found by current lint/typecheck/build. No abandoned second Vault/login/project DB found. The manifest route and utility are intentionally connected. All runtime dependency groups have current consumers; three.js may become removable only after approved motor retirement and a fresh usage scan.

## Checks run on 2026-11-15

- `npm.cmd test`: **13/13 passed** (five Vault, three start, five preservation).
- `npm.cmd run lint`: passed, no reported findings.
- `npx.cmd tsc --noEmit --incremental false`: passed.
- `npm.cmd run build`: passed; existing home/login/manifest/projects/start/Vault/icon routes generated.
- Source/import/route/schema/hidden-config/documentation inspection; no new tests or dependencies added.

Not performed: live login/record read, live auth/RLS/media probes, browser/device QA, schema export, production backup/restore, public external link health check or deployment. No `.env.local` found. These limitations do not prevent the requested audit documents, but they block claims about production correctness and migration safety.
