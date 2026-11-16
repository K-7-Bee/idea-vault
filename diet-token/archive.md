# Archive

<!-- Cold storage. Never read whole; search with grep.
Lines are appended unchanged, each batch under a heading:
## from <file>, YYYY-MM-DD -->

## from errors.md, 2026-11-15
### E1 (T2) - Production build cannot download Google Fonts
- Symptoms: `npm.cmd run build` exits 1 during Turbopack font fetching.
- Evidence: `Failed to fetch Galada from Google Fonts.` Also Geist, Geist Mono, Instrument Serif, Inter and Manrope fail with connection errors.
- Tried: Existing build command once; no font/source changes or blind retries. Tests 16/16 and standalone TypeScript pass. Lint exits 0 with one warning in untouched docs/design/verify-hero.mjs:7.
- Next diagnostic step: Check build-environment connectivity to fonts.googleapis.com and retry only after that changes; then perform authenticated browser QA. No live preservation verified.

## from task-todo.md checkpoint, 2026-11-16 (historical, superseded)

- Task: T3 - real backup credential preflight and PC readiness
- Done so far: CLI 3.1.0 confirmed; existing authentication unavailable (projects list exit 1); no DB credentials/project link found. Read-only hardware/runtime report recorded in PRODUCTION_BACKUP_STATUS.md.
- Next action: Owner signs into CLI locally and supplies non-secret production reference; independently check DB/Storage permissions. Runtime changes/install/restart now require separate explicit approval.
- Files in play: docs/vault/PRODUCTION_BACKUP_STATUS.md; docs/vault/PROGRESS.md; diet-token/task-todo.md; diet-token/errors.md.
- Uncommitted changes: Current reports and earlier app/docs; do not stage unrelated changes or supabase/.temp.
- Unresolved: No real backup, hashes, row counts or restore. Docker missing; WSL not operational. Windows feature inspection requires elevation and was not pursued.

## from errors.md, resolved 2026-11-17

### E2 (T3) - Local restore runtime unavailable
- Symptoms: Docker absent from checked PATH/default location; wsl --status reports WSL not installed. Preflight refuses readiness.
- Evidence: local-container-runtime check false; elevated destination/ACL/capacity/CLI checks true.
- Tried: Installed exact Supabase CLI 3.1.0 privately; version/help checks pass. No Windows feature install or reboot triggered. Earlier CIM inspection was access-denied; capacity obtained through DriveInfo instead.
- Next diagnostic step: Establish Windows Docker-compatible runtime and virtualization prerequisites; rerun read-only preflight. Secure export access and device preservation gates remain pending independently.

### E3 (T3) - Production export authentication unavailable
- Symptoms: Installed Supabase CLI projects-list check exits 1; sanitized output indicates authentication unavailable. No DB/export/Storage permissions verified.
- Evidence: No relevant credential environment variables, repo env configuration, project-ref or explicitly checked credential files present. No export attempted.
- Tried: Read-only CLI version/authentication and bounded file-presence checks; suppressed raw CLI response. No tokens/passwords exposed, production mutations or login automation.
- Next diagnostic step: Owner completes local CLI login and confirms production project reference; verify secure DB credentials and export permissions separately. Docker/WSL runtime remains unavailable; no install/admin changes authorized without separate approval.
