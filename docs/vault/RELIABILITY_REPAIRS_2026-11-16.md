# Authorized reliability repairs

2026-11-16 (Asia/Seoul). Owner explicitly requested dashboard privacy and logout preservation first, then attachment recovery and edit conflicts. This authorizes these source changes; it does not authorize deployment, production migration, original attachment downloads or a reset. The existing master guides and installed Next.js authentication/Cache Components guide were consulted.

## Scope and behavior

1. Dashboard privacy/logout: `page.tsx` passes the server-rendered dashboard as a child of Capture's existing hidden/inert boundary. The same synchronous gate now hides dashboard, recovery and capture together. Logout coordination locks before cache cleanup or sign-out, blocks stale verification during the attempt and leaves the tab locked on success/failure. Successful logout offers a separate-tab login link instead of unmounting drafts, pending files, edit buffers and recording chunks. Existing cache cleanup remains unchanged. Only a new independent original-owner verification can unlock.
2. Attachment recovery: `recovery.ts` adds a separate `idea-vault-recovery` IndexedDB database; it does not upgrade/rewrite the existing outbox. `recovery-operations.ts` persists owner-bound original idea/file metadata and queued file blobs before database deletion. All app storage purges have been removed, including compensation after an ambiguous upload response. A failed local recovery write stops remote deletion. Whole-idea retries keep the original snapshot and refuse a newer changed record. New removal attempts carry distinct recovery IDs; legacy tombstones remain supported without reassignment. Recovery UI restores original IDs/metadata, retains evidence after success and rejects conflicting saved ideas/files. Queued file bytes are replayed through existing owner-checked sync. Direct upload failures retain source files in the composer.
3. Edit conflicts: edits freeze the original content/tags/status at editor-open time. Both text edits and stage changes use owner-scoped conditional UPDATE predicates and require one returned ID. Missing/stale rows cannot be reported as saved; edit text remains available with copy/compare guidance. No revision column or production schema migration was added. Counts now use a state-held clock updated once per minute, satisfying the current React purity checks.
4. Device export now includes recovery records, queued recovery file bytes and account-bound text drafts in the existing encrypted archive. Absent recovery databases are not created by export. Verification checks queued bytes and ownership; comparisons include recovery records. Older archives without recovery fields remain supported. The public case-study description was adjusted to describe retained-file removal rather than automatic byte deletion.

## Risks and acceptance

Automated checks exercise dashboard placement/lock hiding, logout errors/delays/duplicate attempts/stale verification, retained local work and recordings, recovery-write failure, database failure, account changes, retry after deletion, original attachment IDs/timestamps, repeated restore, owner/path/conflicting-version refusal, concurrent edit predicates, ambiguous uploads, recovery UI, and encrypted device export including a missing recovery database. Services, hook lifecycles and storage interfaces use synthetic fixtures; they do not establish real-browser or production correctness.

Required manual acceptance remains: disposable two-user browser/backend fixture, real sign-out/re-login in another tab, focus/accessibility at mobile/desktop widths, actual recording timing, IndexedDB quota failure, interrupted restore, direct API denial and two-device concurrent changes. Do not use live profiles or the retained recovery database as fixtures.

Limits:

- Closing/reloading/navigating away still loses memory-only edits/files/recordings. Hidden DOM is not encryption, and already-issued requests/signed URLs cannot be recalled.
- Recovery records are device-local and remain after restoration. Export them before clearing browser data. There is no automatic expiry/purge, cross-device recovery browser, or automatic import of recovery archives. Retained remote objects consume storage. This repair cannot recreate bytes already deleted by older versions.
- Metadata capture/deletion/restoration spans requests. Concurrent attachment additions/removals are not a database transaction: an attachment added after the snapshot can have its metadata cascaded by a concurrent whole-idea deletion, while its bytes remain. A transactional server operation/soft-delete schema is a later preservation-gated change. Do not claim fully atomic deletion or full version history.
- Compare-and-set detects differences in current text/tags/status; it is not a monotonically increasing revision and cannot detect an intervening change that returns all fields to their original values. Older deployed clients still use their old behavior until replaced.
- A restore that finds newer content refuses overwrite. It cancels this device's pending deletion first; preserve unsaved work and reload to inspect the still-saved version. A partial upload restore retains the recovery record and queued bytes for retry.
- Phase 0 remains incomplete. No original file bytes, live browser storage, production records, RLS configuration or deployment were changed/verified in this work.

## Rollback

Revert the source/UI slice only in development if necessary. Preserve `idea-vault-recovery`, existing outboxes/drafts, encrypted exports and retained storage objects. Do not roll back an active unsaved tab by refreshing it. Do not re-enable automatic storage deletion or old tombstone replay on production as an emergency rollback. No schema rollback is required.

Final command results are recorded in PROGRESS.md.

Final verification: 74/74 tests, full ESLint, TypeScript no-emit with incremental disabled, production build (13 generated pages), exporter/verifier JavaScript syntax checks and `git diff --check` passed. Git reported line-ending normalization warnings only. The build, tests and checks used this checkout; no live acceptance is implied.

Offline removal additionally writes a recovery intent before its outbox tombstone and before hiding the idea. A failed recovery write leaves the idea visible. Online replay enriches that intent with authoritative file timestamps/metadata before deletion. This allows the recovery UI to retain evidence even before replay or when the network is unavailable; actual restore still verifies the owner's online session.
