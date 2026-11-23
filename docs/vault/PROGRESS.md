# Vault progress

## 2026-11-16 - Approved R2 private HTML cache protection

- Owner said proceed after reviewing R2_CACHE_REVIEW.md. Read the installed Next.js PWA guide before edits. Changed only public/sw.js, worker tests and review/progress documentation in this slice; preserved prior working-tree edits.
- Removed private navigation HTML cache reads/writes. `/vault` and nested `/vault/*` navigation now fetch with cache no-store; rejected network requests return generic plain-text 503/no-store. HTTP responses, including auth redirects/errors, pass through. Existing private cache bytes remain untouched and unused by the updated worker. Activation claims clients without enumerating/deleting caches; existing static asset cache name and behavior are retained. Logout cleanup remains unchanged.
- Acceptance: all 44 tests pass, including four new worker behavior tests covering private path/query matching, no-store fetches, HTTP success/redirect/error responses, retained cached secret never served offline, activation preservation, delayed-response non-repopulation after synthetic logout cleanup, static cache hits and public/non-GET/cross-origin boundaries. Full ESLint, TypeScript no-emit with incremental disabled, node --check public/sw.js, fresh production build (13 pages) and git diff --check pass. Git emits existing line-ending normalization warnings only.
- Tests execute actual worker code with mocked worker/cache APIs and synthetic Request/Response objects; they do not verify browser worker lifecycle/takeover, old worker requests, multi-tab sessions, back/forward cache, Next router/RSC caches or real storage. No browser profiles, live caches/outboxes, attachments or production data accessed; no deployment, dependencies, schema changes or cache purge. The deliberate behavior change applies when the new worker controls a page: fresh offline opening fails safely; already-open offline capture paths were left intact.
- Rollback retains all device/cache data and the private-cache prohibition; do not restore shared private fallback automatically. Next gate: isolated browser acceptance of worker activation/offline reload/account switching and the prior queue/draft changes. Full offline/session privacy and Phase 0 preservation remain incomplete; the original attachment-download restriction remains in force.

## 2026-11-16 - Private HTML cache review prepared

- Owner requested the next step after owner-scoped drafts. Rechecked worker/logout source and the unresolved trusted-device decision. The worker still caches private navigation HTML in one shared cache, while logout cleanup can race pending writes. These are source findings, not a reproduced browser leak.
- Prepared R2_CACHE_REVIEW.md with exact worker/test scope, static/public preservation, non-destructive activation, synthetic acceptance and rollback. Recommended disabling private HTML caching/fallback; documented the deliberate loss of fresh offline opening while retaining already-open offline capture. No application or worker edits before owner review of that tradeoff.
- No live profiles, cache bytes, outboxes, database or attachments accessed. Latest executed application checks remain 40 tests/lint/types from the approved draft slice and the preceding queue-slice production build. No test rerun for documentation-only changes. Real browser/session/privacy and preservation gates remain open.

## 2026-11-16 - Approved R2 owner-scoped drafts

- Owner approved R2_DRAFT_REVIEW.md. Read the installed Next.js authentication-with-cache-components guide before edits. Capture now uses `vault-draft:<verified owner ID>` and displays a generic notice that any older shared draft remains preserved for review. No legacy-key reads, copying, ownership inference, clearing or overwrite were added. Existing vault-view behavior, local-value hook, queue guards and earlier repairs remain intact.
- Expanded the offline Capture test to use the real local-value hook with synthetic localStorage and mocked React lifecycle/network services. Verified distinct owner drafts on remount, edits for a second owner, current-owner-only clearing after offline save, unchanged legacy draft/view preference and zero access to the legacy key. Added blocked-storage coverage for independent owner memory values and view preference. All 40 tests and TypeScript no-emit with incremental disabled pass. Initial lint found a test helper calling a hook without a hook-style name; renamed it useDraft and reran tests/lint.
- No fresh production build for this bounded storage-key/text change; the preceding queue-slice build remains historical evidence. No real browser/localStorage/profile, authenticated session/API, service-worker or visual check performed. Owner namespacing is not encryption or a live-session lock. Preservation and two-user browser gates remain open; no deployment, production/device access, attachment download, schema change or new dependency.
- Rollback: preserve every key/value and disable restoration/writes if needed; never automatically restore shared-key loading or merge drafts. Next acceptance remains an isolated two-user browser fixture; cache/private-HTML isolation requires a separate reviewed design.
- Final full ESLint passed; git diff --check passed with existing line-ending normalization warnings only.

## 2026-11-16 - Post-queue acceptance prerequisites and draft review

- Owner requested the next step. Rechecked connected document sessions (none) and Node resolution of playwright, @playwright/test and puppeteer (all unavailable). No isolated application Auth/API fixture was established; the retained database-only recovery target is not suitable for browser acceptance as-is. Did not install tooling, start services, inspect live browser profiles or run original outboxes.
- Inspected current Capture, use-local-value, logout and service-worker source. Shared `vault-draft` memory/storage is still not owner-scoped; worker HTML caching and logout cache races remain separate. Prepared R2_DRAFT_REVIEW.md with exact scope/files, compatibility impact, preservation rules, acceptance and rollback. No application edits in this continuation; owner review required before changing legacy draft behavior.
- Latest application evidence remains 39 tests/lint/typecheck/build passing from the approved queue slice. No new suite run for documentation-only changes. Full browser and preservation gates remain open; original attachment-download restriction remains unchanged.

## 2026-11-16 - Approved R2 queue ownership slice

- Owner explicitly approved R2_QUEUE_REVIEW.md, including pausing legacy unbound captures/deletion markers. Read the installed Next.js authentication guide before application edits. Preserved pre-existing working-tree changes.
- VaultContent now verifies the configured owner with getUser before private queries and passes only that user ID to an owner-keyed Capture. New offline captures and deletion markers retain that ID. Queue display/counts/tombstones and replay select matching records only, with a generic notice for retained unbound/foreign work. Deletion refuses to overwrite a blocked queued record. IndexedDB name/version and existing bytes remain unchanged; no ownership inference/backfill or removal of blocked records.
- Both direct sync entrypoints reject missing/foreign/unverifiable identity before database/Storage access. Replay rechecks identity at mutation boundaries and after completion, inserts explicit bound user IDs, uses bound-owner paths and rejects unexpected deletion paths. Ownership failure stops the loop and preserves the queued item. This is not an atomic auth/DB/Storage transaction; deployed RLS remains essential.
- Verification: 39/39 tests pass, full ESLint and TypeScript no-emit with incremental disabled pass, fresh production build passes all 13 generated pages, and git diff --check passes with existing line-ending normalization warnings. Tests cover page identity failure, owner filtering/blob references/tombstones, mocked offline Capture save and blocked queue retention, direct-call guards, matching-owner writes, mid-operation account switches and existing deletion retries. One new test initially matched the common CSS word `hidden`; changed the synthetic tag to a unique value and reran successfully.
- Limits: mocked hooks/network and in-memory queues do not verify real IndexedDB/browser sessions, two-user API/RLS behavior, service-worker races or visual/accessibility behavior. No production/device access, original attachment download, schema change, deployment or live-data mutation. Phase 0 remains incomplete; original download restriction remains in force. LocalStorage drafts and cached private HTML are outside this slice.
- Rollback: retain owner fields/records/blobs and disable replay while keeping guards; never automatically restore unconditional replay or reset IndexedDB. Next acceptance step is the isolated two-user browser/backend procedure in R2_QUEUE_REVIEW.md. Broader draft/cache isolation or legacy reconciliation needs its own reviewed scope.

## 2026-11-15 — R1 initial read-error slice

- Owner said `start` after the recommended initial-read repair was presented; interpreted as approval for this slice only. Scope: `src/app/vault/page.tsx`, focused regression tests and progress/task records. No schema, live-data, auth, dependency or deployment changes.
- Both ideas-query errors and failed metadata pages now render an accessible error message with a `/vault` reload link. No partial metadata reaches Capture; the error path does not mount Capture or replay its queue. Successful empty/populated reads keep their existing behavior. Raw provider error details are not rendered.
- Acceptance evidence: `npm.cmd test` passed 16/16, covering returned initial errors/null data, first/later metadata-page failure, rejected index request, successful empty/populated reads and existing regression tests. `npx.cmd tsc --noEmit --incremental false` passed. `npm.cmd run lint` exited 0 with one warning in untouched `docs/design/verify-hero.mjs:7` (`no-unused-expressions`). `git diff --check` passed.
- Failed check: `npm.cmd run build` could not fetch six Google Fonts families; Turbopack exited 1. No font replacement or network workaround applied. Build and real authenticated browser/retry/accessibility checks remain open; this is implemented with passing local checks, not fully verified.
- Rollback: revert only this slice's page/test changes, retaining previous documentation and all saved/device data. No automatic advance to signing/logout/privacy repairs. Real preservation gate remains open.

## 2026-11-15 — Master-guide completion reconciliation

- Reviewed the now-present tracked master guide against current audit, later portfolio prompt, source inventory and preservation instructions. See [completion review](COMPLETION_REVIEW.md) for phase status and remaining gates.
- Started R0 documentation reconciliation; corrected the root agent instruction's stale missing-guide statement. Earlier absence reports remain historical evidence.
- Current verification: `npm.cmd test` passed 13/13, including simulated preservation tests. No new application code or tests, SQL, live data or integrations changed.
- Phase 0 remains partial: no real DB/object/device exports or isolated restore evidenced. Phases 1–6 are not complete; existing capture features are reusable baseline functionality.
- Outstanding inputs: secure export access, private external backup location, isolated restore target and browser-profile inventory on phone/PC. Application repair approval and conflicting future requirements remain unresolved. No live or browser verification, new lint/typecheck/build or deployment performed.

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

## 2026-11-15 ? Build and lint errors resolved

- Replaced the unused conditional expression in `docs/design/verify-hero.mjs` with equivalent explicit if/else handling. No application or font changes.
- `npm.cmd run lint` passed with zero warnings/errors; `git diff --check` passed and the script diff was reviewed.
- `npm.cmd run build` passed with network access: compilation, TypeScript and all 13 static pages completed. This resolves the earlier Google Fonts connection failure; restricted/offline fresh builds still need access or a separately reviewed local-font strategy.
- E1 archived unchanged with resolution lesson. Real authenticated browser/retry/accessibility verification and production backup/restore remain outstanding. No deployment or live-data changes.

## 2026-11-15 ? Live verification and real preservation started

- Owner requested live browser checks and real backup/restore. Initial access checks found no connected document/browser session, no `.env.local`, no relevant Supabase/database/backup environment variable names, no Supabase/psql/pg_dump command, and no installed Playwright/Puppeteer package found by Node resolution. No credential values were printed. These checks do not rule out access elsewhere.
- Actual production anonymous HTTP checks (Node fetch with no cookies, manual redirects, response bodies cancelled): `/` 200, `/login` 200, `/vault` 307 with Location `/login`. All three returned `Cache-Control: public, max-age=0, must-revalidate`. This verifies only these anonymous responses, not authenticated browser rendering, offline cache privacy, RLS or API/media authorization.
- No browser scripts were run and no authenticated Vault was mounted. No outbox replay, export, production mutation or restore occurred.
- Requested missing operational inputs: private backup directory outside repo, isolated Supabase test-project reference, secure local availability of authenticated production exports, and phone/PC browser profiles with pending/unsaved capture status. Do not send secrets in chat. Follow scripts/vault/README.md for offline device preservation before reloading the live Vault.
- Next action: receive these inputs, preserve every device, export a consistent DB/object inventory and independently restore/re-export into the isolated target. Compare exact rows/hashes and verify permissions/playback there; then perform authenticated browser QA. Real preservation remains incomplete.

## 2026-11-15 ? Free-plan local restore architecture proposal

- Owner confirmed Windows Chrome/Opera, iPhone Safari, iPad Safari and optional Android Chrome; cloud project limit prevents a separate cloud target. Local backup destination is S:\Road to Storm K7\codex test.
- Inspected existing SQL dependencies, archive/CLI code and migration/security runbooks; checked current official Supabase documentation. Destination exists; CLI/Docker/psql/pg_dump not found on PATH. No production connection or external-folder writes performed.
- Proposed LOCAL_BACKUP_PLAN.md: CLI roles/schema/data export, separate paginated Storage bytes, encrypted manifests, local-only compatible PostgreSQL restoration, exact table/count/row/file verification and conservative manual retention. Updated active migration/tool/status instructions to remove the additional-cloud-project requirement.
- Plain PostgreSQL lacks Supabase auth/storage dependencies by default; prefer local Supabase PostgreSQL or explicitly compatible dependencies. Service/browser recovery remains distinct from SQL restore and byte verification.
- Planning only: no installs, real exports, restores, retention deletion, production changes or new test execution. Await owner approval of the concrete local tooling/export plan; production restore is excluded under all slices.

## 2026-11-15 ? Approved local L0 setup/preflight

- Owner approved LOCAL_BACKUP_PLAN. Created only the dedicated idea-vault-preservation subfolder under the approved external destination, restricted its ACL to executing user/SYSTEM/Administrators and installed exact supabase@3.1.0 in its tools directory. Parent-folder unrelated files remain untouched. Application dependencies unchanged.
- Added read-only scripts/vault/preflight.ps1, three rejection tests and LOCAL_BACKUP_SETUP.md. Version/dump help checked; no production connection. Elevated preflight confirms destination, ACL, roughly 68 GB free and CLI. Restricted sandbox cannot fully inspect the private external workspace.
- Checks: npm.cmd test passed 19/19; npm.cmd run lint passed clean. No application changes in this slice, so no repeat app build. Preflight deliberately returns a non-ready result for absent runtime/device/access/target prerequisites; it is not a backup certificate.
- Local Docker not found; WSL reports not installed. Windows feature/admin/restart setup not performed automatically. No restore instance, real exports, file downloads, retention purge or production mutation performed. L0 remains partial; L1-L3 not implemented. Next: establish the local container runtime, then verify isolated instance configuration before export/restore work. See setup results for commands and credential-output cautions.

## 2026-11-15 ? Real-backup credential and PC requirements check

- Owner requested production export first, with credentials checked before export; prohibited Docker/feature/admin changes/restart without further approval. CLI 3.1.0 confirmed. Sanitized projects-list authentication check exited 1 (authentication unavailable); no DB connection credentials or linked project reference found in checked environment/files. Export permission/row visibility/Storage permissions cannot be verified yet. No production backup created, no bytes/counts/hashes or restore claimed.
- Read-only CIM: Windows 11 Home 25H2 build 26200, installed 8 GiB RAM, x64/SLAT/VM monitor mode and firmware virtualization enabled. LanmanServer running/Automatic. Docker missing in checked PATH/default/per-user locations; WSL status/list fail. Feature-state query requires elevation; no admin retry or changes. Hardware broadly meets minimums, runtime not ready; see PRODUCTION_BACKUP_STATUS.md and official requirements links there.
- Requested local CLI sign-in and non-secret production reference; database access still requires independent checks after API sign-in. No secrets printed, no live queries/export/restore, installations, Windows changes or reboot performed. Documentation only; diff check performed. Next: secure authentication/access, then runtime readiness under separate approval and actual export tooling; no production restore allowed.

## 2026-11-16 ? Preservation prerequisite recheck

- Continued the authorized preservation work without application repairs, installations or production mutations.
- Read-only preflight with access to the private workspace verified the existing local destination, protected ACL, 68,296,806,400 available bytes and pinned Supabase CLI 3.1.0. Restricted-mode ACL/CLI failures were access limitations; the access-enabled recheck passed those checks.
- Docker was not found by the preflight. Device preservation and a dedicated compatible local restore target remain unverified.
- Sanitized CLI projects-list check exited 1, classified authentication-unavailable; raw response and project identities were suppressed. No production query/export occurred.
- Checked process environment presence only: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, DATABASE_URL, PGPASSWORD and SUPABASE_PROJECT_REF were absent. Repository .env, .env.local, .env.production and supabase/.temp/project-ref were absent. These bounded checks do not inspect all credential stores.
- No backup or restore created. Next required owner action: complete private local CLI sign-in using the command in PRODUCTION_BACKUP_STATUS.md and provide only the non-secret production project reference. Device exports/write-pause confirmation and independently verified database/Storage access remain required before export. Windows/runtime changes remain subject to the existing separate approval requirement.
- Verification: read-only prerequisite checks only in this continuation; the immediately preceding local check passed 19/19 tests, lint, TypeScript and diff whitespace checks. No new application changes warrant repeating that suite.

## 2026-11-16 - Continuation: preservation access still pending

- Repeated the authorized read-only private-workspace preflight and sanitized CLI authentication check. Destination, protected ACL, capacity (68,296,790,016 available bytes) and pinned CLI 3.1.0 passed.
- CLI projects-list exited 1, classified authentication-unavailable; raw output suppressed. Docker remains unavailable. Device preservation, export access and isolated restore identity remain unverified.
- No backup, restore, installation, application repair or production mutation performed. Existing working-tree changes were left untouched. No application tests rerun for this prerequisite-only continuation.
- Next required input remains local CLI sign-in and the non-secret production project reference, as described in PRODUCTION_BACKUP_STATUS.md. Runtime/Windows changes still require separate approval.

## 2026-11-16 - CLI login verified and production source confirmed

- Owner completed local login; read-only CLI project listing succeeded. Owner selected K-7-Bee's Project, reference kpeyjktueihyxtsfnsyr, as the Vault source. No project linked or production export attempted.
- Interactive login required explicit --output-format text --agent no; default agent JSON mode rejected prompts. Authentication is now verified for project listing only, not database/Storage access.
- Installed CLI dump help was inspected. It documents database_write and possible network-ban write permissions when remote dumping without an explicit database password. This automatic credential path was not invoked under the read-only production scope.
- Presence-only checks found no SUPABASE_DB_PASSWORD, DATABASE_URL or PGPASSWORD in this process. Docker/pg_dump/psql were not found on PATH. No secrets printed or credentials requested in chat.
- Next: obtain owner approval for runtime setup or an alternative reviewed export method; establish secure local database credential handling and per-device preservation/write pause before consistent export. No backup or restore exists yet.

## 2026-11-16 - Authorized runtime installation started

- Owner approved Docker/WSL setup; automatic restart remains excluded. Confirmed winget 1.29.380 outside sandbox and consulted official Microsoft WSL/Docker Windows instructions.
- winget selected Microsoft.WSL 3.0.5 and verified its installer hash. First installation failed with 0x80073d28 (Windows administrator privileges required).
- Started the same WSL install using Windows RunAs/UAC, hidden installer, without --allow-reboot. Elevated process remained pending at last observation; WSL Appx registration was not observed. User must handle the Windows consent prompt. Installation success, feature enablement and reboot requirement remain unverified.
- Docker metadata inspected only; Docker installation not started. No local restore services, production connection, export, app repair or restart performed. Installer session is still pending; check its result before launching another install.

## 2026-11-16 - WSL installed; Windows restart required

- Elevated WSL installation completed with exit 0. winget inventory and wsl --version verify WSL 3.0.5.0 and kernel 6.18.58.1-1. Earlier pending installer status is superseded by this actual result.
- WSL status reported missing virtualization support. Enabled VirtualMachinePlatform using elevated DISM /Online /Enable-Feature /All /NoRestart; exit 3010 confirms success with restart required. No reboot initiated.
- Attempted approved Docker Desktop 4.99.0 installation through winget. Download remained a zero-byte temporary file across observations; no Docker installer completion observed. Stopped only the identity-checked winget Docker download process, retaining temporary files. Docker installation is incomplete.
- Next: owner preserves unsaved work and restarts Windows manually when ready. Then verify WSL2 virtualization and retry Docker installation; do not start restore services until local isolation is reviewed. No production queries/export/restore or application changes performed.

## 2026-11-16 - Post-restart runtime check and Docker disk-space blocker

- Owner confirmed Windows restart. Host check reports last boot 2026-11-16 08:44:54 Korea time. WSL 3.0.5 remains installed; WSL2 reports virtualization unavailable and HypervisorPresent is false.
- Administrator read-only checks confirm VirtualMachinePlatform Enabled, firmware virtualization True and SLAT True. Boot configuration had no explicit hypervisorlaunchtype entry. Under the existing runtime setup approval, set hypervisorlaunchtype Auto successfully and verified the entry. No automatic restart; another manual restart is needed to verify whether the hypervisor starts. This is not proof the WSL2 failure is resolved.
- Docker 4.99.0 cached installer has a Valid Authenticode signature from Docker Inc and matching product version 4.99.0.245822. Retried approved installation with WSL2 backend; installer exited 1. Its actual log identifies insufficient C: space: 3272 MiB needed, 705 MiB available at install check. Docker is not installed. Cached installer and temporary copies retained; no cleanup or unrelated file deletion performed. A repeated winget download attempt was started; its final termination status was not independently verified.
- Next: owner chooses freeing C: space or a reviewed installation/data location on another drive; then retry installation. Restart manually to verify explicit hypervisor startup. No production connection, backup, restore or application changes performed. Runtime prerequisite checks only; no app test rerun.

## 2026-11-16 - Docker successfully installed on S:

- Owner explicitly chose S: for Docker. Verified NTFS and approximately 68 GB free; S:\DockerDesktop and S:\DockerData did not preexist.
- Used Docker-documented --installation-dir=S:\DockerDesktop and --wsl-default-data-root=S:\DockerData flags. First retry still failed because temporary extraction used C:. Redirected TEMP/TMP only within the elevated installer process to S:\DockerSetup; no global environment changes.
- Actual installer log reports Installation succeeded. Installed S:\DockerDesktop\resources\bin\docker.exe --version reports Docker 29.9.3 build 5457199. Docker Desktop installer version is 4.99.0.245822. Temporary installer retained in S:\DockerSetup; no unrelated files moved/deleted.
- WSL data root was requested as S:\DockerData; actual engine disk creation/use remains unverified until startup. Docker engine/container operation not yet verified. Manual restart remains needed to verify the previously configured hypervisorlaunchtype Auto. No restart initiated, local restore stack launched, production access, backup or app change performed.
- Verification: installer success log and actual installed CLI invocation. No application tests needed for this system-only setup.

## 2026-11-16 - Docker verified and empty local preparation target created

- Owner requested proceeding. Docker Desktop engine works; destination/ACL/capacity and CLI 3.1.0 passed read-only preflight.
- Created separate private restore-prep-20261116 workspace, internal Docker network and healthy PostgreSQL 17.11 container with fresh dedicated volume. No active host port publication. Recorded exact target/image identity and local SQL sentinel privately.
- Verified auth/storage/public schemas, auth.uid(), zero public tables and zero Auth users. storage.objects is absent; full service schemas/API recovery and production version compatibility remain unverified. CLI startup client remained waiting and was stopped by exact command-line match; healthy database retained. No CLI-start success claimed.
- See LOCAL_RESTORE_PREPARATION.md for scope, actual evidence, limits and rollback. No production access/export/restore, browser replay or application changes. Device preservation, write pause and secure DB/Storage access remain pending. No real backup exists yet.

## 2026-11-16 - Production access check after owner requested backup assistance

- Sanitized CLI project listing from the standalone private tooling directory succeeded; approved production reference kpeyjktueihyxtsfnsyr is visible. Running from the repository first returned a project-ref resolution error; no linking or configuration repair was attempted.
- Presence-only checks found no process SUPABASE_DB_PASSWORD, DATABASE_URL, PGPASSWORD, PGSERVICE or PGPASSFILE; no standard APPDATA PostgreSQL pgpass file; no checked repository env/connection files. These checks are bounded, not proof that no credentials exist elsewhere.
- Installed dump help confirms the no-password remote path may require database_write and optionally network-ban writes. That path was not invoked under the read-only scope. No credentials printed, database query, dump, Storage download or production change occurred.
- Next required owner input: use a private local credential-entry process for the existing database password/connection; never chat. Device preservation and coordinated write pause remain required before a consistent export. CLI login alone is insufficient. No real backup or restore exists.

## 2026-11-16 - Password-free read-only production inventory verified

- Owner requested minimal necessary involvement. Existing authenticated CLI db query --read-only --remote=approved-reference succeeded without supplying/retrieving a database password. This supersedes the assumption that a password is required for every production check; SQL dump credential transport remains a separate unverified path.
- Actual production SQL reports transaction_read_only=on, server_version 17.11, nine ideas, two idea_files rows, one bucket, two storage objects and five installed extensions. Public policies count is ten. Counts are a point-in-time inventory, not a frozen backup or proof of per-owner access.
- Project metadata reports ACTIVE_HEALTHY and database build 17.11.0.003; local SQL reports 17.11. Major/minor version compatibility is now observed; full extension/schema/service compatibility remains subject to comparison.
- No private row content, attachment bytes, password reset, policy changes, live browser mount or production mutation. Device work preservation/write pause and reviewed encrypted export/restore tooling remain pending. No real backup created.
- Single-result inventory returned matching local/production versions for pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1 and uuid-ossp 1.1. Production public tables include timevault_state in addition to ideas and idea_files: future backups must preserve it too. This discovery is not evidence of application behavior. The PowerShell tool wrapper reported exit 1 despite a returned JSON result; record the result as inventory evidence, not a clean wrapper exit.

## 2026-11-16 - Verified encrypted database snapshot; attachments blocked; restore refused safely

- Owner confirmed all devices paused and unsaved work preserved. Added bounded read-only logical snapshot capture, DPAPI key wrapper, guarded public/owner-row recovery and focused tests. No application/dependency changes.
- Created private run run-20261116T002012Z: snapshot.encrypted.json, 1,476,244 bytes, SHA-256 cf582164dfbe187719edeeadcbd3edf4aefc4cf8484762d1628b40c7e7de70cd. Actual encrypted/decrypted payload comparison, independent on-disk hash and complete before/after selected-table row match passed. Preserved 44 tables plus catalog metadata: nine ideas, two idea_files, empty timevault_state, one Auth user. Original PostgreSQL row JSON text preserves numeric precision. Not pg_dump SQL or complete platform configuration export.
- Storage metadata shows two objects totaling 1,715,415 declared bytes. CLI downloads failed (experimental flag, then unsupported remote-to-local operation). Automatic review rejected service-role-key fallback as exceeding approved read-only credential scope. Owner explicitly kept downloads blocked. Fallback never executed; credential-reveal/download code removed. No attachment bytes included. Failed runs retained with private diagnostics/partial encrypted data.
- Local recovery verified isolated target identity/sentinel/emptiness, then refused source Auth user schema (35 columns) versus local bootstrap (21 columns, including incompatible confirmed_at generation). No restore SQL executed. Independent SQL confirmed zero public tables, zero users and one unchanged sentinel afterward. No RLS, exact restored-row, file playback or full recovery success claimed. Per plan, incompatible drill stopped rather than modifying managed schemas to force passage.
- npm.cmd test: 23 passed, 0 failed. Targeted ESLint passed. See DATABASE_SNAPSHOT_RESULT.md for files, artifacts, scope, limitations and rollback. Snapshot key is tied to current Windows DPAPI account; no portable recovery key or independent off-disk copy verified. Browser archives not independently inspected; write pause/preservation are owner-confirmed. No production mutations, migration, reset, cleanup or attachment permission changes.
- Next gate is compatible local Auth/Storage managed migrations and guarded recovery. Attachment downloads remain blocked by owner decision. Phase 0 remains incomplete; existing unrelated working-tree changes retained.

## 2026-11-16 - Official local Auth migrations and limited recovery verified

- Continued independently after the initial incompatible drill stopped. Inspected CLI-pinned service versions and official tagged Auth Dockerfile/migrator. Pulled gotrue v2.197.0 (digest 1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b) and ran official migrations only on the empty isolated local target.
- First local migration using postgres lacked auth-schema permission; retained its empty public.schema_migrations artifact. Second run using the existing local Auth owner and existing local development password exited 0. Auth user columns/generated behavior then matched source. No password reset, grant broadening, fake auth function, manual schema stripping or live mutation. Private local migration environments/logs retained; migration containers exited without starting an Auth server.
- Reviewed the empty local metadata artifact (postgres owner, sole version varchar(14) NOT NULL column, zero rows) and explicitly allowed it alongside source public tables; it was not deleted. Restored owner row and public tables in a fail-on-error transaction. Every original field matched: auth.users 1, ideas 9, idea_files 2, timevault_state 0. Ten source public policies matched.
- Initial access verification found privileges omitted by the visibility-filtered information-schema view. Resolved original pg_class.relacl already preserved in the archive and applied only those grants locally after row/policy equality checks. Owner read visibility, anonymous denial and second-user denial passed for all three public tables. No production re-query or broad key needed for that correction.
- Snapshot/key/hash remain unchanged. This supersedes the earlier restore-refused-only status: limited public/owner recovery now passes, while full service-table/Auth login/Storage recovery, attachment bytes/playback, browser exports and end-to-end app workflows remain unverified. Download block remains in force. No complete Phase 0 or platform recovery claim.
- npm.cmd test: 24 passed, 0 failed; targeted ESLint passed. DATABASE_SNAPSHOT_RESULT.md records actual recovery, risks, retained private plaintext SQL, DPAPI/off-disk limitations and next gates. Production reads finished; subsequent Vault edits are outside the captured snapshot.

## 2026-11-16 - Service audit and five additional Auth tables restored

- Continued the authorized next preservation step without production access or attachment downloads. Added guarded local service audit/restore tool and focused drift/missing/conflict/precision test; presented scope, risk, acceptance and rollback before recovery.
- Initial actual all-table comparison: 26 matching columns/rows, five compatible empty Auth targets, 13 missing Storage/Realtime tables. Restored only identities (1), mfa_amr_claims (5), one_time_tokens (1), refresh_tokens (7), sessions (5) in one constraint-enforced transaction after exact identity, archive hash, network isolation, no-running-companion-service and empty-compatible-target checks.
- Post-restore exact field comparison passed: 31/44 captured tables now match columns and rows. No differing nonempty tables or column drift in this audit. This does not establish full service recovery, sequence readiness or Auth login/session operation. Thirteen Storage/Realtime tables remain absent locally; next gate is compatible official managed migrations. See SERVICE_RECOVERY_STATUS.md.
- npm.cmd test: 25 passed, 0 failed; targeted ESLint/syntax passed. Private SQL/reports retained without overwrites; archive/key/hash unchanged. No auth server started, tokens replayed, existing rows overwritten, passwords reset, production accessed or attachments downloaded. Owner download block remains in force. Full preservation gate remains incomplete.

## 2026-11-16 - Official local Storage initialization and metadata recovery

Reviewed CLI 3.1.0 pinned Storage 1.90.1 and Realtime 2.154.0 sources. Pulled official Storage software and pinned its resolved digest. Initial empty-schema owner guard refused before changes; inspected actual bootstrap ownership and existing Storage admin CREATE permission without broadening grants. Verified previously recovered rows and retained a 160,471-byte private pg_dump before schema initialization.

Official Storage migration-only container succeeded on the internal local network, with no API server, queues, role installation, hash refresh or vector-store migrations. All ten archived Storage table column definitions match the audited attributes. Reviewed insert triggers, required null lifecycle controls, and restored one bucket/two objects as metadata only into empty compatible targets. Exact field verification passed; existing recovered Auth/public data remains equal. 40/44 tables now match. Three Realtime tables remain absent; 81-row local Storage migration history differs and is retained rather than overwritten. Final provenance audit confirms all 81 migration IDs, names and hashes match; local execution timestamps account for full-row differences.

26 tests pass; targeted ESLint passes. Production untouched; attachment downloads remain blocked. Service behavior, sequences, policy/trigger/grant completeness and attachment bytes remain separate unverified gates. Next is official Realtime tenant initialization. See [migration review](SERVICE_MIGRATION_REVIEW.md) and [current recovery status](SERVICE_RECOVERY_STATUS.md). Retain all local data, private environment/SQL/dump/logs/reports and the unchanged encrypted archive/key; rollback is stop-only for the dedicated database.

## 2026-11-16 - Remaining local database recovery and completion reconciliation

Owner requested finishing the full work. Continued all independent local recovery work without production access or bypassing the explicit attachment-download block. Pinned official Realtime 2.154.0 by resolved digest, verified all 96 archived migration versions before execution, saved a private local pg_dump and initialized tenant schemas using the official dynamic-repository migration API. Migration-only container exited zero; no Realtime/Auth/Storage server, replication or email workflow started.

All 44 captured tables now have matching column attributes; 42 match every original PostgreSQL row. Two migration-history tables retain true local execution timestamps, with all 81 Storage IDs/names/hashes and 96 Realtime versions matching source. Restored three archived Storage ownership policies and four Auth indexes missing from managed initialization. All 13 policies, 150 constraints, 151 indexes, 12 triggers, 44 table RLS settings and 999 table privilege/grant-option entries match the archive. No missing/changed/additional entries in those compared captured-table categories.

Owner reads and anonymous/unrelated-user denial pass for all public tables plus Storage objects. Found the local refresh-token sequence behind recovered IDs; retained old state, advanced only that local counter under table lock and verified both owned sequences safe above existing IDs. Production sequence positions remain unknown. Final owner CRUD/status/tag/text filtering and cross-owner update/delete/insert denial passed in one rolled-back transaction. Generated test IDs are absent; no original rows changed.

27 tests pass, targeted ESLint and Node syntax checks pass. No new whole-app build/browser/deployment verification is claimed. Current recovery evidence is in private unique reports; the encrypted archive/key remain unchanged. Retain private dumps/SQL/local-only credential environments/logs and Docker volume. Rollback remains stop-only; never reset/replay source production.

Reconciled current versus historical statuses in preservation, migration, snapshot, production-backup and completion reports. Added the later master prompt's connected audit, architecture/wireframes, implementation checklist and phased execution plan under `docs/`. Existing source edits and user files remain untouched. Future modules are explicitly proposals, not working features.

Full preservation/product completion remains open: blocked attachment bytes, independently inspected browser exports, portable/off-disk key/archive recovery, complete service configuration/function bodies and authenticated API/browser/file workflows. Drive/Gemini/Portfolio Manager/project modules remain unimplemented. The verified-backup gate prevents production migration while this evidence is missing. No additional permission question is issued because the owner's download decision remains in force.

## 2026-11-16 - Owner-requested wrap-up

Saved [resume checkpoint](RESUME.md) and updated the task-memory checkpoint with actual results, private target/artifact identities, restrictions and next-entry documents. Owner requested commit and push of this work. Stage recovery tooling, focused tests, reports/planning documents and the updated task checkpoint only; retain pre-existing application/root-instruction edits, PDF deletion and local Supabase temporary files outside this commit. No further recovery, source-data or deployment actions are part of wrap-up.

## 2026-11-16 - Approved R1 logout error repair

Owner approved the concrete logout slice in NEXT_STEP_REVIEW.md. Updated src/app/vault/logout-button.tsx to check returned sign-out errors and catch rejections, show a generic accessible alert, restore retry on failure and navigate only after successful sign-out. A synchronous pending guard prevents duplicate requests before React rerenders and remains set during successful navigation. Existing cache cleanup remains unchanged; no IndexedDB outbox, draft or file-blob deletion was added.

Added three focused behavioral tests covering returned/rejected errors and retry, pending duplicate clicks and single successful navigation, and cache cleanup rejection. The error/retry cases also exercise absent Cache API support and guard against localStorage/IndexedDB access. One initial test failed because it assumed a fixed number of promise turns; replaced that assumption with an explicit sign-out-start signal. Final npm.cmd test: 30 passed, zero failed. Full ESLint, TypeScript no-emit check with incremental disabled, and git diff --check passed (Git reports its existing LF-to-CRLF normalization warning).

No authenticated browser, real logout/session verification, build or deployment performed. These component tests use mocked React hooks and services; they do not establish full browser behavior or offline privacy. Phase 0 gaps and the attachment-download block remain unchanged. Rollback: revert only this component and its added tests; retain all data. Next reviewable R1 slice is attachment-signing failure handling (AUD-002), requiring its own concrete scope and owner review before application edits. R2 account/cache isolation remains separate.

## 2026-11-16 - R1 attachment-link failure handling

Owner requested the next step after the logout slice; proceeded with the previously identified AUD-002 repair. Presented scope, files, risk, acceptance and rollback before edits. Updated src/lib/ideas.ts to handle returned batch errors, rejected signing requests, per-object errors and missing results without discarding original idea/file metadata. Successful links are matched by path; backend details are not returned. Existing nullable URL is the unavailable-state contract.

Updated src/app/vault/capture.tsx to display unavailable files as non-link text with names and sizes, an explicit status message and a retry button. Retry is guarded against duplicate requests, replaces only successful links on still-present file records, preserves other idea state and clears its pending state on completion. Failed retries leave unavailable records visible. Existing automatic refresh and its old-link retention/timestamp behavior remain unchanged; this slice does not establish expired-link or account/cache isolation correctness.

Added two behavioral tests for full returned/rejected signing failure, preservation of metadata and idea content, recovery on a subsequent successful request, partial out-of-order results, per-object errors, missing results and empty input. All 32 tests pass; full ESLint, TypeScript no-emit with incremental disabled and git diff --check pass. Git emits the existing line-ending normalization warnings. The helper recovery is tested; the actual React retry button, screen-reader status behavior, authenticated browser/API signing and file playback remain manually unverified. No fresh build/deployment performed.

No production access, attachment download, schema/dependency change or browser storage mutation occurred. Phase 0 remains incomplete and the download block remains in force. Rollback: revert only this slice's ideas helper, capture UI and added signing tests; retain the prior logout repair and all saved data. Next work should verify these R1 changes in an isolated authenticated browser before claiming end-to-end acceptance; broader R2 privacy/authorization work needs a concrete reviewed scope.

## 2026-11-16 - R1 production-build and local HTTP checkpoint

Owner requested the next step. Checked available browser tooling and isolated configuration: no browser-control tools, no installed Playwright runner, no .env.local, and the retained recovery target has no application Auth/API stack. Did not open live tabs, install dependencies, start backend services or access production. Created R1_ACCEPTANCE.md with concrete isolated fixture/browser cases and explicit unexecuted gates.

Fresh npm.cmd run build passed compilation, TypeScript and all 13 generated pages. Started the built app temporarily on loopback 127.0.0.1:3217, fetched public routes using Node HTTP (no browser profile/service worker), then stopped the server. Home, project index, all three existing project details, start page, manifest and 192px PWA icon returned 200 with nonempty bodies. The initial unknown-project assertion expected HTTP 404 and failed on 200. Consulted installed Next.js not-found documentation: streamed not-found responses retain 200. A subsequent actual response check confirmed both not-found content and robots noindex; classified as documented streamed behavior, not an application repair. No new application edits in this checkpoint.

These checks establish build and basic public HTTP rendering only, not hydration/interactivity, visual accessibility, authenticated logout/signing, browser retry/playback or complete public privacy. Prior 32 tests/lint/typecheck results remain the latest suite evidence; not rerun after documentation-only changes. Full R1 browser acceptance and Phase 0 remain open. No deployment, schema change, download or browser outbox replay occurred.

## 2026-11-16 - R4 field labels and error announcement

Owner requested the next step; implemented the bounded, non-data-changing AUD-006 accessibility markup slice after presenting files, risks, acceptance and rollback. src/app/vault/capture.tsx now gives the composer, search input and edit textarea explicit accessible names (New idea, Search ideas, Edit idea) and marks the shared error paragraph as an alert. Existing layout, handlers, keyboard shortcuts, storage and public components are unchanged. Read the installed Next.js accessibility guide first.

All 32 existing tests and TypeScript no-emit checking with incremental disabled pass. git diff --check passes with existing line-ending warnings. No new tests that merely mirror the four markup attributes were added. Actual screen-reader announcements, keyboard focus, contrast and mobile/theme behavior remain unverified because no browser runner or isolated authenticated app stack is available. This is a small markup improvement, not completion of all R4 accessibility acceptance. No production access, deployment, schema change, attachment download or browser outbox mutation. Rollback: remove only these four accessibility attributes, preserving prior R1 fixes and all user data. The preceding production build/HTTP results remain historical; not rerun for this markup-only slice.
Full npm.cmd run lint also completed successfully for this slice.

## 2026-11-16 - R1 search/pagination request failures

Owner requested the next step. Reviewed the open diet-token/errors.md notes without modifying them; those setup notes are historical relative to the completed recovery checkpoint. Found search and pagination awaited query rejections without recovery. Presented a read-only repair scope before changing capture.tsx and focused tests; read the installed Next.js error-handling guide.

searchIdeas now converts returned query errors, rejected requests and null-data responses to a generic recoverable result, without exposing backend details or replacing existing idea state. Successful empty arrays remain successful. loadMore ignores results/errors from obsolete request generations before reporting an error. This lets its existing pending-state cleanup execute after network query failures. No persistence, query filters/cursors, RLS, browser queue or cache policy was changed. Client-construction/configuration failures and unexpected errors outside the query helper remain separate; no complete error-boundary claim.

Added a behavioral test covering returned errors, thrown request errors, null results, empty success and recovery with a successful subsequent call, for search and cursor pagination inputs. All 33 tests, full ESLint, TypeScript no-emit checking with incremental disabled and git diff --check pass (existing line-ending warnings only). The actual browser loading/retry/stale-response UI is not exercised by these helper tests. No new build/browser/backend/deployment checks were performed.

Rollback: revert only this search helper/stale-pagination guard and the new test, retaining earlier R1 and label fixes. No live data access, attachment download, device storage mutation or schema changes. Preservation and browser acceptance gates remain open; R2 account/cache ownership changes require a separate concrete design and review rather than reassigning legacy outboxes.

## 2026-11-16 - R2 queue ownership review prepared

Owner requested the next step. Traced queue creation, mount/display, tombstones, timed replay, sync writes, file-path identity and navigation auth. Prepared R2_QUEUE_REVIEW.md with exact files, behavior, risks, acceptance and rollback. No application changes in this slice. The proposed compatibility change pauses unbound legacy captures/tombstones while retaining every blob and record; no automatic owner assignment is safe from source evidence alone. Root AGENTS.md/repair-plan R2 and unresolved trusted-device decision require concrete owner review before that behavior change. No live profiles inspected, production calls, new tests/check reruns, migrations or downloads. Latest code checks remain 33 tests/lint/types from the preceding R1 slice; browser/preservation gates remain open.

## 2026-11-16 - R2 checkpoint reconciliation and mounted-session review

Owner requested continuation. Read the master guide, architecture, repair plan and current R2 reviews against source. Queue, draft and worker reviews record their approved implementations, while the preceding progress entry stops at the earlier queue proposal. Treat that entry as historical. Current source includes owner-bound queues and replay checks, owner-scoped drafts and network-only private worker navigation; no live browser acceptance is inferred.

Fresh npm.cmd test: 44 passed, zero failed. This rerun establishes current automated suite results only. Lint/types/build passes in R2_CACHE_REVIEW.md are prior recorded evidence, not rerun here. No application changes, live profile access, backend operations, downloads or deployment in this checkpoint.

Prepared R2_SESSION_REVIEW.md with concrete scope/files, offline compatibility, preservation risks, acceptance and rollback for mounted-session locking. In particular, unmounting Capture would lose pending files/edit buffers and the recorder cleanup discards chunks, so the proposed gate must retain mounted memory and finalize recording safely. Direct handlers and asynchronous completions need guards beyond existing queue ownership checks. This new behavior awaits owner review under AGENTS.md/R2. Phase 0 and real-browser acceptance remain incomplete; the attachment-download block stays in force. Rollback of this checkpoint: remove only the new review and this appended entry.

## 2026-11-16 - R2 mounted-session lock implementation

Owner continued with “next” after the concrete session review. Implemented that slice after stating scope; read installed Next.js authentication/client guidance and the installed Supabase synchronous auth-callback/deadlock notes. Added use-session-gate.ts; updated Capture, use-recorder.ts and focused behavioral tests. Announced the necessary optional active-operation guard in sync.ts before extending that helper. Earlier source edits remain intact.

Auth sign-out/missing/foreign signals lock synchronously, hiding and disabling the still-mounted workspace and pausing media. Verification occurs outside the auth callback. Reconnect, visibility return and persisted-page restoration verify the original owner; stale verification cannot unlock. Explicitly locked sessions cannot unlock offline. Previously verified open offline capture remains available without remote verification/replay until an explicit identity-change signal. Unmount cleanup invalidates pending operations without clearing persistent data.

Generation guards cover search/pagination, signing, replay, captures, edits, status, deletion and direct uploads. Direct mutations verify identity and replay accepts a guard between its existing steps. Edits remain open until confirmed success. No stale completion starts its next mutation, updates idea results or removes queue entries after locking. Requests already sent cannot be recalled, and client checks do not replace RLS or make multi-request workflows atomic.

Capture remains mounted so drafts, edit buffers and pending Files survive a lock. Recording stops normally into retained pending files; late microphone permission is invalidated even across lock/unlock. Active upload inputs are retained immediately in the composer on lock, with a partial-success warning; no automatic upload cleanup or reassignment was introduced. Existing Log out still navigates after success and can unmount unsaved memory-only work. Closing/reloading has the same limitation; full logout integration remains a separate reviewed change. No complete logout-preservation claim.

Final npm.cmd test: 56 passed, zero failed. Added tests cover session signals, stale/rejected/missing verification, offline capture/retry, cleanup, retained drafts/files/edit text, recorder bytes/late permission, delayed direct edits/uploads/signing/pagination/replay, and stopping between replay mutations. An intermediate test exposed an unnecessary extra identity read in deletion; removed that extra read while retaining the generation check. Lint initially caught a ref-capturing initializer and test naming/hook-rule issues; corrected them. Final full ESLint and TypeScript no-emit with incremental disabled pass. Initial restricted build failed fetching six configured Google Fonts; approved network build and the final build after guard refinements compile and generate all 13 pages successfully. git diff --check passes with existing line-ending normalization warnings.

Tests use synthetic hook/service/DOM/storage environments. No real browser installation, two-user backend, screen-reader/focus/media timing, cross-tab signaling, history/router-cache, live data or deployed checks were performed. Phase 0 and real-browser gates remain open. No schema/dependency change, production action, cache purge, original attachment download or original outbox mutation. Rollback: stop rollout and keep affected sessions locked with memory retained while repairing; revert only this slice in development, retaining prior queue/draft/cache guards and all device records. Next work is isolated browser acceptance and a concrete review of explicit logout/navigation preservation.

## 2026-11-16 - Explicit logout preservation review prepared

Owner requested the next step. Traced successful logout navigation, Capture's separate mounted state and recorder unmount discard path. Prepared R2_LOGOUT_REVIEW.md with exact behavior/files, pending-logout coordination, sign-out success/failure recovery, separate-tab login, risks, acceptance and rollback. This changes an explicitly excluded behavior from the preceding slice, so application edits await concrete owner review under AGENTS.md/R2.

Tool discovery found no connected Codex document sessions. Local module resolution found no Playwright, Playwright Core, Playwright Test, Puppeteer or Puppeteer Core. No dependencies were installed, backend/browser services started, live profiles opened or retained recovery resources accessed. Current installed Next.js Cache Components authentication guidance was consulted. No application changes or new code checks in this documentation-only checkpoint; preceding 56-test/lint/types/build results remain historical verification. Original attachment downloads remain blocked and Phase 0/browser acceptance remain incomplete. Rollback: remove only the logout review and this appended entry.

## Phase 0 completion authorization and current verification

Owner explicitly approved plans through Phase 1 and requested completion of Phase 0, with notification before starting Phase 1. This supersedes repeated slice-approval requests within that scope; Phase 1 has not started. The specific prior attachment-download restriction awaits explicit reconciliation, and a fresh device pause must not be inferred from historical confirmation.

Current continuation verified the existing encrypted snapshot SHA-256 against the recorded hash and authenticated decryption using the current user's DPAPI-protected key held only in memory. Table validation passed: 44 captured tables, nine ideas and two file records. No private row content or key was printed. This verifies this machine's current archive recovery, not independent/off-disk portability. Docker's engine was unavailable initially; started the existing Docker Desktop installation hidden to resume isolated verification. No production capture, attachment download, device replay or reset occurred.

Requested the remaining external inputs together: explicit disposition of the attachment-download block, current device/profile work and pause status, and a private separate-disk destination. Current confirmed profile matrix includes Windows Chrome/Opera, iPhone Safari and iPad Safari (Android Chrome optional). Read the iPad/Pencil addendum: sketching/annotation remains later feature scope, not implemented Phase 0 behavior. Full Phase 0 must not be marked complete until file/device/independent recovery and application acceptance evidence is obtained.

Owner reaffirmed that attachment downloads must stay blocked. Supplied the intended IdeaVault folder layout for Windows Chrome, Windows Opera, iPhone Safari, iPad Safari, unfinished recordings, project source, database exports and verification. This is an organizational layout, not evidence that exports exist or a separate disk is available. Requested the absolute separate-disk path and explicit current pause/preservation status. No folder destination or freeze was inferred. Full Phase 0 remains incomplete under the retained byte restriction; Phase 1 remains unstarted. The existing recovery container is running without a published PostgreSQL port; guarded read-only audit launched after archive decryption verification.

Fresh guarded read-only recovery audit completed successfully: 42 tables match exact rows; the two managed migration histories retain their documented timestamp differences with matching Storage identities/hashes and Realtime versions. All 13 policies, 150 constraints, 151 indexes, 12 triggers, 44 RLS settings and 999 privileges match. Owner reads match nine ideas/two file records/two Storage objects; anonymous and unrelated-user reads return zero. Both owned sequences remain collision-safe. Workflow writes were not rerun (databaseWorkflowVerified=false in this read-only invocation); previous rolled-back CRUD evidence remains historical. A new private audit report was retained by the tool. Owner supplied the production Vault URL in response to the backup-location request; that confirms the website but does not supply a filesystem backup path or device-pause confirmation.

## 2026-11-16 - Authorized dashboard, logout, recovery and edit repairs

Owner explicitly requested dashboard privacy/logout preservation first, then attachment recovery and edit conflicts. Implemented that source scope without further permission requests. See [repair scope, acceptance, risks and rollback](RELIABILITY_REPAIRS_2026-11-16.md).

Dashboard/recovery/capture now share the mounted hidden/inert session boundary. Logout locks before asynchronous work, blocks stale verification, preserves memory and offers separate-tab login instead of navigating. Removal preserves local recovery metadata and queued blobs before hiding/removing records, retains all remote bytes and exposes an owner-scoped Restore action. Offline intents are enriched with authoritative metadata before database deletion. Ambiguous upload failures no longer purge bytes and retain original inputs. Text/status updates compare original fields and require an affected row; conflicts retain the editor. Device exports include recovery records, recovery blobs and owner-bound drafts. No existing outbox migration or schema change was made.

Actual final verification: npm.cmd test 74 passed, zero failed; full ESLint passed; TypeScript --noEmit --incremental false passed; production build compiled and generated 13 pages; JavaScript syntax checks for exporter/verifier and git diff --check passed (line-ending normalization warnings only). Intermediate failures were a test expecting the old dashboard/logout structure and React lint findings around helper declaration ordering/render-time clock; corrected and rechecked. Added regression coverage for logout races, dashboard hiding, recovery failures/retries/ownership, original file IDs/timestamps, offline intents/quota failure, stale edits, ambiguous uploads, recovery UI and encrypted device exports including absent recovery DB.

No live data, original attachments, device profiles/outboxes, retained database, production configuration or deployment were accessed/changed. Tests use synthetic services/hooks/storage; browser/backend acceptance remains outstanding. Keep the tab open for memory-only work. Recovery remains device-local, retained files consume storage, and multi-request attachment operations are not transactional. Cross-device attachment additions concurrent with whole-idea deletion still need a reviewed transactional server/soft-delete design after preservation gates pass. Compare-and-set is not full revision history. Phase 0 and proposed modules remain incomplete. Do not claim the entire application or live integrations are verified.

Rollback preserves recovery DB, all outboxes/drafts, encrypted archives and retained objects. Do not refresh active unsaved tabs or reinstate old automatic byte purges/tombstone replay as an emergency rollback. Next action: disposable-browser/synthetic-backend acceptance, followed by review of the remaining transactional attachment boundary; no production migration or deployment performed.

## 2026-11-16 - Disposable-browser acceptance run and 320px top-bar fix

Owner requested a search for unfinished work, then approved fixing it. The uncommitted Playwright harness (playwright.config.ts, tests/browser/: synthetic loopback API fixture on 127.0.0.1:4317, isolated `.next-e2e` build on 4318, external hosts blocked, service workers blocked, fake media devices) had an unrecorded earlier run: 5 passed, 3 failed. Two failures were test-locator defects: `getByRole("alert")` also matched the Next.js route announcer while the application had shown the correct error text. Added an `appAlert` helper that excludes `#__next-route-announcer__`. The width assertion now reports the failing width and overflowing elements.

The third failure was a real defect: at 320px the mobile `VaultTopBar` (sidebar.tsx) placed brand, workspace links and Log out on one non-wrapping row, producing a 377px document and pushing Log out partly off-screen. Added `flex-wrap gap-x-4 gap-y-3`; layout-only, hidden at xl where the sidebar renders. The folder strip extends past the viewport only inside its own horizontal scroller.

Actual verification after the fix: `npx playwright test` 8 passed, zero failed (Chromium headless shell, including its production `next build`), covering 320/390/768/1280px widths without document overflow, keyboard focus outside inert content, logout preservation, cross-account denial, ambiguous attachment deletion/restore, interrupted restore and two-tab edit conflicts. npm.cmd test 74 passed; full ESLint and TypeScript --noEmit --incremental false passed. The 320px screenshot was inspected.

Observed but not addressed: the e2e server log repeatedly reports that `/vault` reads `Date.now()` during prerender via the Supabase server session load (`blocking-prerender-current-time`). Tests pass; needs a separate review against the installed Cache Components guidance. Limits: synthetic fixture backend and one headless Chromium only; no Safari/iPad/iPhone, screen reader, real Supabase/RLS, live data or deployment. Phase 0 remains incomplete. Rollback: revert the sidebar class change and test edits; no data involved.

## 2026-11-16 - /vault runtime-prefetch Date.now() error fixed

Owner asked to finish remaining Phase 0 errors/bugs. Read the installed Next.js 16.4.3 caching, connection() and Cache Components authentication guides. With Cache Components and Partial Prefetching, the Supabase server session load (which compares token expiry with Date.now()) ran during a prerender pass that already had cookies, producing repeated `blocking-prerender-current-time` errors on the e2e server. `src/lib/supabase/server.ts` now awaits `connection()` before reading cookies, so the Supabase server client is created only at request time. It is used only by `/vault`; the static shell (sidebar/top bar/Suspense fallback) is still prerendered (`◐ /vault`). Auth checks, queries and data handling are unchanged.

Actual verification: `npx playwright test` 8 passed with zero `unstable value` errors (previously repeated on every /vault load); a separate single-test run showed no server error output. `npm.cmd run build` compiled and generated 13 pages with no warnings; npm.cmd test 74 passed; ESLint and TypeScript --noEmit --incremental false passed; git diff --check clean apart from line-ending warnings. Rollback: remove the connection() call. Synthetic fixture only; not verified against live Supabase or deployment.

## 2026-11-16 - Owner lifts attachment-download block (two objects only)

Owner explicitly selected "Allow the 2 downloads" for the two Storage objects (1,715,415 declared bytes), superseding the earlier "Keep attachment downloads blocked" decision for those objects only. Scope: read-only retrieval into private encrypted backup, size/hash verification against archived metadata and playback check; no Storage/database changes. The read-only CLI path previously failed (StorageUnsupportedOperationError) and the service-role-key path stays rejected (write-capable credential). Proposed method: owner downloads each object through the Supabase dashboard Storage browser into a private folder; Claude then verifies and packages them with preservation.mjs/backup.mjs. Not yet executed.

Owner chose to supply a separate-disk backup path but none has been received yet. Device-export finding from source: `/login` loads neither Capture nor sync replay (proxy matches only /vault; login redirects only after submit), so a same-origin `/login` tab is a safer place than a Vault tab to run export-device.js on Windows browsers. iPhone/iPad Safari have no on-device console; export needs Mac Web Inspector or a separately reviewed method. Phase 0 remains incomplete.

## 2026-11-16 - Owner-accepted live Vault reset; Phase 0 closed by reset

Owner explicitly chose "Wipe live Vault, start fresh" (after a question that stated it permanently deletes all 9 ideas and 2 attachments, keeps the existing backup as the only copy, and that the attachments must be downloaded first if wanted). Owner has no Mac, so iPhone/iPad Safari outbox export is not possible with the existing tool; owner named `S:\Road to Storm K7\codex test\idea-vault-preservation` as the backup location (same physical volume as the repository, so not an off-disk copy).

Pre-deletion evidence (read-only, `transaction_read_only=on`): live production held 9 ideas (newest 2026-10-29), 2 idea_files, 0 timevault_state, 2 storage.objects (1,715,415 bytes, last changed 2026-10-29) and 1 Auth user. Per-row MD5 of `to_jsonb(row)::text` for ideas, idea_files, timevault_state and storage.objects was compared with the rows decrypted in memory (DPAPI-unwrapped key, never printed) from `run-20261116T002012Z/snapshot.encrypted.json`: all four tables identical (9/2/0/2). No database change had occurred since the snapshot.

Deletion: one transaction via Supabase CLI `db query` (`--yes` after owner confirmation) deleted public.idea_files then public.ideas, guarded to roll back unless exactly 2 and 9 rows were removed. Result: ideas 0, idea_files 0, storage.objects 2, auth users 1. Schema, RLS, policies, bucket, Auth account and application code unchanged; no deployment.

Not done / remaining for the owner: the two Storage objects (attachment bytes) remain in the bucket and are NOT in any backup; download them from the Supabase dashboard if wanted, then delete them there. Direct SQL deletion of storage.objects was not attempted (storage triggers; bytes are managed by the Storage API). Device outboxes were not exported: any unsynced captures on a device will upload into the fresh Vault when that device next opens it; old deletion markers target IDs that no longer exist. Recovery of the old data is possible only from the encrypted snapshot plus its CurrentUser DPAPI key on this Windows account; keep both and do not delete the `.key.dpapi` files.

Phase 0 status: closed by owner-accepted reset rather than by full preservation. The original preservation acceptance (attachment bytes, per-device exports, independent off-disk restore) was not met and is superseded by this decision, not satisfied.

Follow-up (same day): owner deleted the two Storage objects in the Supabase dashboard. Read-only check: ideas 0, idea_files 0, storage.objects 0, buckets 1, Auth users 1. Live Vault is fully empty and ready for fresh use; whether the owner kept local downloads of the attachments is not verified here.

## 2026-11-16 - Phase 1 started: slices 1A + 1B (navigation, idea detail, archive)

Owner said "Start Phase 1" after the reliability fixes were committed (`5c710b8`). Implemented route-aware Vault navigation, `/vault/ideas/[id]` detail/edit, reversible archive/restore and `/vault/archive`, with additive migration `supabase/004_idea_details.sql`. Details, evidence, deploy order and rollback: [PHASE_1_SLICES_1A_1B.md](PHASE_1_SLICES_1A_1B.md). Verified: migration in a disposable Postgres (idempotent, trigger, RLS owner/other), 81 unit tests, 13 browser tests (synthetic fixture), tsc, ESLint, production build. Not applied to production, not deployed, not committed. 1C (projects/search) not started.

## 2026-11-17 - Phase 1 (1A+1B) live

Owner approved "SQL then deploy". Read-only pre-check of production `public.ideas`: 6 expected columns, 4 owner policies, no triggers. Applied `supabase/004_idea_details.sql` via Supabase CLI `db query --remote=<ref> --yes --file`. Read-only post-check: title/original_content/updated_at/archived_at present, trigger `ideas_track_changes`, both partial indexes, `ideas_title_length`, still 4 policies, 0 ideas. Then fast-forwarded `main` 8bdea85 → 8a70c28 (no force); Vercel production deployment `dpl_HAVypGFPykzZcrGusL3wVYMQ6BoQ` READY on kaushik-kamal.vercel.app. Unauthenticated smoke check: `/` and `/login` 200; `/vault`, `/vault/archive`, `/vault/ideas/<id>` redirect to `/login`. No runtime errors in the following 30 minutes. Not verified: logged-in use on the live site (needs the owner's login). Rollback: promote previous production deployment `dpl_FzAA8Zyo7J2vMtk7nAu1h2g27N42` (8bdea85); keep the additive columns.

## 2026-11-17 - Phase 2 (2A+2B+2C) built locally: stages, projects, Engineering Lab, Story Studio

Owner asked for Phase 2 from the final master prompt. After the audit showed the stored stages were raw/exploring/building/done (no "Analyzing") and no project entity existed, the owner chose "Migrate stored values" and "2A + 2B + 2C". Implemented migrations `005_idea_stages.sql`, `006_projects.sql` and `007_story.sql`, plus projects with idea conversion, Engineering Lab and Story Studio (text and structure; images wait for Drive). Details, evidence, deploy order and rollback: [PHASE_2.md](PHASE_2.md).

Verified: migrations run twice in a disposable Postgres 17 container, with 28 SQL behaviour/RLS checks (`tests/sql/phase2-behaviour.sql`); 95 unit tests; 20 browser tests (synthetic fixture, production build); tsc, ESLint and the production build. Not applied to production, not deployed, not committed. No Drive, Gemini or Portfolio Manager work; nothing new is public.

## 2026-11-17 - Phase 2 live

Owner said "go on" after the commit. Read-only production pre-check: PostgreSQL 17.11, 0 ideas (so no stage values to rename), old `ideas_status_check` present, default `'raw'`, 4 idea policies, no project/story tables. Applied `005_idea_stages.sql`, `006_projects.sql` and `007_story.sql` in order via Supabase CLI `db query --remote=<ref> --yes --file`. Read-only post-check: `ideas_stage_check` with exploring/analyzing/building/completed, default `'exploring'`, triggers `ideas_legacy_stage` and `ideas_track_changes`, 4 idea policies unchanged, 12 new tables all with RLS and 4 policies each, 0 anon grants on them, 0 ideas.

Fast-forwarded `main` 8a70c28 → cb108ba (no force; this also released the earlier `b52a288` portfolio commit and `ddd6ae7`). Vercel production deployment `dpl_29dVb8BgPEdppuL3gFz9Fxfv3qTr` READY on kaushik-kamal.vercel.app. Unauthenticated smoke check: `/`, `/login`, `/projects` 200; `/vault`, `/vault/projects`, `/vault/lab`, `/vault/story`, `/vault/projects/<id>`, `/vault/ideas/<id>` redirect to `/login`. The public case study shows the new stage names. No runtime errors in the first hour. A direct anonymous REST probe was inconclusive (the key string extracted from page scripts was rejected as invalid), so anonymous denial rests on the catalog check, not a live request.

Not verified: logged-in use on the live site (needs the owner's login). Rollback: promote `dpl_HAVypGFPykzZcrGusL3wVYMQ6BoQ` (8a70c28); keep the new tables; reversing the stage rename needs a separate reviewed migration (the Vault had 0 ideas at migration time).

## 2026-11-17 - Phase 2 bug review fixes and live permission check

Review found and fixed: (1) an interrupted device-recovery restore of a record saved before migration 005 (`raw`/`done`) was refused as "a different saved version" on retry, because the database now stores `exploring`/`completed`. The comparison now translates the two unambiguous legacy values (`currentStage` in recovery-operations.ts). (2) Deleting a milestone, character or scene/shot cleared its own "Deleted …" confirmation when linked lists refreshed. (3) A relationship from a character to itself now gets a clear message instead of a generic database rejection, and the "+ Add inside" form scrolls into view. Regression tests added. Verified: 96 unit tests, 20 browser tests, tsc, ESLint.

Read-only production catalog check: 12 Phase 2 tables, anon has no privilege on any, RLS enabled on all, 48 owner-only policies, 12 `vault_touch_row` triggers, 11 owner foreign keys to `projects(id, user_id)`. This replaces the inconclusive anonymous REST probe. These fixes are committed but not deployed.

## 2026-11-17 - Phase 2 fixes live; Phase 3 plan drafted

Owner said "yes". Fast-forwarded `main` cb108ba → f1cc3ee; Vercel production deployment `dpl_Di5KCp7HPLBsqTvgxERHSZJUJqn8` READY on kaushik-kamal.vercel.app. Smoke check: public pages 200, Vault routes redirect to login. Rollback: promote `dpl_29dVb8BgPEdppuL3gFz9Fxfv3qTr`. Drafted [PHASE_3_PLAN.md](PHASE_3_PLAN.md) (Google Drive): a proposal only, waiting on owner decisions V-007/V-008a/V-008b/V-013 and Google Cloud and Vercel setup. No Phase 3 code written.

## 2026-11-20 - Phase 3 owner setup done; decisions recorded; 3A plan drafted

Owner completed the Google Cloud setup (project `idea-vault-515017`, Drive API enabled, External/Testing consent screen with the owner as test user, `drive.file` scope, Web client with production and localhost callbacks) and added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `DRIVE_TOKEN_KEY` to Vercel Production (names seen in a screenshot; values not seen). The first client secret was exposed through an IDE selection in conversation; owner confirmed it was replaced, the old one deleted and the downloaded JSON deleted. Decisions V-007/V-007a/V-008a/V-008b/V-013 recorded in DECISIONS.md: personal account, `drive.file` with an owner-picked folder via Google Picker, legacy Supabase files left in place, 1 GB maximum, Supabase fallback only under the bucket limit. Drafted [PHASE_3A_PLAN.md](PHASE_3A_PLAN.md). No code, migration or deployment.

## 2026-11-20 - Phase 3A (Connect Google Drive) built locally

Owner approved the 3A plan ("ok"). Read the installed Next.js 16.4.3 Route Handlers guide. Added migration `supabase/008_drive_connections.sql`, server library `src/lib/drive/` (AES-256-GCM sealing bound to purpose and owner, OAuth state/PKCE/scope/account checks, fetch-only Google calls, connection storage and refresh), six route handlers under `/api/drive/` (connect, callback, disconnect, picker-token, folder, status; each re-checks the Vault owner, POSTs require same origin), `/vault/settings` with Google Picker folder choice, a Settings nav link and `.env.example` names. No new dependencies; no capture, outbox or attachment behaviour changed.

Verified locally: 116 unit tests (20 new in `tests/drive.test.mjs`); 28 browser tests (8 new in `tests/browser/drive.spec.ts` against a synthetic Google added to the fixture: connect, wrong account/broader scope/denied refused and revoked, forged callback, folder probe created and removed, non-folder/ungranted rejected, picker script blocked message, disconnect revokes, expired grant then reconnect, anonymous/other-account/cross-origin denial, 320–1280 px); migration 008 applied twice in a disposable offline `supabase/postgres:17.11.0.018` container plus 17 checks in `tests/sql/phase3a-behaviour.sql` (sealed-only tokens, drive.file only, folder ID rules, server-owned owner/timestamps, account change clears folder, other user and anon denied); tsc; ESLint; production build (26 pages); `git diff --check`. The existing recovery container was not touched; the disposable one was removed.

Found and fixed during testing: `request.nextUrl.origin` named the server's bind address (`localhost`) rather than the browser's host, which broke redirects and the same-origin check; routes now derive the site origin from the forwarded/Host headers.

Observed: `next build` alternately stops with a Next.js `SecurityFatalError` upgrade notice for 16.4.3 and succeeds on retry. No upgrade was run. Whether Vercel's build is affected is unknown.

Not verified: real Google consent, `about.get` and Picker behaviour under `drive.file`, creating a file inside a Picker-granted folder, Vercel. Owner setup still needed: enable Google Picker API, create a restricted API key, add `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` and `NEXT_PUBLIC_GOOGLE_APP_ID`. Not committed, not applied to production, not deployed.

## 2026-11-20 - Phase 3A live; Next.js security patch prepared

Owner chose "Yes, go live" and a separate worktree for the Next.js upgrade. Owner finished the Picker setup; Vercel shows `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DRIVE_TOKEN_KEY` (secret) and `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, `NEXT_PUBLIC_GOOGLE_APP_ID` (config) in Production (names and types only; values not read).

Committed `82ce3f1`. Read-only production pre-check (`transaction_read_only=on`): PostgreSQL 17.11, no `drive_connections`, 0 ideas, 0 projects, 1 Auth user. Applied `008_drive_connections.sql` via Supabase CLI `db query --remote=<ref> --yes --file`. Read-only post-check: RLS on, 4 owner policies, 1 trigger, 9 check constraints, `authenticated` select/insert/update/delete, `anon` no privileges, 0 rows; ideas policies unchanged (4). Note: as with the earlier tables, Supabase's default grants also give `authenticated` TRUNCATE/REFERENCES/TRIGGER; PostgREST does not expose those. Tightening every table's grants is a possible later hardening step.

Fast-forwarded `main` f1cc3ee → 82ce3f1 (no force). Vercel production deployment `dpl_FNWJaRm9jyMz5KdAS77XLe7fQYpf` live on kaushik-kamal.vercel.app (Next.js 16.4.3 build did not stop on Vercel). Logged-out smoke check: `/`, `/login`, `/projects` 200; `/vault`, `/vault/settings`, `/vault/projects` redirect to login; `/api/drive/status` 401 `no-store`; `/api/drive/connect` and `/callback` 303 to login on the production host; POST disconnect/picker-token/folder 401 same-origin, 403 cross-origin or no Origin. No runtime errors in the first check. Rollback: promote `dpl_oop1wQ95tMsp1fCGmE9tZ2Zd1AX3` (f1cc3ee); `drive_connections` can stay.

Not verified yet: logged-in connect, Picker folder choice and disconnect on the live site (needs the owner).

Next.js: `npm audit` listed seven moderate advisories for next >=16.0.0 <=16.4.4. In worktree `../idea-vault-next-16.4.6`, branch `next-security-16.4.6`, commit `1471396` upgrades next and eslint-config-next to 16.4.6 (exact). Verified there: npm audit 0 vulnerabilities, 116 unit tests, 28 browser tests, tsc, ESLint, build (no SecurityFatalError stop). Not merged or deployed.

## 2026-11-20 - Phase 3A live acceptance passed

First live connect attempt failed at Google with `invalid_client` ("OAuth client was not found"): the Production `GOOGLE_CLIENT_ID` value in Vercel did not match the client. Owner re-entered it and redeployed (`dpl_AtpcZH8jLMSsV3d3sfnB6RPNjXaX`, same commit 82ce3f1). Owner then connected Drive and chose the folder on the live site.

Read-only production check afterwards: exactly 1 `drive_connections` row, belonging to the Vault owner; refresh and access tokens both sealed (`v1.` format); scope exactly `drive.file`; folder chosen; connected 2026-11-20 00:50 UTC. A read-only search of the owner's Drive (Google Drive connector) found no "Idea Vault write check" file, live or trashed, so the probe was created and removed as designed. No Vercel runtime errors in the past hour. This verifies real Google consent, `about.get` under `drive.file`, Picker folder grant and write access to a Picker-granted folder. Disconnect/reconnect on the live site was not exercised. Testing mode means Google will expire the grant after about 7 days; the Settings page then shows "Reconnect Google Drive".

## 2026-11-20 - Next.js 16.4.6 security patch live

Owner approved deploying the patch. Cherry-picked the worktree commit onto the working branch as `2d3a7aa` (package.json/package-lock.json only). In this checkout: npm ci, next 16.4.6, 116 unit tests, tsc, ESLint, npm audit --omit=dev 0 vulnerabilities (28 browser tests and the build had already passed on identical code in the worktree). Fast-forwarded `main` 82ce3f1 → 2d3a7aa. Vercel production deployment `dpl_6q8ykeN57DLmM1H8GFZH58ij4Bs6` READY, build log "Detected Next.js version: 16.4.6", no SecurityFatalError stop. Smoke check: `/`, `/login`, `/projects` 200; `/vault`, `/vault/settings` redirect to login; `/api/drive/status` 401; `/api/drive/connect` 303 to login; POST folder 401 same-origin, 403 cross-origin. The live Drive connection row is unchanged (1 row, sealed, folder chosen). No runtime errors. Rollback: promote `dpl_AtpcZH8jLMSsV3d3sfnB6RPNjXaX` (82ce3f1, Next 16.4.3). Temporary worktree and branch `next-security-16.4.6` removed.

## 2026-11-20 - Phase 3B plan drafted

Owner asked to start the 3B plan. Traced both upload paths (`pushIdea` for new/offline captures, `uploadFiles` for adding to an idea), display via signed URLs, attachment removal/recovery, and the recorder. Read-only live check: bucket `attachments` private with a 25 MB limit, 0 objects, 0 `idea_files` rows. Drafted [PHASE_3B_PLAN.md](PHASE_3B_PLAN.md): per-file destination (Drive, Supabase fallback ≤25 MB, or wait for Drive), resumable browser-to-Drive upload with server-verified completion, additive `009_drive_files.sql` extending `idea_files`, owner-checked streaming (≤50 MB) or Open in Drive, unlink-only removal, and a `DRIVE_UPLOADS_ENABLED` switch. No code written.

## 2026-11-20 - Phase 3B built locally (Drive attachments)

Owner approved the 3B plan with a 50 MB in-Vault preview limit. Built: migration `009_drive_files.sql` (additive `provider`/`drive_file_id`/`md5` on `idea_files`, checks, unique Drive link); `src/lib/drive/files.ts` (switch, request validation, completion check, inline-safe types, Range filter); `src/lib/drive/upload.ts` (browser resumable upload, 8 MB chunks, offset re-check, bounded backoff, sessions in a separate `idea-vault-uploads` IndexedDB); routes `/api/drive/upload-session`, `/api/drive/upload-complete`, `/api/drive/file/[fileId]` (owner-checked stream ≤50 MB with Range, sandbox CSP, non-inline types download; larger opens in Drive; missing files show an unavailable page); destination choice in `pushIdea` and `uploadFiles` (Drive, else Supabase ≤25 MB, else wait for Drive); previews, size limits and notices in Capture and the idea page; device recovery carries Drive fields. Switch `DRIVE_UPLOADS_ENABLED` defaults off.

Bugs found by the new tests and fixed: (1) device recovery refused to remove/restore Drive attachments because it required Supabase-style `<owner>/<idea>/` paths; now it accepts exactly `drive/<own Drive ID>`. (2) The 009 check let a Drive row without a Drive ID through (a regex on NULL is unknown, which CHECK accepts); now `drive_file_id is not null` is explicit. Also: a retry of an already-recorded file returns the existing record instead of uploading a second copy.

Verified locally: 134 unit tests (18 new in `tests/drive-upload.test.mjs`; a deliberate break of the fallback rule was caught); 35 browser tests (7 new in `tests/browser/drive-upload.spec.ts`; all existing tests now run with uploads on): Drive upload with folder/tag/size/MD5 checks and previews with Range, interrupted upload resumed after reload with one session, small-file fallback and large-file wait until Drive connects, >50 MB opens in Drive, missing file page, unlink and restore of the same Drive file, add to an existing idea, anonymous/other-account/cross-origin denial; 009 applied repeatedly in a disposable offline Postgres 17 with 15 checks in `tests/sql/phase3b-behaviour.sql`; tsc; ESLint; production build (28 pages); `git diff --check`.

Deploy order matters: the app now selects the new columns, so 009 must be applied before the code is deployed. Not verified: real Google resumable upload from the browser (CORS on a server-created session), real media streaming on Vercel, Safari. Observed, not changed: `idea_files` (migration 003) still grants `anon` table privileges; RLS returns no rows, but an explicit revoke would be a small later hardening. Not committed, not applied, not deployed.

## 2026-11-20 - Phase 3B live (switch on); live acceptance for small files

Owner approved go-live. Committed `f621795`. Read-only production pre-check: `idea_files` had the 8 original columns, 3 policies, 0 rows; 0 ideas; 1 Drive connection. Applied `009_drive_files.sql` via Supabase CLI. Read-only post-check: `provider` (default 'supabase'), `drive_file_id`, `md5`; checks `idea_files_provider_check` and `idea_files_drive_ref_check`; unique index `idea_files_drive_file_key`; 3 policies unchanged; 0 rows. Fast-forwarded `main` 9ac5994 → f621795; switch-off deployment `dpl_7VBJk4pE8zuMWYCUuVRgCVwmvfua` READY and smoke-checked (public 200, Vault redirects, new routes 401 same-origin / 403 cross-origin, no runtime errors). Added Vercel Production env `DRIVE_UPLOADS_ENABLED=1` (plain) and redeployed the same commit as `dpl_57wfw1J5fac3C8up9n2R4HUmBgYY`, READY and smoke-checked.

Live acceptance by the owner: a JPEG photo and a recorded WebM voice note saved through Capture. Read-only check: two `idea_files` rows with provider `drive`, `path = drive/<id>` and an MD5; the Google Drive connector shows both files in the chosen folder with identical byte sizes (54,361 and 142,630). No Vercel runtime errors. This verifies the browser-to-Google resumable upload from a server-created session (the plan's main risk), server-side completion checks and recording on the live site. Not exercised live: multi-chunk uploads (>8 MB), interruption and resume, >50 MB "Open in Google Drive", unlink/restore, Safari. Rollback: remove `DRIVE_UPLOADS_ENABLED` (or set it to 0) and redeploy; or promote `dpl_6q8ykeN57DLmM1H8GFZH58ij4Bs6` (2d3a7aa), which does not read the 009 columns, so it works with them in place (the columns can stay).

## 2026-11-20 - Grant hardening (migration 010) prepared

Owner chose the security tidy-up. Read-only production audit: `ideas`, `idea_files` and `timevault_state` (legacy, 0 rows, unused by the app) still grant `anon` all table privileges; every policy on them is `to authenticated`, so anon already saw no rows. Every public table grants `authenticated` TRUNCATE/REFERENCES/TRIGGER, which the app never uses (TRUNCATE bypasses RLS; not reachable through PostgREST). No public page uses Supabase. Wrote `supabase/010_tighten_grants.sql` (revoke all from anon on those three tables; revoke TRUNCATE/REFERENCES/TRIGGER from authenticated on all public tables; no row, policy or function change). Verified in a disposable offline Postgres 17 with all migrations: 010 applied twice; 11 checks in `tests/sql/grants-behaviour.sql` (anon has no privilege on any public table; owner create/edit/attach/delete unchanged; TRUNCATE denied); 3B checks 15/15 before and after 010 (its anon check now accepts either state); 3A checks 17/17. Not applied to production.

## 2026-11-20 - Migration 010 applied to production

Owner said "yes apply it". Read-only pre-check: 21 anon table privileges across public tables, 48 authenticated TRUNCATE/REFERENCES/TRIGGER, 64 authenticated SELECT/INSERT/UPDATE/DELETE, 62 policies; 2 ideas, 2 attachments, 1 Drive connection. Applied `010_tighten_grants.sql` via Supabase CLI. Read-only post-check: anon 0, authenticated extra 0, authenticated CRUD 64, policies 62, data counts unchanged. Logged-out smoke check unchanged (`/`, `/login`, `/projects` 200; `/vault` redirects; `/api/drive/status` 401); no Vercel runtime errors. No deployment needed. Rollback: re-grant the revoked privileges per table (no data involved).

## 2026-11-20 - Phase 3C plan drafted

Owner asked to start the 3C plan. Read the project schema (006) and workspace: records hold text and web links only, the workspace is online-only with direct confirmed deletes. Drafted [PHASE_3C_PLAN.md](PHASE_3C_PLAN.md): a Files tab per project (resumable upload into `Projects/<title>`, Google Picker linking of existing files in place, optional attachment to a lab entry or component, unlink only, "Check files" for renamed/trashed/missing), additive `011_project_files.sql` (`project_files`, `drive_folders`), viewing through the existing owner-checked route, and no Supabase fallback for projects. Three owner decisions are pending (folder layout, link vs copy, behaviour without Drive). No code written.

## 2026-11-20 - Phase 3C built locally (project files)

Owner approved 3C with all recommended choices (uploads into `Projects/<project title>`, picked files linked in place, project uploads blocked when Drive isn't connected). Built: migration `011_project_files.sql` (`project_files` with same-project entry/component links and a unique Drive file per project; `drive_folders` for Vault-created folders; owner-only, no anon, no TRUNCATE/REFERENCES/TRIGGER; unique `(project_id, id)` indexes on entries and components); upload target generalised to idea or project (`files.ts` `parseTarget`/`targetTags`, `targets.ts` for verification, folders and recording, shared by `upload-session`/`upload-complete`); routes `/api/drive/project-files` (link picked files), `/check` (rename/trash/missing/no-access, 5 at a time, bounded retries), `/[id]` (attach/detach, unlink); `/api/drive/file/[id]` also serves project files and opens Google Docs and sizeless files in Drive; shared Picker module (folder for Settings, multi-file for projects); Files tab and per-entry/component file lists in the project workspace.

Verified locally: 144 unit tests (10 new in `tests/drive-project-files.test.mjs`, two 3B tests updated to the generalised interfaces; a deliberate break of folder reuse was caught); 42 browser tests (7 new in `tests/browser/project-files.spec.ts`: Projects/<title> folders created once and reused, upload attached to a lab entry and listed there, picked files linked in place with hidden/folder/duplicate refusals, Google Doc opens in Drive, Check files for rename/trash/delete, attach to a component and unlink keeping the Drive file, refusal without Drive, anonymous/other-account/cross-origin denial, 320–1280 px); 011 applied twice in a disposable offline Postgres 17 with 26 checks in `tests/sql/phase3c-behaviour.sql`, and the 3A (17), 3B (15) and grant (11) suites still pass after it; tsc; ESLint; production build (30 pages); `git diff --check`.

Deploy order: 011 before the code (the project page now reads `project_files`). Not verified: real Google Picker multi-select and the grant it gives, Drive folder creation inside the chosen folder, Check files against real Drive. Committed as `33e2f9f`.

## 2026-11-20 - Phase 3C live

Owner approved go-live. Pushed `33e2f9f`. Read-only production pre-check: no `project_files`/`drive_folders`; 0 projects; 2 ideas, 2 idea files, 1 Drive connection. Applied `011_project_files.sql` via Supabase CLI. Read-only post-check: both tables present with RLS, 7 policies (no folder update policy), no anon SELECT, no authenticated TRUNCATE or folder UPDATE, touch trigger present, data counts unchanged. Fast-forwarded `main` f621795 → 33e2f9f; deployment `dpl_H1jSXQ8rUMFN1jdQXBdgM8unUeTy` READY; smoke check: `/` 200, Vault pages redirect to login, `/api/drive/status` 401, link route 401 same-origin / 403 cross-origin; no runtime errors.

Live acceptance with the owner, verified from the database (read-only) and the Drive connector: an upload (image/webp, 154,378 bytes, md5 recorded) landed in a new `Projects/drive test` folder inside the chosen Vault folder; a Google Doc and a Google Sheet were linked from the Picker in place (their parent unchanged, not copied); a file was attached to a lab entry; after renaming the Doc in Drive, Check files refreshed its name and set `checked_at` on all three files. Google Docs/Sheets report a size from Drive, so they are stored with a size; they still open in Drive.

During the test the owner saw no Check files result, because confirmations faded after 4 s; the first attempts left `checked_at` empty (most likely run before the rename, or the click did not register; no server logs exist to tell). Follow-up `73cdf45` (deployment `dpl_CAxfR5SvMLSq952oThGni1Z6hXFX`): the check result stays until dismissed, reports names refreshed and any file that could not be checked or saved with a reason, and each update must touch exactly one row. Note: the successful live check ran on the previous deployment, so the original route was working. Verified locally: 144 unit tests, 7 Files-tab browser tests (extended to assert the result persists), tsc, ESLint, build.

Not verified live: uploads over 8 MB with resume, the over-50 MB open-in-Drive path, unlink, trashed/deleted detection against real Drive, Safari.

## 2026-11-20 - Phase 3D plan drafted

Owner asked to plan 3D. Read the story schema (007): characters and story units already carry unique (project_id, id), so project files can reference them with same-project keys. Drafted [PHASE_3D_PLAN.md](PHASE_3D_PLAN.md): images on characters and Structure items (main image plus strip, Add image on cards), an image-first Gallery in the Files tab for story projects, owner-checked thumbnails via Drive, placeholders for missing images, additive `012_story_images.sql`. Awaiting owner approval. No code written.

## 2026-11-20 - Phase 3D built locally (Story Studio images)

Owner approved 3D with all recommended choices (images on characters and every structure level; first image is main, changeable; Gallery inside the Files tab). Built: migration `012_story_images.sql` (`project_files.character_id`/`unit_id` with same-project keys that null on delete, at most one record per file, `is_main` with one main per character and per structure item, a trigger that drops main status when a file moves or its record is deleted, and `project_file_make_main(uuid)`, security invoker, execute for authenticated only); record links generalised (`parseLink`/`linkColumns`, upload and link routes, attach route with `{"main": true}`); `?size=thumb` on the owner-checked file route, fetching Drive's thumbnail server-side with the owner's token (falls back to the full image within 50 MB, else 404); images-only Picker mode; shared file actions (`file-actions.ts`) used by the Files tab and `story-image.tsx` (main image, strip with Make main, Add image / Link from Drive, placeholder when unavailable or failing to load); Gallery view with character/structure filter.

Verified locally: 146 unit tests (2 new; a deliberate break of the one-record rule was caught); 47 browser tests (5 new in `tests/browser/story-images.spec.ts`: portrait by upload and by link, first image main, Make main swap, thumbnails served from Drive's thumbnail and not cached, shot frame inside its scene, Gallery filters, trashed image placeholder with card text intact, character delete keeps the file, refusals for two records, unknown records, anon, other account and cross-origin, 320–1280 px); 012 applied twice after 002–011 in a disposable offline Postgres 17 with 25 checks in `tests/sql/phase3d-behaviour.sql`, and the 3A (17), 3B (15), grants (11) and 3C (26) suites still pass after it; tsc; ESLint; production build.

Deploy order: 012 before the code (the project page now reads the new columns). Not verified: Drive thumbnails under `drive.file` against real Google, the images-only Picker view, real-device performance with many images. Not applied, not deployed.

## 2026-11-21 - Phase 3D live, and server moved to Seoul

Owner approved go-live. Read-only production pre-check (1 project, 3 project files, 2 ideas, 2 idea files, 1 Drive connection; no new columns). Applied `012_story_images.sql`. Post-check: 3 columns, 4 constraints, 2 one-main indexes, trigger present, `project_file_make_main` executable by authenticated only, data counts unchanged. Deployed `ce65cb1` (`dpl_4KLXCMzuoHMkATKaFTyREsPCr2Nw`); smoke check passed, no runtime errors.

Live acceptance with the owner ("everything works"), verified read-only from the database: story project "genesis" with 2 images on a character and 1 on a structure item, all `ok`. Not evidenced in the data: a Make main click (no `is_main` row; the default main needs none), and Check files after trashing an image in Drive (no `checked_at` on that project). Drive thumbnails under `drive.file` are confirmed only by the owner's report that images show.

The owner found the Vault slow. Cause found: Vercel functions ran in the default `iad1` (Washington) while Supabase is in `ap-northeast-2` (Seoul), so each database call crossed the Pacific (the response header showed `icn1::iad1`). Fix `108b99d` (`dpl_B4VsHd1aeQtbyGfy2yTLHwWyQ92m`): `vercel.json` sets `regions: ["icn1"]`; image previews are cached in the owner's browser only (`private, max-age=300`; errors stay `no-store`), so a file trashed in Drive can show for up to 5 minutes until Check files; the two file lookups run in parallel. Verified: 146 unit tests, 47 browser tests, build; live header now `icn1::icn1`, an unauthenticated route went from about 0.28 s to 0.08–0.10 s. Owner: "a bit faster".

## 2026-11-21 - Measured remaining slowness; fewer Google trips per image

Measured from Seoul (no owner session; unauthenticated round trips only): Supabase 0.05–0.08 s, Vault server 0.08–0.14 s, Google Drive API 0.27–0.31 s, Google image host 0.19–0.47 s. The project page already loads its lists in one parallel batch, so Google dominated: two trips per image. Owner approved both changes. `9facd98` (`dpl_7ctoUJEZD72jGMFQwYpnK6nwYfbm`): a warm server remembers each Drive thumbnail link for 30 minutes in memory (keyed by owner and Vault file, at most 500, dropped and re-asked when it stops working), and previews are cached in the owner's browser for 1 hour (`private, max-age=3600`; errors stay `no-store`). Trade-offs accepted by the owner: a picture trashed in Drive can still show for up to an hour until Check files, and the browser keeps recent previews for up to an hour after logout. Verified: 146 unit tests, 47 browser tests (new: a repeat view makes no metadata call; a link that stops working falls back and reports 404; disabling the memory makes the test fail), build; live READY in `icn1`, smoke check passed. Not measured: real logged-in image timings.

## 2026-11-21 - Phase 4 plan drafted

Owner asked to plan the next phase. Phases 1–3 are live; what remains from the final master prompt is the publishing bridge, Portfolio Manager, Gemini and release hardening. Read `006_projects.sql` (`publication_status` exists but nothing sets `published`), `src/lib/workspace.ts` (project edits go browser → Supabase, so the server can't see stage changes), the public `/projects` routes (hard-coded, static) and this Next version's `revalidateTag` docs (`"max"` serves stale once; `{ expire: 0 }` is immediate). Drafted [PHASE_4_PLAN.md](PHASE_4_PLAN.md): 4A publish projects (owner-only drafts, an anon-readable whitelisted `showcases` table, images copied into a public `showcase` bucket at publish, trigger removal on stage/publication/archive/delete changes, request-time public reads), then 4B profile Portfolio Manager and 4C Journal/résumé/media. Five owner decisions pending (V-014 to V-018). No code written.

## 2026-11-21 - Phase 4A built locally (publishing projects)

Owner said "approve 4A". Built: migration `013_showcases.sql` (private `project_showcases` drafts; public `showcases` snapshot with an anon column grant excluding owner and project ids; security-definer `publish_showcase`/`unpublish_showcase`; project triggers that refuse direct publishing and drop the snapshot when a project leaves Completed, is archived, is set to Private/Ready or is deleted; public `showcase` bucket, 5 MB, JPEG/PNG/WebP, owner-folder write/list/delete policies). App: Showcase tab (draft, image choice with descriptions, preview, a confirmation listing exactly what becomes public, publish, unpublish), Portfolio page (published / ready / waiting / completed-private), owner-only preview using the public components, publish route copying Drive images after checking their real bytes, public `/projects` and `/projects/<slug>` reading the snapshot anonymously at request time. The three hand-written case studies stay fully prebuilt. Details and differences from the plan: [PHASE_4_PLAN.md](PHASE_4_PLAN.md#4a-as-built-2026-11-21-local-only).

Verified locally:
- **Unit tests:** 158 (12 new in `tests/showcase.test.mjs`).
- **Browser tests:** 52 (5 new in `tests/browser/showcase.spec.ts`):
  - Draft → preview → confirm → publish; visitors see only the chosen fields; private summary, title, project id, Drive id and Vault routes are absent from the HTML.
  - Unpublish, stage change, archive and Ready each remove the page on the next request; completing or restoring again doesn't republish.
  - Leftover copies are removed when the Portfolio page opens.
  - Refused: stale draft, reserved or taken address, mislabelled image bytes (nothing left behind), direct PATCH to `published`, a non-completed project.
  - Anonymous, other-account and cross-origin requests are denied; anonymous reads of private tables, of `showcases.user_id`/`project_id` and of the bucket listing are refused.
  - Case studies unchanged; layouts checked at 320–1280 px.
  - A deliberate break of the image-content check was caught.
- **Migrations:** 013 applied twice after 002–012 in a disposable offline Postgres 17, with a test-only Storage table stand-in.
  - 61 checks in `tests/sql/phase4a-behaviour.sql` pass.
  - The 3A (17), 3B (15), 3C (26), 3D (25) and grant (11) suites still pass after 013.
  - The Phase 2 suite stops on a missing seed idea, before and after 013 alike. With two seed ideas added by hand it passes 28/28, both with and without 013 (pre-existing suite gap, not fixed).
- **Static checks:** tsc, ESLint, production build (35 pages), `git diff --check`. The disposable containers were removed.

Not verified: real Supabase Storage (bucket MIME/size enforcement, public URL caching, the `list` call), real Drive image bytes, and the Vercel response headers for request-time pages. Unpublished addresses are soft 404s (status 200 with the not-found page and `noindex`). Not committed, not applied, not deployed.

## 2026-11-21 - Phase 4A live

Owner said "commit it and go live". Committed `0fb8dd2`. Read-only production pre-check: 2 projects (0 published), 7 project files, 2 ideas, 2 idea files, 0 storage objects; no showcase tables or bucket; 0 anon table grants. Applied `013_showcases.sql` via Supabase CLI `db query --remote=<ref> --yes --file`. Read-only post-check: both tables with RLS; anon may select only slug, title, category, summary, technologies, sections, links, images, published_at on `showcases` (authenticated also project_id; `user_id` to neither); no insert/update/delete on `showcases` for anon or authenticated; anon has no other public table; `projects_publication_rules` and `projects_drop_snapshot` triggers present; `publish_showcase`/`unpublish_showcase` security definer, executable by authenticated only; public `showcase` bucket (5 MB, JPEG/PNG/WebP) with 3 owner policies; data counts unchanged. (`information_schema` hides column grants from the read-only role, so they were checked with `has_column_privilege`.)

Fast-forwarded `main` 9facd98 → 0fb8dd2 (no force); Vercel `dpl_HeKeLdD27y3RxBoDdBmLPxWAdfCf` in `icn1`. Unauthenticated smoke check: `/`, `/projects` and the three case studies 200 with unchanged titles; an unknown `/projects/<slug>` shows "Project not found" with noindex (soft 404, status 200); `/vault/portfolio` and the preview redirect to `/login`; the publish, unpublish and cleanup routes give 403 cross-origin and 401 without a session; no runtime errors.

Not yet verified live: a real publish and unpublish by the owner (Drive image copy into real Storage, the public page and image, removal on unpublish/stage change). Rollback: unpublish everything, promote `dpl_7ctoUJEZD72jGMFQwYpnK6nwYfbm` (9facd98), then `revoke select on public.showcases from anon`.

Live acceptance (owner, 2026-11-20 22:49 UTC): owner published "genesis" with 3 images. Verified: draft version 3 = live snapshot with 3 images and descriptions; exactly 3 objects in the `showcase` bucket (PNG, 2.1–2.7 MB, `max-age=60`), each served publicly as a real PNG (200, correct bytes); the page has no Drive or Vault references. Storage logs show an earlier publish 16 s before with three other copies; the republish removed them (bucket holds only the 3 in use). As anon: `showcases` public columns readable, `user_id` refused, drafts and `projects` refused, bucket listing returns nothing. An earlier attempt was blocked correctly because the image descriptions were empty. Still not exercised live: unpublish/stage-change removal.

Unpublish verified live (owner, 22:53:59 UTC): project back to `ready`, still Completed and not archived; 0 snapshot rows; 0 objects in the `showcase` bucket; all 3 former image URLs return "Object not found"; `/projects/genesis` shows "Project not found" with noindex and none of the old text; genesis no longer listed on `/projects`; draft (version 3, 3 images) kept; homepage and the three case studies 200; no runtime errors. Not exercised live: removal by stage change, archive or delete (covered by the SQL and browser suites only).

## 2026-11-21 - Clearer image descriptions; Remove for pictures

Owner asked for clearer missing-description messages and found no way to remove a picture from a story card. Showcase editor: an image with an empty description gets a red outline and its own message (linked with `aria-describedby`, `aria-invalid`), a count above the images, and the Publish box explains the block with a "Go to image N's description" button; incomplete drafts still save. Pictures: Remove (the existing unlink; the Drive file is kept) on every character/structure picture, including the main one, and in the Gallery; the Files list button is renamed Unlink → Remove; Remove shows even when uploads are switched off; Story Studio intro text updated. Verified: 158 unit tests, 53 browser tests (new: missing description marked, saved, blocks then publishes; removing a main picture promotes the next and keeps the Drive file; removing from the Gallery), tsc, ESLint, build. No database change.

Open: the character "kihsuok" main picture (`8A4F7556-….jpg`, linked by the Picker, the only picked file) shows "Image unavailable" live while its row is `ok`; the cause (likely trashed, deleted or no longer shared) is not determined because preview requests aren't logged. Owner asked to run Check files.

Live: `750c012` deployed as `dpl_BvT2v4UoQPUCr3MPRS2UKwhkYgLs` (icn1). Smoke check: public pages and case studies 200; Vault pages redirect to login; the remove route gives 403 cross-origin and 401 without a session; no runtime errors. Rollback: promote `dpl_B1RzP4ZQfi2ruiWP2pDdom4dJ1P1` (559e453). Not verified live: the new buttons and messages while signed in.

Resolved: Check files reported the "kihsuok" main picture (`8A4F7556-….jpg`) as in the Drive trash. Not a Vault defect; owner can restore it in Drive and run Check files again, or Remove it.

## 2026-11-21 - Slice 4B plan proposal (Portfolio Manager: profile)

Owner asked to plan the next phase. Read the 4A record, the final master prompt and the homepage source: every public profile fact is a constant in `src/app/page.tsx` and `/` is static. Drafted [PHASE_4B_PLAN.md](PHASE_4B_PLAN.md): private draft, public published row and append-only history (`014_profile.sql`, security-definer `publish_profile`); homepage stays in the static shell and is refreshed by `revalidateTag('profile', { expire: 0 })` from the publish route; a code seed identical to today's text is shown until the first publish; decisions V-019 to V-024 proposed. Documentation only; no code, SQL or deployment. Unverified: whether a throwing cached function keeps serving the last good page in this Next version (V-021).

## 2026-11-21 - Slice 4B built locally (Portfolio Manager: profile)

Owner replied "approve 4B". Built the profile editor (`/vault/portfolio/profile`: introduction, highlights, about, experience and education with optional tools, responsibilities and outcomes, certificates, current focus, contact and links), save/preview/confirm/publish, history with Restore to draft, a Profile entry on the Portfolio page, and the homepage drawn from the published profile. The seed is today's text, moved unchanged. Migration `014_profile.sql` adds `site_owner`, `profile_drafts`, `profile_published` (anon: `content`, `published_at` only), `profile_versions` and `publish_profile`. Differences from the plan, including the V-020 change from `{ expire: 0 }` to `'max'`, are in [PHASE_4B_PLAN.md](PHASE_4B_PLAN.md) "As built" and [DECISIONS.md](DECISIONS.md).

Found by tests and fixed: the shared touch trigger broke every draft update (missing `project_id`); a certificate name over 40 characters blocked publishing; a failed rebuild under `{ expire: 0 }` served the build-time page (the seed) instead of the last good one.

Verified locally:
- **Unit tests:** 166 (8 new in `tests/profile.test.mjs`; `tests/portfolio.test.mjs` now reads the moved markup and seed).
- **Browser tests:** 60 (7 new in `tests/browser/profile.spec.ts`):
  - The untouched homepage, and the editor starting from it.
  - Edit → save → preview → confirm → publish, with the public page matching the preview's main text exactly.
  - Rollback through history (versions 1–3).
  - Refusals: `javascript:` link, HTML in text, stale or malformed draft version, with the public copy unchanged.
  - A database failure during the rebuild keeps the last good page and never the seed, then catches up.
  - Anonymous, other-account and cross-origin denial.
  - 320–1280 px for the homepage, editor, preview and Portfolio page.
- **Migrations:** 014 applied twice after the stand-in, schema and 002–013 in a disposable offline `supabase/postgres:17.11.0.018` container (no network).
  - 63 checks in `tests/sql/phase4b-behaviour.sql` pass: owner draft and version checks; site owner only; no owner guessed when there are several accounts; history append-only; direct writes refused; 18 bad-content refusals; anon reads only two columns; another account can't publish or read history.
  - 4A (61), 3A (17), 3B (15), 3C (26), 3D (25) and grants (11) still pass. Phase 2 stops on its known missing seed idea.
  - Container removed.
- **Day one:** a production build of HEAD before 4B and of the 4B tree, both without database settings, give identical homepage visible text, links and section ids.
- **Static checks:** `/` is still prerendered (○, revalidate 30d) in the build output; tsc, ESLint and `git diff --check` pass.

Not verified: real Supabase (014 not applied), Vercel's handling of `revalidateTag(..., 'max')` and its CDN purge for `/`, the editor's live confirmation against the real site, and a build against the real database. Not committed, not applied, not deployed. Deploy order: apply 014, then deploy; a deploy before 014 fails its build because `/` reads `profile_published` while prerendering.

## 2026-11-21 - Phase 4B live

Owner said "commit it and go live". Re-ran tsc, ESLint and the unit tests (166 pass), then committed `360ff75`. Read-only production pre-check: exactly 1 Auth account; 2 ideas, 2 idea files, 2 projects, 4 project files, 0 showcases, 0 storage objects; no 4B tables or functions. Applied `014_profile.sql` via Supabase CLI `db query --remote=<ref> --yes --file`.

Read-only post-check:
- `site_owner` has 1 row, and it is the one Auth account.
- RLS is on for all four new tables.
- Anon may select only `content` and `published_at` on `profile_published` (not `user_id` or `version`), and nothing on drafts, history or `site_owner`; authenticated has no access to `site_owner`.
- Nobody has insert or update on `profile_published` or `profile_versions`.
- `publish_profile` is security definer and executable by authenticated only; `profile_content_problem` is not executable by authenticated.
- The draft touch trigger is present; 0 published rows; data counts unchanged.

Fast-forwarded `main` ac3e2f9 → 360ff75 (no force); Vercel `dpl_AF4A7YGHeqChTLaYVFiM32423Jpf` READY in `icn1`. Smoke check:
- `/` and `/projects` return 200.
- `/` serves the seed, with no `data-published` attribute and the title unchanged. Its visible text, links and section ids match the pre-4B local baseline; the only difference is the favicon build hash.
- `/vault/portfolio`, the profile editor and the preview redirect to `/login`.
- `/api/profile/publish` gives 403 cross-origin and 401 without a session.
- No runtime errors.

Not yet verified live: a real save and publish by the owner, Vercel's handling of `revalidateTag('profile', 'max')` (the homepage refresh and the editor's "shows it now" check), and restore from history. Rollback: promote `dpl_FaNwUEEQ6arkJQuBvRsqK6bJknGM` (ac3e2f9), then `revoke select on public.profile_published from anon`; the tables can stay.

## 2026-11-21 - Slice 4C plan proposal (résumé, photo, files library)

Owner asked to plan the next phase. Drafted [PHASE_4C_PLAN.md](PHASE_4C_PLAN.md):
- The parent plan's 4C is split. 4C becomes the résumé (stable `/resume`), an optional About photo, and a private files library with deduplication, copied into a public `profile-files` bucket at publish (migration `015_library.sql`). Journal moves to 4D.
- Decisions V-025 to V-030 are proposed.

Found from source: `copyImage` copies showcase images into the public bucket byte-for-byte, so camera metadata such as GPS location would be published. The `showcase` bucket held 0 objects at the 4B go-live check, so nothing is exposed now. 4C proposes re-encoding every public image without metadata (V-029).

Documentation only; no code, SQL or deployment.

## 2026-11-21 - Slice 4C built (résumé, photo, files library)

Owner replied "approve 4C". Built:
- A private files library (Vault → Portfolio → Files).
- Résumé and photo fields in the profile editor.
- A stable `/resume` address.
- Public copies made at publish, and metadata removed from every public image, showcases included.

Migration `015_library.sql` adds `library_files`, the `library` (private) and `profile-files` (public) buckets and `is_site_owner()`, and extends `profile_content_problem` and `publish_profile`. Differences from the plan are in [PHASE_4C_PLAN.md](PHASE_4C_PLAN.md) "As built" and [DECISIONS.md](DECISIONS.md).

Verified locally:
- **Unit tests:** 177, including 11 new in `tests/library.test.mjs`. Fixtures carrying EXIF with GPS, XMP, an ICC profile and an orientation tag come out with none of them and upright, in JPEG, PNG and WebP.
- **Browser tests:** 65, including 5 new in `tests/browser/resume.spec.ts`:
  - Upload, preview and publish; `/resume` serves the exact bytes under the chosen name; the page carries no library id or owner id.
  - Uploading the same file twice stores one copy.
  - The published photo has no metadata and is upright.
  - Removing the résumé, then cleaning up and deleting the file; restoring an old version is blocked.
  - The library is private to its owner.
- **Database:** 015 applied twice after 002–014 in a disposable offline Postgres with a Storage stand-in. 52 checks in `tests/sql/phase4c-behaviour.sql` pass. The 4B (63), 4A (61), 3A–3D and grants suites still pass. The Phase 2 suite stops on the same missing seed idea as before.
- **Static checks and build:** tsc, ESLint and the production build pass. `/` stays static. A build without database settings serves a homepage whose visible text, links and section ids are identical to the pre-4B baseline, and `/resume` answers 404.

Not verified: real Supabase Storage (bucket limits, policies with `is_site_owner()`, `list` search, `?download=` naming), `sharp` running in a Vercel function, and a real upload and publish.

## 2026-11-21 - Phase 4C live

Owner said "commit it and go live". The full browser suite (65) passed first.

Committed `30de53c`.

Read-only production pre-check:
- Exactly 1 Auth account, recorded in `site_owner`.
- 2 ideas, 2 idea files, 2 projects, 4 project files; 0 showcases, profile rows or storage objects.
- No `library_files` table, `library` or `profile-files` bucket, or `is_site_owner`.
- `publish_profile` is owned by `postgres`, which can read `storage.objects`.

Applied `015_library.sql` via Supabase CLI `db query --remote=<ref> --yes --file`.

Read-only post-check:
- **Buckets:** `library` is private and `profile-files` public, both 10 MB and PDF/JPEG/PNG/WebP only. The six owner and site-owner Storage policies are present.
- **`library_files`:** RLS on. Anon has no access. Authenticated can update only `name` and `public_path`, not `sha256`. Both triggers present.
- **Functions:** `is_site_owner` is security definer and executable by authenticated only. `publish_profile` is still a single security-definer function, not executable by anon, and now checks for public copies.
- **Data:** counts unchanged.

Fast-forwarded `main` 8fd40d8 → 30de53c (no force); Vercel `dpl_7n6ErtYiqBzuJmBmN77QP6VsGSbQ` in `icn1`.

Smoke check:
- `/` and `/projects` return 200. The homepage's visible text, links and section ids match the pre-4B baseline; the only difference is the favicon build hash.
- `/resume` gives 404 "No résumé is published." (text/plain, `no-store`).
- The Files, profile editor and preview pages redirect to `/login`.
- `/api/profile/cleanup` and `/api/profile/publish` give 403 cross-origin and 401 without a session.
- No runtime errors.

Not yet verified live: a real upload into the library, a publish that runs `sharp` in a Vercel function, the public copy and `/resume` download name on real Storage, and clean-up.

Rollback:
1. Remove the résumé and photo in the editor and publish.
2. Promote `dpl_FZCXsHbroanZ4nvZHU2n4gUJg4Qx` (8fd40d8).
3. Set `profile-files` to non-public.

## 2026-11-21 - Slice 4D plan proposal (Journal)

Owner asked to plan the next phase. Drafted [PHASE_4D_PLAN.md](PHASE_4D_PLAN.md):
- Private journal drafts and a public snapshot per entry, published and unpublished one by one through security-definer functions (migration `016_journal.sql`).
- Public `/journal` and `/journal/<slug>`, read at request time.
- A homepage Journal link only while an entry is published.
- Project links shown only while the project is public.
- Images from the 4C library.
- An optional one-time "Start from a Lab entry" copy.
- Decisions V-031 to V-037 are proposed.

Documentation only; no code, SQL or deployment.

## 2026-11-21 - Slice 4D built (Journal)

Owner replied "approve 4D". Built:
- The Journal in the Vault (Portfolio → Journal): entry list with status; editor with address, date, summary, plain-text body, an optional project or case study, a one-time copy from that project's Lab entries, and up to 4 library images with descriptions; preview, confirmed publish, unpublish, delete.
- Public `/journal` and `/journal/<slug>`, read at request time.
- A homepage Journal link only while an entry is published.

Migration `016_journal.sql` adds `journal_entries`, `journal_published`, `journal_public()`, `publish_journal_entry` and `unpublish_journal_entry`, and widens the library in-use trigger. Differences from the plan are in [PHASE_4D_PLAN.md](PHASE_4D_PLAN.md) "As built" and [DECISIONS.md](DECISIONS.md).

Found by tests and fixed:
- Revoking the slug and image helper functions made every draft write fail, because they run inside check constraints.
- Accented letters became dashes in suggested addresses and résumé file names.
- Three browser-test timing races, none of them product bugs:
  - A 4C clean-up check passed vacuously while the page was still loading.
  - A 4B text comparison ran before the email link was joined.
  - A Files-page upload happened before hydration.

  The tests now wait for a positive signal.

Verified locally:
- **Unit tests:** 183, including 6 new in `tests/journal.test.mjs`.
- **Browser tests:** 69 on a clean full run, including 4 new in `tests/browser/vault-journal.spec.ts`:
  - Publish, then `/journal`, the entry page (same text as the preview) and the homepage link; unpublishing removes all three.
  - A private project is never named, is named under its public title while its showcase is live, and is unnamed again after.
  - Images are published without metadata and kept while in use.
  - A published entry keeps its address and can't be deleted; drafts and routes are private.
- **Database:** 016 applied twice after 002–015 in a disposable offline Postgres; 54 checks in `tests/sql/phase4d-behaviour.sql` pass. 4C (52), 4B (63), 4A (61), 3A–3D and grants still pass. The Phase 2 suite stops on the same missing seed idea as before.
- **Static checks and build:** tsc, ESLint and the production build pass. `/` stays static. Without database settings the homepage's visible text, links and section ids match the pre-4B baseline, with `data-journal="0"`. `/journal` gives the soft 404.

Not verified: real Supabase (016 not applied), the homepage Journal link refreshing on Vercel, and a real entry.

## 2026-11-21 - Phase 4D live

Owner said "commit it and go live". The full browser suite (69) passed on a clean run first, after the three test races above were fixed.

Committed `7bb3dc4`.

Read-only production pre-check:
- Exactly 1 Auth account, recorded in `site_owner`.
- 2 ideas, 2 idea files, 2 projects, 4 project files, 1 Lab entry; 0 showcases, profile rows, library files or storage objects.
- No journal tables or functions; Postgres 17.11.

Applied `016_journal.sql` via Supabase CLI `db query --remote=<ref> --yes --file`.

Read-only post-check:
- **Tables:** RLS on both journal tables. Anon can read neither table directly. Authenticated can't read the snapshot's `body` or `project_id` and can't insert into it, but can read `draft_version`. Both `journal_entries` triggers are present.
- **Functions:**
  - `journal_public` is executable by anon.
  - `publish_journal_entry` and `unpublish_journal_entry` are executable by authenticated only.
  - All three are security definer.
  - `journal_slug_ok` is executable by authenticated, not anon; `journal_text_ok` by neither.
  - The library in-use guard now checks journal drafts.
- **Data:** 0 published entries; data counts unchanged.

The read-only role can't execute `journal_public` (as intended), so the anonymous read path was confirmed by the Vercel build: its homepage prerender calls it with the publishable key, and a failure would have failed the build.

Fast-forwarded `main` ac1eed8 → 7bb3dc4 (no force); Vercel `dpl_9hggWkKYpuESnBSms1PXXFteXBWn` READY.

Smoke check:
- `/` and `/projects` return 200. The homepage's visible text, links and section ids match the pre-4B baseline (apart from the favicon build hash), with `data-journal="0"` and no Journal link.
- `/journal` and an unknown `/journal/<slug>` give soft 404s (200 with `noindex`). `/resume` gives 404.
- `/vault/portfolio/journal` redirects to `/login`.
- `/api/journal/publish` and `/api/journal/unpublish` give 403 cross-origin and 401 without a session.
- No runtime errors.

Not yet verified live: a real entry published and unpublished, the homepage Journal link refreshing on Vercel, image copies for an entry, and a linked project's name appearing and disappearing.

Rollback:
1. Unpublish every entry.
2. Promote `dpl_6RJxxau1d6MZjrGdu1EkihWCTwKJ` (ac1eed8).
3. `revoke execute on function public.journal_public(text) from anon`.

## 2026-11-21 - Phase 5 plan proposal (Gemini assistant)

Owner asked to plan the next phase. Drafted [PHASE_5_PLAN.md](PHASE_5_PLAN.md): 5A is a read-only, per-project assistant with modes for engineering review, story memory and planning.
- You choose which records to send; the token and cost estimate is shown first.
- Citations are checked against what was sent.
- Private, deletable conversations.
- An app-enforced monthly ceiling and daily cap.
- Off by default behind a kill switch.

5B (proposals with Accept and Reject) and 5C (file text) are outlined for later approval. Decisions V-038 to V-044 are proposed.

Checked on aistudio.google.com on 2026-11-21:
- Free-tier prompts and responses may be used to improve Google's products and read by human reviewers; paid-tier ones are not.
- Gemini 3.8 Flash costs $0.75 / $3.75 per 1M tokens until 31 Dec 2026, then $1.50 / $7.50.
- Image models aren't on the free tier.
- The API requires users aged 18 or over.
- South Korea and Bangladesh are available regions.

`IDEA_VAULT_3_CODEX_MASTER_GUIDE.md` is still absent from the tree and git, so the plan follows the final master prompt, the roadmap and SECURITY.md.

Documentation only; no code, SQL, keys or deployment.

## 2026-11-21 - Slice 5A built locally (read-only Gemini assistant)

Owner replied "approve 5A". Built:
- An Assistant tab on each project, shown only when switched on. Modes: Engineering review, Story memory and Planning. A checklist of the project's records, nothing ticked by default, with a size and cost estimate before sending. Answers show each citation as a link to its record and flag citations of anything not sent. Saved, deletable conversations with follow-ups.
- An Assistant section in Settings: status, this month's spend, today's questions, delete all.
- Migration `017_ai.sql`: `ai_conversations`, `ai_messages`, the `ai_usage` ledger (rows added only through `record_ai_usage`), `ai_usage_now()`.
- The route `/api/ai/ask` and a REST adapter for Gemini's `generateContent` (key in the `x-goog-api-key` header; no tools; thinking set to low; 60-second timeout).

Differences from the plan are in [PHASE_5_PLAN.md](PHASE_5_PLAN.md) "5A as built" and [DECISIONS.md](DECISIONS.md).

Found while building:
- A question and its answer, inserted together, got the same `now()` timestamp, so their order was unreliable. The trigger now uses `clock_timestamp()`, checked by the SQL suite.
- AI Studio logs requests by default (up to 55 days) in new projects. This is added to the owner's setup.

Verified locally:
- **Unit tests:** 190, including 7 new in `tests/ai.test.mjs`: labels, sending only the selection, citation checks, prices including the 1 Jan 2027 change, caps, the off switch, and that the key stays on the server in a header with no tools.
- **Browser tests:** 74, including 5 new in `tests/browser/assistant.spec.ts`, against a fake Gemini that records its requests:
  - Exactly the ticked record is sent (no other record, owner or project id, or email); the key is in the header and absent from every script and page.
  - The cited answer links to its record; the conversation is saved and reopens; a follow-up carries earlier turns; no project table changed.
  - An invented citation is flagged and HTML stays text.
  - The monthly ceiling and daily cap refuse before any call, and Settings shows Paused.
  - A Gemini failure saves nothing and costs 0.
  - Visitors and other sites are refused, and records from another mode are refused.
  - Delete all keeps usage.
- **Database:** 017 applied twice after 002–016 in a disposable offline Postgres; 25 checks in `tests/sql/phase5a-behaviour.sql` pass. All earlier suites still pass, except the Phase 2 suite, which stops on the same missing seed idea as before.
- **Static checks and build:** tsc, ESLint and the production build pass; `/api/ai/ask` is a request-time route and `/` is unchanged and static.

Not verified: real Gemini (no key exists yet), real token counts against Google's billing, AI Studio logging settings, and 017 on real Supabase. Not committed, not applied, not deployed. Pending before go-live: the owner's confirmation of age 18+ (Gemini API terms) and the key setup.

## 2026-11-21 - Phase 5A live, switched off

Owner said "commit it and go live". Committed `8627786`.

Read-only production pre-check: 1 Auth account; 2 ideas, 2 idea files, 2 projects, 4 project files, 1 Lab entry; 0 journal entries, library files or storage objects; no `ai_` tables.

Applied `017_ai.sql` via Supabase CLI `db query --remote=<ref> --yes --file`.

Read-only post-check:
- **Tables:** RLS on all three `ai_` tables. Anon can read none of them.
- **Writes:** authenticated can't insert, update or delete `ai_usage`, can't edit messages, and can't move a conversation to another project.
- **Functions:** `record_ai_usage` is security definer and executable by authenticated only; `ai_usage_now` likewise authenticated only. The message trigger uses `clock_timestamp()`.
- **Data:** 0 usage rows; data counts unchanged.

Vercel environment checked by name only, no values read: there is no `GEMINI_API_KEY`, `AI_ENABLED` or other AI setting. So the assistant is off: no Assistant tab, and `/api/ai/ask` answers "off" to the owner.

Fast-forwarded `main` 9021f83 → 8627786 (no force); Vercel `dpl_9KAtsJ1r4uft2Pj2g13h2pGFvqo1` READY.

Smoke check:
- `/` and `/projects` return 200. The homepage's visible text and section ids match the pre-4B baseline.
- `/journal` is a soft 404 and `/resume` gives 404.
- `/vault/settings` and `/vault/projects` redirect to `/login`.
- `/api/ai/ask` gives 403 cross-origin and 401 without a session.
- No runtime errors.

Not yet done or verified:
- The owner's confirmation of age 18+ (Gemini API terms).
- The key setup: billing, a restricted key, AI Studio logging off or 7 days, a $5 budget alert, and `GEMINI_API_KEY` in Vercel.
- Switching on with `AI_ENABLED=1` and a redeploy.
- A real question and its cost checked against Google's usage.

Rollback: promote `dpl_FKg1MKdoNHtcaScdjZ9AN8jPbuju` (9021f83). The 017 tables can stay; they're unused while the assistant is off.

## 2026-11-21 - Phase 6 plan proposal (hardening and launch)

Owner asked to plan the next phase. 5B was deferred because 5A isn't switched on or tried with a real key yet.

Checked:
- No backup covers current data. The only snapshot predates the 16 Nov reset and the 4A–5A tables. `scripts/vault/` exports a fixed list of old tables and no Storage bytes.
- The live site sends only Vercel's HSTS header; there is no CSP or framing protection.
- There is no CI.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- The service worker never caches private pages (the old audit item is resolved).
- Whether Supabase Auth sign-ups are disabled is unverified.
- The Drive OAuth app is still in Testing mode.

Drafted [PHASE_6_PLAN.md](PHASE_6_PLAN.md):
- **6A:** a one-command encrypted backup of the whole database and all Storage bytes, a restore drill into a disposable database, and Download my data. Asked for approval first.
- **6B:** security headers and the sign-up check.
- **6C:** CI, accessibility and performance checks, the runbook, and the Drive OAuth app to Production.
- Decisions V-045 to V-049 are proposed.

Documentation only; no code, SQL or deployment.

## 2026-11-21 - Slice 6A built (backups, restore drill, Download my data)

Owner replied "approve 6A". Built:
- `scripts/vault/backup-live.mjs`: a read-only, encrypted backup of the live Vault (every public table found at run time, accounts without secrets, Storage settings, objects and bytes, the security catalog).
- `scripts/vault/restore-drill.mjs`: restores into a disposable offline Postgres and compares per-table fingerprints, file hashes and the catalog.
- `scripts/vault/live-archive.mjs`: the archive format and helpers.
- Settings → Your data → Download my data (`GET /api/export`).
- `.gitignore` guards backups and exports; the README section describes how to back up and restore today's data.

Verified:
- **First production backup (read-only, one-time passphrase):** 30 tables, 1 account, 0 stored files, about 2.5 minutes.
- **Drill:** all 30 tables restored identical to production. The security catalog matched apart from the legacy `timevault_state` table (rebuilt from its columns) and a production-only `rls_auto_enable()` function (security definer, executable by anon and authenticated; to check in 6B). A wrong passphrase was refused. The test archive and passphrase were deleted afterwards.
- **Storage:** listing via the CLI works. Downloading real bytes is untested because production has 0 objects; the code checks every object's presence and size.
- **Unit tests:** 197, including 7 new in `tests/export.test.mjs`: encryption round trip, wrong passphrase and tamper refused, fingerprints, the catalog comparison, the outside-repo rule, read-only queries, the export covering every table, and no Drive tokens.
- **Browser tests:** 75, including the new `tests/browser/export.spec.ts`: download from Settings, contents, no secrets, nothing changed, cross-site and anonymous requests refused.
- **Static checks and build:** tsc, ESLint and the build pass.

## 2026-11-21 - Phase 6A live; 6B plan proposal

Owner said "commit it and go live". Committed `e4b73c1` (no migration). Fast-forwarded `main` 511bee2 → e4b73c1; Vercel `dpl_HpvRsaeRy6R7GeTacXjaKZJzkBt3` READY.

Smoke check:
- `/` and `/projects` return 200; the homepage's visible text and section ids match the pre-4B baseline.
- `/journal` is a soft 404 and `/resume` gives 404.
- `/vault/settings` redirects to `/login`.
- `/api/export` gives 401 anonymous and 403 cross-site, with `Cache-Control: no-store`.
- No runtime errors.

Not yet done: a backup with your own passphrase (the drill run used a one-time passphrase, and that archive was deleted). Rollback: promote `dpl_EcqBKbGuqK6vpEAS7Capapdne3Kt` (511bee2).

Owner then asked to plan the next phase. Drafted the 6B section of [PHASE_6_PLAN.md](PHASE_6_PLAN.md): five enforced headers, a CSP in report-only mode (enforced in local browser tests) with a report endpoint, enforcement after a week of clean use, and turning sign-ups off. Decisions V-050 to V-053 are proposed.

Read-only checks for it:
- Only HSTS is sent live.
- The git history (83 commits) holds no secrets.
- `rls_auto_enable()` is Supabase's protective event trigger and isn't callable through the API.
- The sign-up setting couldn't be read automatically and is left to the owner's dashboard check.

## 2026-11-21 - Slice 6B built locally (security headers, CSP)

Owner replied "approve 6B". Built:
- Five protective headers on every response.
- A Content-Security-Policy: report-only on the live site, enforced in the local browser build.
- `/api/csp-report`, which logs only the directive and the blocked origin.

Details are in [PHASE_6_PLAN.md](PHASE_6_PLAN.md) "6B as built" and [DECISIONS.md](DECISIONS.md).

Found by tests and fixed: the site-wide CSP replaced the Drive file route's own `default-src 'none'; sandbox` policy; the existing Drive browser test caught it. The site CSP now skips `/api/drive/file/*`, and a test checks that route keeps its sandbox. Also fixed a timing race in the journal browser test (not caused by the CSP).

Verified locally:
- **Browser tests:** 80, with the CSP enforced on every page. The suite produced zero violation reports, and a deliberate violation is blocked and reported, so the reporting works. Headers are checked on `/`, `/projects`, `/journal`, `/login`, `/vault`, `/api/export` and `/sw.js`.
- **Unit tests:** 202, including 5 in `tests/security-headers.test.mjs`.
- **Static checks and build:** tsc, ESLint and the build pass, and `/` stays static.

Not verified: the live Google Picker, Drive uploads from the browser, and the recorder under the policy (live reports will show them); the sign-up setting (owner). Not committed, not deployed.

## 2026-11-23 - Phase 6C plan proposal (quality gates and runbook)

Owner asked for the next phase. 6B is committed (`f04bc47`) but not live; `main` is still `fa269ca`.

Read-only checks for 6C:
- There is no CI and no `.github/` folder.
- The 11 SQL suites have no runner and have been run by hand.
- The Phase 2 suite never creates the two ideas its project checks use.
- There are no automated accessibility or performance checks.
- The README lists 3 of 18 SQL files and 3 of about 15 settings.
- The Drive OAuth app is still in Testing.
- The repo's visibility (which decides the Actions minutes) couldn't be read, because `gh` isn't signed in.

Drafted the 6C section of [PHASE_6_PLAN.md](PHASE_6_PLAN.md):
- GitHub Actions CI with no secrets: types, lint, unit, build, the SQL suites through a new runner, browser tests, and an audit.
- axe accessibility checks at 320, 768 and 1280 px.
- A byte budget for `/`.
- The Phase 2 seed fix.
- `docs/RUNBOOK.md`.
- The Drive OAuth app moved to Production.

Decisions V-054 to V-059 are proposed.

Documentation only; no code, SQL or deployment.

## 2026-11-23 - Phase 6B live (headers enforced, CSP report-only)

Owner said "6B go live". No migration.

Re-checked `f04bc47` locally: 202 unit tests, tsc, ESLint and the build pass, `/` stays static, and `npm audit --omit=dev` finds 0 vulnerabilities. The 80 browser tests had passed on this code before the commit.

**No backup was taken (V-047 step 1).** The backup needs the owner's own passphrase, and 6B changes no data or schema.

Before go-live, the live site sent only HSTS on `/`, `/vault` and `/api/export`. Fast-forwarded `main` fa269ca → f04bc47 (no force). The new headers were served about 50 seconds later.

Smoke check (logged out):
- **Headers:** all five protective headers and `Content-Security-Policy-Report-Only` on `/`, `/projects`, `/journal`, `/resume`, `/login`, `/vault`, `/vault/settings`, `/api/export`, `/api/ai/ask`, `/sw.js` and `/api/csp-report`.
- **CSP:** names the Supabase project, `apis.google.com`, `www.googleapis.com` and `docs.google.com`, and reports to `/api/csp-report`.
- **Status codes unchanged:**
  - `/`, `/projects`, `/login` 200.
  - `/journal` is still a soft 404 (status 200) and `/resume` gives 404.
  - `/vault` and `/vault/settings` redirect to `/login`.
  - `/api/export` gives 401, and 403 cross-site.
  - `/api/ai/ask` gives 401 without a session and 403 cross-site.
  - `/api/drive/file/*` gives 401 without the site CSP; its own sandbox policy applies to real file responses.
- **Homepage:** visible text and section ids identical to just before the go-live.
- **Report endpoint:** a test report was accepted (204).

Not verified:
- **Vercel's records:** the test report's log line, the deployment id and runtime errors. No Vercel CLI or connector was available in this session.
- **Under the policy, live:** the Google Picker, browser Drive uploads, the recorder and the assistant. Real use over the next week will show any reports.
- **Sign-ups:** whether new sign-ups are off (owner dashboard check, V-053).

**Next:** after about a week with no unexplained `csp-violation` lines in Vercel's runtime logs, add `CSP_ENFORCE=1` (Production) and redeploy.

**Rollback:** promote the previous production deployment (fa269ca, the same app as e4b73c1, `dpl_HpvRsaeRy6R7GeTacXjaKZJzkBt3`). No database change.

## 2026-11-23 - Slice 6C built (CI, SQL runner, accessibility, homepage budget, runbook)

Owner replied "approve 6C" (decisions V-054 to V-059 recorded). Details are in [PHASE_6_PLAN.md](PHASE_6_PLAN.md) "6C as built".

Built:
- **GitHub Actions CI** with no secrets, in three parallel jobs:
  - checks: typegen, tsc, ESLint, unit tests, `npm audit --omit=dev --audit-level=high`;
  - database suites;
  - build and browser tests.
- **`npm run test:sql`:** a disposable offline Postgres, every migration applied, then 004–017 again, then every suite.
- **Phase 2 SQL suite:** creates its own seed rows.
- **Browser specs:** axe on 5 public pages and 9 Vault screens at 320, 768 and 1280 px, with a canary proving axe reports violations; a homepage byte budget.
- **`docs/RUNBOOK.md`**, and the README now points to it.

Verified:
- **This PC:**
  - `npm run test:sql`: 11/11 suites, 377 checks, about 18 s. Phase 2 alone on a fresh database: 28/28.
  - Browser: the accessibility, budget and canary specs pass. The full suite ran twice: 84 tests in all, with only the since-fixed intermittent projects test and my first accessibility waits failing.
  - Type check, lint and unit tests (202) also pass.
- **Clean checkout (temporary worktree):** typegen and tsc pass, and the 202 unit tests pass.
- **Unit tests in a Linux container:** reproduced the CI failure, a shallow-history issue.
- **CI run `45091939858` on `f42f615`:** all three jobs green.
  - Database suites: 36 s.
  - Checks: 60 s.
  - Build and browser tests: 84 passed, 6.6 min.
- **Deliberately broken throwaway branch `ci-canary-6c` (run `45092731189`):**
  - the failing unit test failed the checks job;
  - the failing SQL file failed the database job, with a file annotation;
  - an unlabeled button on `/login` failed the public accessibility test (`button-name`, critical);
  - a 160 KB script on `/` failed the budget (scripts 311,859 B against 159,558 B).

  The other 82 browser tests passed. The branch was deleted locally and on GitHub.
- **No secrets anywhere in CI:**
  - The workflow holds no secrets and uses `permissions: contents: read`.
  - The fixture uses dummy values and a random token key per run.
  - Uploaded failure artifacts hold synthetic data only.
- **Runbook coverage:** every variable in `.env.example` and the full migration range (`schema.sql`, 002–017).

Not done or not verified:
- **Drive OAuth to Production:** waits on the owner. It needs a privacy policy page and domain verification (see "6C as built").
- **Colour contrast:** not machine-checked (gradient backgrounds).
- **404 pages:** they have no `main` landmark (owner decision).
- **Vercel preview of the throwaway branch:** probably built, and harmless. It can be deleted in Vercel → Deployments; not checked here, since there was no Vercel access.
- **Lint:** an existing warning (an unused `page` in `tests/browser/vault-journal.spec.ts`).
- **Audit:** 7 moderate dev-only advisories (`minimatch` under the ESLint tooling), already there before this work. CI gates production dependencies at high.

Nothing deployed and no `src/` change. The commits are on the working branch (`ecfda75`, `43b9537`, `f42f615`), and `main` is unchanged.

## 2026-11-23 - Phase 6D plan proposal (launch close-out)

Owner asked for the next phase. 5B stays deferred (5A isn't switched on with a real key yet).

Read-only checks:
- **Contrast:** a rough worst-case contrast probe (gradient stops, semi-transparent layers treated as solid) flagged likely real low contrast:
  - teal labels on `/projects` and case studies, about 3.2:1;
  - homepage chips, which need a visual check;
  - Vault muted text near the top, about 4.4:1.
- **Privacy:** the public site has no analytics, trackers or visitor cookies.
- **Brand verification:** Google needs a privacy policy on the same domain and Search Console domain ownership before the OAuth app can be published; `drive.file` is non-sensitive.
- **Completion review:** `COMPLETION_REVIEW.md` is from 2026-11-16 and is out of date.

Drafted the 6D section of [PHASE_6_PLAN.md](PHASE_6_PLAN.md):
- a pixel-based contrast check and colour-token fixes;
- a site-styled 404 page;
- a `/privacy` page whose text the owner approves;
- Drive OAuth to Production;
- enforcing the CSP on or after 2026-11-30;
- a refreshed completion review against the 12 acceptance items.

Decisions V-060 to V-064 are proposed.

Documentation only; no code or deployment.
