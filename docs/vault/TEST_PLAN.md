# Test and acceptance plan

## Baseline evidence and limits

Existing suite: `tests/vault.test.mjs` has five mocked/source-driven tests covering deletion ordering/retry, timestamp+ID pagination, and microphone start/cleanup. `tests/start-page.test.mjs` has three helper/source tests. These do not prove live RLS, browser persistence, UI behavior or file integrity. No browser test dependency is declared. Preserve these tests; propose a browser runner only when implementing meaningful end-to-end checks.

Use `npm.cmd`/`npx.cmd` in this Windows workspace: PowerShell blocks the `.ps1` shims. Checks: `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run build`. Record current-run results in PROGRESS. Build success is not authenticated-flow verification.

## Preservation gate (must precede migration)

Use a restricted encrypted manifest and an isolated restored project, never destructive tests against live. Reconcile actual server and per-device counts with the guide's expected nine ideas; exact IDs/content/tags/status/owner/dates and attachment links must match. Check every downloaded object's SHA-256, size and name against backup; record missing/orphan objects without deletion. Restore File blobs and drafts and replay queued captures only in isolation. A checksum mismatch or unexplained missing record fails the gate. Test rollback with a post-backup write to prove rollback will not discard newer content.

## Verification matrix

| Area | Required cases and expected result |
| --- | --- |
| Legacy regression | Text/file-only capture, Unicode tags, all status folders, counters, sparks, list/grid, edit, pagination with tied dates and more than 100/1000 rows, image/audio/download. Existing ideas remain visible/editable with original IDs and bytes. |
| Offline/failure | Queue then close/reopen, duplicate retry, upload succeeds/metadata fails, partial file failure, reconnect/session expiry, quota/IndexedDB failure, multi-tab sync, tombstone retry, unsaved attachment warning. Never clear a queue until all required persistence is verified. |
| Device privacy | Production service worker, offline navigation, logout/cache-write races, changed account/owner, stale HTML, drafts/outbox across sessions. No replay into wrong account; no silent loss of device-only blobs. |
| Read/error states | Initial DB/list/signing errors, partial index, expired links, failed URL refresh and offline search. Error must not masquerade as no data; avoid fabricated counts. |
| Ideas | Capture/edit/search/archive/restore; original capture/history and timestamps retained. Export/import round-trip preserves fields and bytes; reject malformed/oversized imports and avoid duplicate overwrites. |
| Conversion | Transactional project+link creation, repeat/double click and forced mid-transaction failure; exactly one intended project, original idea/attachments remain. |
| Execution | Create/edit/recover tasks/milestones/journal/decisions; next action and Resume Project reflect saved records and real activity. Concurrent edits report conflicts rather than overwriting silently. |
| Engineering | Save component, BOM revision/line, datasheet link and experiment with measured units/firmware commit. Unknown cost stays unknown; currencies/limits validate. Safety checklist and corrective action persist. |
| Animation | Save character profile, licensed reusable asset, shot/scene/storyboard, rig/Blender version journal, `.blend` and render references. Missing files and sync conflicts explicit; no claim of web rendering. |
| Drive | OAuth state mismatch/replay, refresh/expiry/revocation, disconnect/reconnect, unauthorized file, large resumable upload interruption, pagination, backoff/quota, move/delete/rename/duplicate names, corrupted copy hash. Legacy Supabase bytes remain; disconnect never deletes Drive files. |
| Security | Anonymous and second-user direct SDK/API access denied for all private entities/search/export/download; forged parent IDs/paths and ownership transfer rejected. Test headers/CSRF/XSS/upload validation, tokens absent from client assets/logs, private routes absent from public metadata. |
| AI | Disabled before setup; only selected context with real citations; unavailable sources labelled; malicious document instructions cannot widen scope. Accept/reject, stale revision, budget/rate-limit/provider failure/cancellation tests; zero mutation without explicit acceptance. |
| Public site | `/`, all three `/projects/[slug]`, `/projects`, `/start`, `/login`, unknown-slug 404, PWA icons/manifest. Preserve metadata/navigation/hero/motor/Ohm/BYTE/terminal and start clock/search behavior; no private leaks. |
| Accessibility/performance | Keyboard-only capture/search/navigation/dialogs, focus restoration, screen-reader labels/status/errors, contrast/reduced motion, 320/390/768/1280px and light/dark. Large data/file lists paginate without freezing UI; cache behavior verified in production mode. |

## Reporting and release gate

For each slice, store command/result, environment (isolated/live read-only), tester/date, fixture counts, manual checks, failures/fixes and rollback evidence in PROGRESS. Sensitive artifacts stay outside Git. Do not label source-only or mocked tests as end-to-end coverage. All applicable automated and manual gates must pass before calling a feature complete; skipped/inaccessible checks remain explicit.

Phase 0B tooling adds `tests/preservation.test.mjs`: authenticated encryption/tamper rejection, exact records/binary round-trip, missing/corrupt/duplicate/foreign-owner validation, orphan retention, field-change detection, local extraction/recollection and overwrite/path-escape rejection. The browser script is exercised in a simulated read-only IndexedDB environment with actual WebCrypto and File bytes. This proves Node/browser crypto compatibility under simulation, not actual device export or live restoration.
