# R2 queue ownership: implementation review

Approved by owner and implemented 2026-11-16. New captures/tombstones carry the request-verified owner ID. Legacy/foreign records are hidden from queue-derived UI/counts and paused without rewriting or removing them. Replay verifies current identity before each mutation and after completion; deletion refuses unexpected file paths. The page independently checks the configured owner before private queries and mounting Capture. See PROGRESS.md for actual checks and limits.

Local acceptance: 39 tests, full lint, TypeScript no-emit and production build pass. Component tests use mocked hooks/services, not a browser or real IndexedDB. Still required: disposable isolated two-user browser/backend checks for offline save/reconnect, account switch, expired/rejected auth, logout and reload, blob retention and paused tombstones. No live profile, original outbox or retained recovery database was used. Client checks cannot eliminate the race between identity verification and a request; RLS remains required. Existing cached clients, cached private HTML and unbound localStorage drafts remain separate work.

2026-11-16. Source audit only; no live profile, queue or account was inspected. This proposal changes replay behavior, so it requires review before implementation under AGENTS.md and repair-plan R2. Earlier approvals covered bounded R1 fixes and accessibility markup, not legacy queue ownership.

## Observed paths

- `src/lib/outbox.ts`: IndexedDB version 1, `outbox` keyed by idea ID. Queued records include content, tags, File blobs and optional deletion intent, but no owner identity.
- `src/app/vault/capture.tsx`: Save persists the queue before clearing the composer. Deletion persists a tombstone. Mount displays legacy captures, applies tombstones to the visible list and starts replay. Replay also runs on visibility, reconnect and a 20-second timer.
- `src/lib/sync.ts`: replay inserts idea text before checking a session for file uploads. File paths use the session's current user. Deletion can read metadata and remove files without first checking a recorded queue owner. Database RLS remains important; it does not establish the provenance of an unowned local capture.
- `src/proxy.ts`: configured owner email restricts navigation; it does not bind browser records or independently protect direct SDK calls.
- Drafts and cached private HTML also lack account binding. They need separate slices; queue changes alone do not close offline disclosure.

## Proposed first slice

Bind new queue entries to the owner verified by the request-bound Vault page. Pass only the user ID to Capture, without tokens. Add an optional owner ID to the existing queue shape, without renaming/upgrading the database or rewriting legacy records. Preserve original IDs, files, timestamps and tombstones.

At display and replay boundaries, separate matching-owner records from foreign or unbound records. Do not expose their contents, apply their tombstones, upload, delete or remove them. Show a generic preserved-local-work notice. Add equivalent guards at the start of both sync mutation functions so direct calls fail before database or Storage access. Verify the current authenticated user before replay and use the bound owner explicitly for inserts and Storage paths. Recheck identity at operation boundaries; client checks do not replace RLS or make multi-request replay atomic.

Legacy records remain untouched and paused until independently exported and explicitly reconciled. Do not infer ownership from email, current login, an existing idea ID or the absence of a second user. No automatic owner backfill, silent purge or legacy retry under a new identity.

Files: `src/app/vault/page.tsx`, `src/app/vault/capture.tsx`, `src/lib/outbox.ts`, `src/lib/sync.ts`, `tests/vault.test.mjs` and progress/acceptance documentation. No SQL, provider, deployment, service-worker or localStorage changes in this slice.

## Risk and acceptance

The intentional compatibility change is that existing unbound captures and deletion markers stop replaying automatically. Their bytes stay on-device. Page authentication failure must not mount the private capture UI with an invented owner. Offline new captures can retain the verified page identity, but replay must wait for current-session verification. An expired or switched session must not redirect old work into another account. A cached old app version remains a rollout limitation; browser cache/account isolation is separate work.

Required tests: matching owner captures and tombstones; missing, foreign, expired and rejected auth; zero database/Storage writes on failed guards; no removal of blocked queue entries; unbound/foreign data excluded from the visible queue and counts; preserved File blobs and tombstones through reads; new offline entries retain owner; account change during replay refuses the next mutation; no owner inference/backfill. Re-run tests/lint/types/build. Full acceptance also needs an isolated browser/backend with two synthetic users and account-switch/logout/offline checks.

## Rollback

Retain the additive owner field, all records and blobs. Stop replay if rollout fails. Do not restore the old unconditional replay code as an automatic rollback: it would again send newly bound records under the current account. Use a compatibility version that preserves the guards and disables replay, then reconcile pending work explicitly. No resetting IndexedDB or production and no replay of an old snapshot over newer writes.

## Decision for the owner

Approve this first slice with the intentional pause of all existing unbound captures and deletion markers, preserving them for explicit reconciliation. This does not approve automatic reconciliation, SQL migration, service-worker cache deletion, deployment or original attachment downloads. If that pause is unacceptable, preserve/inspect device exports first and design a reviewed per-record ownership mapping before changing replay.
