# Runbook

How to run, change, deploy, roll back and recover the site (`https://kaushik-kamal.vercel.app`): the public portfolio at `/` and the private Idea Vault at `/vault`. Written 2026-11-23 (Phase 6C). Where this disagrees with an older plan, this file wins; the history is in [docs/vault/PROGRESS.md](vault/PROGRESS.md).

## Where things live

| Part | Where | Notes |
| --- | --- | --- |
| Code | GitHub `K-7-Bee/idea-vault` (public). Work happens on a branch; `main` is production. | Never commit `.env*`, keys, backups or exports (`.gitignore` guards them). |
| Hosting | Vercel project, region `icn1`. Every push to `main` deploys production. Other branches get preview deployments. | Settings live in Vercel → Project → Settings → Environment Variables. |
| Database, accounts, files | Supabase project (`<ref>`: the subdomain of `NEXT_PUBLIC_SUPABASE_URL`). | Postgres with row-level security on every table; Storage buckets `attachments`, `library`, `showcase`, `profile-files`. |
| Supabase CLI | `S:\Road to Storm K7\codex test\idea-vault-preservation\tools` (already logged in). | Always pass `--remote=<ref>` explicitly. |
| Google Drive | Your Google Cloud project's OAuth app; the scope is `drive.file` only. | Files stay in your Drive; the Vault stores references and sealed tokens. |
| Gemini | Google AI Studio / Cloud billing project. | Off unless switched on (below). |
| CI | GitHub Actions, `.github/workflows/ci.yml`. No secrets; never deploys. | Logs are public because the repo is. |

## Settings (environment variables)

Set in Vercel for **Production** (and Preview only if you test previews against real services). Local development uses `.env.local` (copy `.env.example`). Changing one needs a redeploy to take effect.

| Name | Needed | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The Supabase project URL. Also builds the CSP's allowed origins. Visible in the page by design. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key. Visible in the page by design; row-level security protects the data. |
| `ALLOWED_EMAIL` | Yes | The only email allowed into `/vault`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Drive | The OAuth client. Server only. |
| `DRIVE_TOKEN_KEY` | For Drive | 32 random bytes (base64) that seal Drive tokens in the database. **Keep a copy in your password manager**: it isn't in backups, and without it stored Drive connections can't be unsealed (you'd reconnect). |
| `DRIVE_GOOGLE_ACCOUNT` | Optional | The Google account allowed to connect Drive; defaults to `ALLOWED_EMAIL`. |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, `NEXT_PUBLIC_GOOGLE_APP_ID` | For the Picker | Visible in the page by design; restrict the key to this site and the Picker API. |
| `DRIVE_UPLOADS_ENABLED` | Switch | `1` sends new attachments to your Drive folder. Unset: Supabase Storage. |
| `GEMINI_API_KEY` | For the assistant | Server only. From a billing-enabled project, restricted to the Generative Language API. |
| `AI_ENABLED` | Switch | `1` (and a key) shows the Assistant. Unset: off everywhere. |
| `GEMINI_MODEL`, `AI_MONTHLY_USD`, `AI_DAILY_REQUESTS` | Optional | Model (default `gemini-3.8-flash`), monthly ceiling in USD (default 5), questions per day (default 40). |
| `CSP_ENFORCE` | Switch | `1` enforces the Content-Security-Policy. Unset: report-only (reports go to `/api/csp-report` and appear in Vercel's runtime logs as `csp-violation …`). |

Test-only settings (`VAULT_E2E`, `DRIVE_GOOGLE_TEST_BASE`, `GEMINI_TEST_BASE`, `CSP_REPORT_URI`) are set by `tests/browser/app-server.mjs`. **Never set them in Vercel.**

## Checks

| Command | What it proves | Time (this PC) |
| --- | --- | --- |
| `npx tsc --noEmit` and `npm run lint` | Types and lint | < 1 min |
| `npm test` | Unit tests | < 1 min |
| `npm run test:sql` | Applies `schema.sql` and every migration to a disposable offline Postgres (Docker), re-applies 004 onwards, then runs every suite in `tests/sql/`. `npm run test:sql -- phase2` runs a single suite. | about 20 s, plus image download the first time |
| `npm run test:browser` | Builds the production app against a fake Supabase/Google/Gemini and runs every browser spec, with the CSP enforced, axe accessibility rules, pixel-measured text contrast (WCAG AA, light and dark) and the homepage byte budget. | about 15–20 min |
| `npm audit --omit=dev` | Known vulnerabilities in production dependencies | seconds |

CI runs all of these on every push. **A commit goes live only when CI is green on it** (V-056).

## Keeping the privacy page true

`/privacy` (`src/app/privacy/page.tsx`) describes exactly what the site does with data. Update it in the same change whenever that changes: a new analytics or tracking script, cookies on public pages, a new Google scope, the assistant sending new kinds of data, or a new service that receives data. Google's brand verification relies on it.

## Changing the database

1. Write a new numbered, **re-runnable** file `supabase/NNN_name.sql` (`if not exists`, `create or replace`, `drop … if exists` before re-creating). Additive changes only; never drop or rewrite data without a separate, approved plan.
2. Add a behaviour suite `tests/sql/phaseX-behaviour.sql` that creates the accounts and rows it needs (suites share one database and run in name order).
3. `npm run test:sql` until it passes.
4. Apply to production only during a go-live (below), after a backup.

Order applied to production so far: `schema.sql`, `002_tags.sql` … `017_ai.sql`, in number order. A fresh project needs `scripts/vault/drill/storage-standin.sql` **only in test databases**; real Supabase has its own Storage schema.

## Go-live

1. **CI is green** on the commit.
2. **Back up** (when there's a migration, and at least weekly): see [scripts/vault/README.md](../scripts/vault/README.md) "Backing up today's Vault". Keep the passphrase in your password manager.
3. **Read-only pre-check** of what the migration touches (counts, columns, policies): `supabase db query --remote=<ref> "<select …>"`.
4. **Apply the migration**, if any: `supabase db query --remote=<ref> --yes --file supabase/NNN_name.sql`. Then a read-only post-check (columns, RLS on, policies, grants, data counts unchanged).
5. **Note the current production deployment** (Vercel → Deployments, the one marked Production) for rollback.
6. **Deploy:** fast-forward `main` to the commit, without force: `git push origin <commit>:refs/heads/main`. Vercel builds in about a minute.
7. **Smoke check, logged out:**
   - `/`, `/projects`, `/login` give 200.
   - `/vault` and `/vault/settings` redirect to `/login`.
   - `/api/export` gives 401, and 403 when sent with `Sec-Fetch-Site: cross-site` (the header a browser adds for a cross-site request).
   - The security headers are present: `curl -sI https://kaushik-kamal.vercel.app/`.
   - Vercel shows no runtime errors.
8. **Smoke check, logged in:** open the Vault, open an idea and a project, then check Settings.
9. **Record** what was done and verified in `docs/vault/PROGRESS.md`.

## Rollback

- **App:** Vercel → Deployments → the previous production deployment → **Promote to Production**. This is instant and needs no rebuild. Then put `main` back in line in git: revert the commit, never force-push.
- **Settings:** remove or change the variable and redeploy.
- **Migrations:** they are additive. Leave the new columns and tables in place; the older app ignores them. Undo a migration only with a written plan, after a backup.
- **Data:** restore from a backup only after a restore drill proves it. Reconcile anything written since the backup first, and never reset live data.

## Switches

| To… | Do |
| --- | --- |
| Enforce the CSP | After about a week with no unexplained `csp-violation` lines in Vercel's runtime logs: add `CSP_ENFORCE=1` (Production), redeploy, then test the Picker, a Drive upload, the recorder and the assistant. Undo: remove it and redeploy. |
| Turn the assistant on or off | `AI_ENABLED=1` plus `GEMINI_API_KEY`, then redeploy. To turn it off: remove `AI_ENABLED` and redeploy. Saved conversations stay. |
| Send attachments to Drive | `DRIVE_UPLOADS_ENABLED=1`, then redeploy. Remove it to go back to Supabase Storage. |

## Backups and restore drill

See [scripts/vault/README.md](../scripts/vault/README.md). In short:
- `backup-live.mjs` writes an encrypted archive of every table, the account list (without secrets), Storage settings and every file's bytes. Write it to a folder outside the repository.
- `restore-drill.mjs` restores that archive into a disposable offline Postgres and compares it table by table.
- Settings → Your data → **Download my data** gives a JSON copy of your rows (no file bytes).

The pre-reset snapshot `run-20261116T002012Z` and its `.key.dpapi` (this Windows account) are the only copy of the data from before 16 Nov 2026. Never delete them.

## If something goes wrong

| Situation | Do |
| --- | --- |
| **A secret leaked** (pasted, committed, shown on screen) | Rotate it at the source first, then update Vercel and redeploy. Supabase secret or service key: Supabase → Project Settings → API keys. Google client secret: Cloud Console → Credentials. Gemini key: AI Studio. Picker key: restrict or replace it. `DRIVE_TOKEN_KEY`: replace it, redeploy, then reconnect Drive (old sealed tokens become unreadable, so revoke the app's access in your Google account too). If it reached git, rotating is what matters; rewriting history doesn't un-leak it. |
| **Someone else may have logged in** | Supabase → Authentication → Users: delete unknown users and sign out all sessions. Change your password. Check that "Allow new users to sign up" is off. Review recent rows (`updated_at`) and Storage objects. |
| **The site is down or erroring** | Vercel → the deployment's runtime logs. If the last deploy caused it, promote the previous deployment (Rollback). If Supabase is down (status.supabase.com), wait it out. Don't redeploy, because a build fetches published projects from Supabase. Ideas captured offline wait in the browser's outbox (never verified during a real outage). |
| **Drive stops working** | Settings → Reconnect Google Drive. While the OAuth app is in Testing, this happens about every 7 days. |
| **The assistant costs too much** | Remove `AI_ENABLED` and redeploy. Lower `AI_MONTHLY_USD`. Check the budget alert in Cloud billing. |
| **CSP reports appear** | Read the directive and the blocked origin. If it's a feature we use, add the origin in `src/lib/security-headers.ts` with a test. Otherwise it's an extension or an attack, and needs no action. |
