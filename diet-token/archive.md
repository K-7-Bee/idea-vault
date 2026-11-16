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
