# Task todo

Next ID: T5

## Checkpoint
<!-- The one task in progress. Rewrite after each plan step and before any stop. -->
- Task: none - owner requested wrap-up on 2026-11-16; full preservation/product work remains open.
- Done so far: Verified encrypted 44-table logical production snapshot; all 44 captured table schemas recovered locally. 42 exact row matches; two managed migration histories differ only in local execution timestamps with matching source identities. Captured catalog, 999 grants/options, private read denial, rolled-back owner CRUD/filter/status and cross-owner mutation checks pass. Local sequence collision readiness fixed. 27 tests and targeted ESLint/syntax pass.
- Next action: Read docs/vault/RESUME.md, then git status --short. Resume within the existing download block; do not recapture production without a fresh device pause or migrate before the complete preservation gate. Independently available planning/recovery work is recorded; do not repeat completed Docker/setup/restore steps.
- Files in play: docs/vault/SERVICE_RECOVERY_STATUS.md; docs/vault/COMPLETION_REVIEW.md; docs/implementation-checklist.md; scripts/vault/audit-service-recovery.mjs.
- Uncommitted changes: Wrap-up stages recovery/docs/tests and this checkpoint only. Preserve pre-existing AGENTS.md, src/app/vault/page.tsx, tests/vault.test.mjs, the PDF deletion and other untouched diet-token files. Never add supabase/.temp or private recovery artifacts.
- Unresolved: Attachment bytes explicitly blocked by owner; per-device exports, portable/off-disk key/archive recovery, full API/browser workflows and service configuration remain unverified. Feature modules/integrations remain unimplemented. Production unchanged. Earlier setup/auth blockers below are historical and superseded by RESUME.md/current reports.

## Latest continuation: T4

- Scope: complete independent local database recovery and reconcile full-product progress.
- Evidence: 27 tests; targeted ESLint/syntax; actual private guarded recovery/catalog/access/sequence/workflow reports. All capture/restore details in docs/vault/SERVICE_RECOVERY_STATUS.md.
- State: local database drill verified within documented limitations; full preservation and product remain incomplete.
- Wrap-up: owner requested commit/push and resume handoff. No further recovery actions until resumed; retain local database volume and all private artifacts.
## Open tasks

### T2 - Initial Vault read-error handling
- Priority: P2
- Depends on: none (no data mutation or schema change)
- Requirements: Approved first R1 slice; explicit failures instead of empty/partial successful workspace.
- Acceptance criteria:
  - [x] Initial and metadata read failures show an alert/retry link without mounting Capture.
  - [x] Successful empty/populated reads and existing regression suite pass (16/16).
  - [x] Production build passes with network access (2026-11-15).
  - [ ] Authenticated browser retry and accessibility manually checked.
- Status: implemented; local tests/typecheck pass; build now passes; manual checks outstanding.
- Next action: Verify actual authenticated browser behavior; stop for review before another slice.

### T1 - Review master-guide completion and start remaining preservation
- Priority: P1
- Depends on: none
- Requirements: Identify completed work from evidence; start remaining authorized R0 work without changing live data.
- Acceptance criteria:
  - [x] Record current phase status and source reconciliation.
  - [x] Run existing local preservation/baseline tests (13/13 passed).
  - [ ] Verify actual DB/object/device backup and isolated restore.
- Status: in progress; documentation slice verified, real preservation pending external setup.
- Plan:
  1. [x] Compare guide, audit and current inventory.
  2. [x] Record completion/gates and run local tests.
  3. [ ] Arrange real export/restore inputs and execute preservation.
- Next action: Establish secure export and restore arrangements with owner.

<!-- Highest priority first. A task leaves this file only when it is verified,
or when the user accepts it as is. Raise "Next ID" when you add a task.

### T1 - short title
- Priority: P1 (blocks other work) | P2 (normal) | P3 (later)
- Depends on: task ID, or none
- Requirements: what must be built or changed
- Acceptance criteria:
  - [ ] something that can be observed or run
- Status: todo | in progress | implemented | tested | blocked (reason)
- Plan (HARD tasks only):
  1. [ ] step
- Next action: the very next thing to do
-->

### T3 - Local-only manual backup architecture (proposal ready)
- Priority: P1
- Depends on: none (this enables T1 preservation)
- Requirements: Supabase CLI read-only export, private destination S:\Road to Storm K7\codex test, local PostgreSQL restore, Storage bytes, credentials protection, retention/integrity; no paid/cloud target required.
- Acceptance criteria:
  - [x] Inspect architecture and produce scope/files/risks/tests/rollback proposal in docs/vault/LOCAL_BACKUP_PLAN.md.
  - [x] Owner approved implementation and read-only export plan (2026-11-15).
  - [ ] Actual backup and independent local restore verified with counts/rows/hashes.
- Status: in progress; CLI installed and preflight tested; local runtime setup pending. No production changes.
- Next action: Establish Docker-compatible local runtime, then verify local DB configuration. Production restore remains prohibited.
