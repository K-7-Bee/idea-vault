# Master-guide completion review

## Current reconciliation: 2026-11-23 (Phase 6D)

This replaces the 2026-11-16 review below, which is kept as history; it said Phases 1–6 weren't built. Since then, Phases 1–6C were planned, approved slice by slice, built and (except 6C, which is CI only) taken live. Each step is recorded in [PROGRESS.md](PROGRESS.md). Phase 0 was closed by the owner's reset on 2026-11-16. The pre-reset data exists only in the encrypted DPAPI snapshot `run-20261116T002012Z`.

"Verified" below means a check that ran and passed: SQL suites (`npm run test:sql`), unit tests, browser tests against the synthetic fixture (`npm run test:browser`, all run in CI), or a live check recorded in PROGRESS. The fixture imitates Supabase, Google and Gemini; it is not them.

### The 12 acceptance items (`PORTFOLIO_IDEA_VAULT_FINAL_MASTER_PROMPT.md`)

| # | Item | Evidence | Not verified |
| --- | --- | --- | --- |
| 1 | Anonymous visitors see only approved public content | SQL: anon reads only `showcases`, published profile and journal snapshots; anon can't read projects, drafts or `user_id`, or list any bucket (phase4a–4d suites). Live 4A check as anon: public columns only. Browser: private projects never appear on `/projects`. | — |
| 2 | Direct private API and asset access is denied without authorization | Every private API route gives 401 without a session and 403 cross-site (browser tests; live smoke checks at every go-live). The proxy and the `ALLOWED_EMAIL` check gate `/vault`. RLS on every public table (6A catalog drill). Drive files are served only to the owner, sandboxed. | Whether Supabase sign-ups are off (owner, V-053). |
| 3 | Completed but not Published is invisible publicly | SQL: no snapshot exists without the publish call. Browser: "project overview … cannot publish". | — |
| 4 | Published on a non-Completed project doesn't expose it | SQL: a project can't be created as published; publishing a project that isn't completed is refused; moving a project away from completed removes its snapshot (phase4a). | — |
| 5 | Completed + Published shows only approved showcase fields | Publishing copies only the reviewed fields into a separate snapshot (`showcases`). Browser: "visitors see only the chosen fields". Live 4A: `user_id` refused to anon. | — |
| 6 | Unpublishing or reverting removes public content and cached exposure | SQL: unpublish removes the snapshot. Browser: unpublish takes a showcase or journal entry down, and the next homepage request reflects it. | Live unpublish and stage-change removal not yet exercised (noted at 4A go-live). Vercel's cache behaviour is proven only through the fixture build. |
| 7 | Portfolio editing through the Vault login, without editing code | 4B (homepage profile), 4C (résumé, photo, files), 4D (journal), 4A (showcases): all edited in the Vault, all live. | — |
| 8 | Draft, preview, save, publish and rollback behave predictably | Browser: "edit, save, preview, confirm and publish: the very next homepage request shows exactly the preview", and "history and rollback". | — |
| 9 | Real content is never invented | The homepage seed is the pre-4B page text, compared with git history by `tests/profile.test.mjs`. Everything else is the owner's own input. Publishing refuses empty image descriptions. The 6D privacy page states only behaviour checked in code. | — |
| 10 | Works on phone, tablet and desktop and respects reduced motion | Browser: layouts at 320–1280 px with no horizontal scrolling. axe (WCAG 2.2 AA) and pixel-measured text contrast on every public page and Vault screen at 320, 768 and 1280 px, light and dark, in CI. The CSS and animated sections honour `prefers-reduced-motion`. | A real phone and iPad pass (owner, checklist below). Reduced motion isn't asserted by a test. |
| 11 | Existing Vault data and workflows survive migrations | Every migration is additive and re-runnable from 004 on, proven twice per CI run. A backup comes before each migration go-live. The 6A restore drill reproduced all 30 production tables exactly. | Current data hasn't been backed up with the owner's own passphrase since 6A (the drill used a one-time one). |
| 12 | Deployable and maintainable with documented configuration and recovery | [docs/RUNBOOK.md](../RUNBOOK.md): settings, migrations, go-live, rollback, backups, incidents. CI on every push. Backup and restore drill scripts. | — |

### Still open (owner actions or later slices)

- **Domain:** connect `kaushikkamal.com` (steps given 2026-11-23). Then Search Console verification and Drive OAuth to Production (6D item 4).
- **CSP:** enforce it on or after 2026-11-30 if Vercel's logs are clean (6D item 5).
- **Sign-ups:** confirm they're off in Supabase (V-053).
- **Backup:** run one with your own passphrase.
- **Live unpublish check (item 6):** publish a test project, unpublish it, and confirm `/projects` drops it.
- **Real-device pass (item 10):**
  1. On a phone and an iPad, open `/`, `/projects` and a case study, and check nothing overflows sideways.
  2. With "Reduce motion" turned on in the device settings, check the hero doesn't animate.
  3. Log in to the Vault, capture an idea with a photo and a voice note, then put the device in airplane mode, capture another, reconnect and confirm both sync.
  4. Open a project and the Journal editor.
- **5B** (assistant proposals) and **5C** (file text), once 5A is switched on with a real key.

---

## Earlier reconciliation: 2026-11-16 (historical)


Owner-authorized source repairs now cover dashboard locking, non-navigating logout preservation, device-local attachment/idea recovery and conditional edits. See [repair evidence and limitations](RELIABILITY_REPAIRS_2026-11-16.md). Current verification: 74 tests, full ESLint, TypeScript and production build pass. These repairs do not complete Phase 0, browser/backend acceptance, the proposed product modules or deployment. Historical completion/approval statements below must be read with this update.

The owner asked to finish the full work. The active recovery continuation has initialized all 44 captured database tables locally using pinned official Auth, Storage and Realtime migrations, restored archived business/Auth/Storage metadata, and recovered supplemental policies/indexes. See [current service recovery](SERVICE_RECOVERY_STATUS.md). Earlier no-backup/no-restore statements below describe the 2026-11-15 review.

42 tables match original PostgreSQL row text exactly. The other two are managed migration histories: their source migration identities match, while genuine local execution timestamps are retained. Column attributes for all 44 tables, 13 policies, 150 constraints, 151 indexes, 12 triggers and all table RLS flags match the archived definitions. This is a database recovery drill, not a completed product or complete platform recovery.

**Phase 0 update (2026-11-16, later): closed by owner-accepted live reset — see PROGRESS.md. The live Vault was emptied after the snapshot was proven identical; attachment bytes and device exports were never preserved. Text below is historical.**

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
