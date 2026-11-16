# Master-guide completion review

## Current reconciliation: 2026-11-16

The owner asked to finish the full work. The active recovery continuation has initialized all 44 captured database tables locally using pinned official Auth, Storage and Realtime migrations, restored archived business/Auth/Storage metadata, and recovered supplemental policies/indexes. See [current service recovery](SERVICE_RECOVERY_STATUS.md). Earlier no-backup/no-restore statements below describe the 2026-11-15 review.

42 tables match original PostgreSQL row text exactly. The other two are managed migration histories: their source migration identities match, while genuine local execution timestamps are retained. Column attributes for all 44 tables, 13 policies, 150 constraints, 151 indexes, 12 triggers and all table RLS flags match the archived definitions. This is a database recovery drill, not a completed product or complete platform recovery.

**Phase 0 remains incomplete.** The owner explicitly kept attachment downloads blocked. Two object metadata records are recovered, but their 1,715,415 declared bytes have not been downloaded, hashed or played back. Per-device browser exports, a portable independent/off-disk recovery copy, external service configuration/secrets, Auth/API login and application end-to-end checks remain unverified. The archive is tied to the current Windows user's DPAPI material. Production has not been migrated or reset.

The later portfolio prompt was reconciled for scope: Portfolio Manager, public publishing snapshots, Story Studio, Gemini and Drive remain proposed features; no such integration or product completion is claimed. Existing idea stages remain unchanged. Root instructions require a verified backup and isolated restore before migration. That preservation gate cannot pass while required object/device recovery evidence is missing. The instruction to finish does not supply missing bytes or undo the explicit download block.

No new permission request is needed for the completed local recovery. Future production migration, deployment, public exposure and external integrations retain their explicit review/configuration gates. Retain the recovered database, encrypted archive/key, private dumps/SQL/environment files and reports.

Local sequence collision readiness is verified after adjusting only the local Auth refresh-token counter. Owner CRUD/filter/status and cross-owner mutation denial passed in a rolled-back database transaction with no test records remaining. 27 tests, targeted ESLint and syntax checks pass. These checks do not replace browser/API validation.

The later prompt's requested planning deliverables are now present: [connected audit](../portfolio-idea-vault-audit.md), [architecture and wireframes](../architecture-plan.md), [implementation checklist](../implementation-checklist.md) and [ordered execution plan](../phased-execution-plan.md). They reconcile the two specifications and existing source without implementing unverified modules or publishing private content.

2026-11-15 (Asia/Seoul). Evidence: current guide, architecture, audit, repair plan, progress, preservation instructions, source file inventory and the existing test suite. This is a local review, not authenticated production verification.

## Completed and reusable

- Discovery and planning: eight required `docs/vault/` documents and root agent instructions exist. Current audit also maps implementation, findings and repair order.
- Existing workspace: capture, tags, raw/exploring/building/done folders, search, recording, Supabase attachments and browser outbox exist in source. These predate the proposed 3.0 phases; their presence does not satisfy the new project/dashboard requirements.
- Local preservation tooling: encrypted archives, hashes, comparison, extraction and offline device export exist. Current `npm.cmd test`: 13 passed, 0 failed, including five preservation tests. Browser export is simulated; fixtures are not a production backup.
- Source reconciliation started: the requested master guide exists and is tracked (`git ls-files`). Earlier audit statements saying it was missing are historical. No claim is made about when or how it returned.

## Remaining by master-guide phase

| Phase | Status | Remaining acceptance gate |
| --- | --- | --- |
| 0 Discovery/preservation | Partial | Export actual DB/schema/policies, all attachment bytes/orphans and every phone/PC browser outbox; verify expected nine ideas; restore independently and test permissions/workflows. |
| 1 Foundation/UX | Not implemented as proposed | Approved shell, dashboard, idea detail/archive/restore, project model/conversion and broader search; preserve existing capabilities and data. |
| 2 Project execution | Not implemented | Tasks, milestones, journal, decisions, activity and saved-data Resume Project. |
| 3 Drive | Not implemented | Authorized OAuth/configuration, server-side tokens, file operations and recovery checks. Existing Supabase attachments remain intact. |
| 4 Specialized labs | Not implemented | Engineering BOM/experiments and animation/story assets/characters/shots with approved workflows. |
| 5 AI | Not implemented | Explicit contextual requests, citations, proposal approval and usage/privacy limits. |
| 6 Release | Not complete | Security, real-device/accessibility/end-to-end QA, backup/restore and approved deployment/rollback. |

The later portfolio master prompt adds Portfolio Manager, curated Completed AND Published snapshots, Story Studio and Gemini. The original guide specifies animation modules, a different palette and a different delivery order. Do not silently choose conflicting requirements or remap existing idea statuses. Existing public case studies stay unchanged pending an approved slice.

## Work started now: R0 reconciliation

Scope/files: this review, root `AGENTS.md`, `PROGRESS.md` and task memory. Correct the current missing-guide claim and establish an evidence-based remaining-work checklist. No application, SQL, dependency, auth or deployed changes.

Risks: mistaking planned modules for existing ones, treating simulated export as a backup, or assuming the guide supersedes the later prompt. Mitigation: retain historical records and explicit unresolved gates.

Acceptance: guide presence confirmed; required planning/tool/test files inventoried; existing tests run; completion claims limited to their evidence; remaining preservation inputs recorded. Rollback: revert only this documentation slice, retaining all user files and data.

## Next executable gate

1. Arrange secure administrator-controlled Supabase exports, a private backup directory outside the repository, and a separate restore target. `.env.local` is absent; this alone does not establish whether other secure access is possible. Do not paste credentials into chat.
2. Identify browser profiles and pending work on both confirmed capture devices. Follow `scripts/vault/README.md`; do not reload the Vault to inspect queues because mounting can replay deletions. Preserve unsaved in-memory work separately.
3. Export, verify and restore using actual inventories. Record counts, exact row/hash comparisons and anonymous/second-user denial evidence. Do not reset or migrate production.
4. Review the exact first application slice: R1 initial read-error handling is recommended in `docs/REPAIR_PLAN.md`. Obtain owner approval under root instructions before editing application code. Define files, risks, tests and rollback for that slice.

No live backup, restore, browser QA, lint/build/typecheck, deployment, OAuth or AI verification was performed in this documentation review. Existing audit reports of those commands remain historical.
