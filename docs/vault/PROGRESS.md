# Vault progress

## 2026-11-14 — Phase 0A documentation pass

- Authorized scope: read master guide completely, inspect existing portfolio/Vault and write planning documents. No application feature code, SQL, dependencies, auth settings, live records or attachments changed.
- Completed: repository stack/routes/auth/schema/storage/offline/UI audit; eight documents and concise AGENTS pointers. Proposed UI, phased scope/files/risks/tests/rollback and approval queue recorded.
- Main findings: Supabase password auth + PostgreSQL + private Storage; separate browser-only outbox/drafts; no app Drive/AI integration. Public static project catalog is separate from future private projects. Live host/settings/schema and expected nine ideas are not verified.
- Preservation risks: hard deletes and cascade relationships; separate object/metadata operations; device-only pending data; owner-unbound queue/cache; auto-replay of deletion markers; source SQL rerun can overwrite tags; initial read errors can appear empty.
- Verification: `npm.cmd test` passed 8/8; `npm.cmd run lint` completed without reported findings; `npx.cmd tsc --noEmit --incremental false` passed; fresh `npm.cmd run build` passed and generated the existing routes. `git diff --check` passed. Initial plain npm/npx commands were blocked by PowerShell execution policy; `.cmd` shims were used without changing policy.
- Not performed: live inventory, backup, restore drill, authenticated browser/manual QA, RLS testing, deployment, Drive operations or AI calls. No claim of data-loss prevention beyond leaving existing data untouched in this pass.
- Phase 0 status: discovery documents ready for review; preservation gate remains open. No implementation phase complete.
- Next action: owner reviews DECISIONS and proposed slices; then confirm secure production/device access and backup/restore arrangements for Phase 0B before any migration. Feature implementation requires owner approval.

## 2026-11-14 — Phase 0B local preservation tooling

- Authorization: owner said "start" after reviewing the initial report. Started the preservation slice; did not infer permission for feature implementation or bypass the restore gate.
- Clarification: owner wants Drive because of Supabase limitations, and explicitly chose attachments/recordings in Drive with idea text/tags/status remaining in Supabase. Recorded in DECISIONS and ARCHITECTURE. Actual quota usage remains unknown.
- Files: added `scripts/vault/preservation.mjs`, `backup.mjs`, `export-device.js`, tool README and `tests/preservation.test.mjs`; added plain-language PRESERVATION_STATUS; updated planning/progress/agent pointers and ignored encrypted backup artifacts. No application source, SQL, dependencies or live data changed.
- Completed: encrypted local archive creation/verification/comparison/extraction, exact row/blob hashing, orphan retention and invalid inventory rejection. Browser script reads only the existing outbox and draft/view values while offline, preserving deletion markers and file metadata/bytes without replay/clear. Local destinations must be outside the repo and extraction refuses existing directories.
- Tests: all 13 passed (8 baseline, 5 preservation). Preservation tests cover wrong passphrase/tampering, missing/corrupt objects, duplicates/foreign owners, orphan retention, exact local extraction/recollection, overwrite/path-escape rejection and simulated browser-to-Node encryption compatibility with draft and voice-note bytes. Lint and TypeScript passed; `git diff --check` passed. No new app build was needed for local tooling; Phase 0A build had passed before this slice.
- Limits: whole-memory archives capped at 256 MiB including encrypted output; Windows ACL/privacy and passphrase custody must be configured. Browser test is simulated, not real device QA. Archive validation cannot prove the source inventory is complete or the SQL export includes all deployed controls. No automatic Supabase/browser restore tool or live exporter was added.
- Live gate still open: no Supabase environment values or local `.env.local` found, no production/device inventory confirmed, no user data exported, no actual database/object backup or isolated restore performed. No service credentials were requested in chat or exposed. Live access, private backup destination and isolated target are still needed; existing data remains untouched.
- Next action: establish secure Supabase/export access and identify capture devices; take consistent database/object/device exports and rehearse restoration separately. Then revisit Phase 1 implementation. Tools and instructions are ready in `scripts/vault/README.md`.

## 2026-11-14 — Production address and device clarification

- Owner supplied `https://kaushik-kamal.vercel.app/vault` and confirmed capture on both phone and PC. Updated preservation checklist and V-002; no need to ask again for the address or device categories.
- Tried an unauthenticated web-tool open; the tool reported the URL inaccessible. No conclusion about deployment availability/auth protection is supported. No authenticated live access, queue replay or data mutation performed.
- Outstanding: secure Supabase/export access, specific browser profiles/pending data on both devices, private backup destination and isolated restore target. Real backup/restore gate remains open. Documentation-only update; no application changes or new test run needed.

## 2026-11-15 — Audit, locate, reuse and repair plan (new assignment)

- Scope: read attached Audit/Locate/Reuse/Repair request and current final master prompt; re-inspect actual repository, hidden config presence, public/private routes, imports, schema, auth, uploads, offline state, dependencies, tests and previous plans. Audit/documentation only; stop before repairs.
- Created after confirming absence: `docs/REPOSITORY_MAP.md`, `IDEA_VAULT_ARCHITECTURE.md`, `EXISTING_FEATURES.md`, `REPAIR_PLAN.md`. Added current audit pointers/coordination records without replacing earlier plans.
- Discrepancies: actual idea statuses raw/exploring/building/done; no private Project CRUD or Analyzing stage; static public catalog has no Completed+Published predicate or Vault publishing connection. Current code differs from latest requirements. Original `IDEA_VAULT_3_CODEX_MASTER_GUIDE.md` is missing in the working tree now; do not recreate/rename/migrate by inference.
- Findings: source-confirmed initial/signing error suppression, non-atomic deletion state, owner-unbound device state, ignored logout result, explicit-label gaps, absent publication feature. Conditional auth/policy/concurrency/mobile risks are separately labelled. No live exploit, data loss or broken import claimed.
- Current-run verification: 13/13 tests passed; lint and `tsc --noEmit --incremental false` passed; fresh production build passed with existing routes. Existing preservation suite includes simulation, not real device/live restore verification. No new tests added for documentation.
- Unverified: live DB/schema/RLS, expected nine ideas/file integrity, actual phone/PC workflow, live backup/restore and deployment. `.env.local` still absent. Owner's existing Drive-attachments/Supabase-metadata decision retained.
- No app source, database, auth, dependencies, private bytes or deployed content changed. No deployment or source retirement. Original public components remain active.
- Next action: owner reviews ADMIN-AUDIT-001 and REPAIR_PLAN. Resolve workflow/publication/source discrepancies and preserve real data before any approved data-changing repairs. Current turn stops after audit.
