# Phase 6 plan: Hardening and launch (6A live 2026-11-21 as e4b73c1; 6B live 2026-11-23 as f04bc47, CSP report-only; 6C proposed 2026-11-23)

## 6A as built (2026-11-21, local only)

Built as planned, with these differences:

- **Storage bytes come through the CLI login.** `supabase storage cp --experimental --remote=<ref>` copies a whole bucket; the CLI fetches its own credentials, so the tool never sees a service-role key. Listing worked against production. Production holds 0 stored objects today, so downloading real bytes is verified only when there are files; the code checks every object's presence and size.
- **A new archive format** (`scripts/vault/live-archive.mjs`, `idea-vault-live-backup-v1`): gzipped JSON with the same AES-256-GCM and PBKDF2 settings as the Phase 0 archives. The old format only accepts the original ideas tables.
- **Table fingerprints:** each table's rows as Postgres renders them (`row_to_json`), sorted and hashed. Matching fingerprints prove identical content.
- **Catalog comparison ignores schema prefixes,** because Postgres prints `auth.uid()` or `uid()` depending on the session's search path. Before this, 248 of 264 differences were that noise.
- **Tables that no migration creates are rebuilt from their captured columns** (only `timevault_state`, which is legacy and empty). The drill image's older `auth.users` lacks `email_confirmed_at`; the drill notes that column as not restored.
- **The first run against production (read-only):** 30 tables, 1 account, 0 files, in about 2.5 minutes.
  - The drill restored all 30 tables identical to production.
  - The security catalog matched production exactly, apart from the legacy `timevault_state` table and a production-only `rls_auto_enable()` function. That function is security definer and executable by anon and authenticated; it looks Supabase-managed, and 6B should check it.
  - A wrong passphrase was refused with no report written.
  - The test archive and its one-time passphrase were deleted afterwards.

Files:
- **Backup tools:** `scripts/vault/{live-archive,backup-live,restore-drill}.mjs`, `scripts/vault/drill/storage-standin.sql`, and `scripts/vault/README.md` (new section; the Phase 0 parts marked historical).
- **Export:** `src/lib/export.ts`, `src/app/api/export/route.ts`, and `src/app/vault/settings/page.tsx` (Your data).
- **Tests:** `tests/export.test.mjs`, `tests/browser/export.spec.ts`.
- **`.gitignore`:** guards `*.vaultlive` and export files.

**Deploy:** no migration; deploy normally. **Rollback:** promote the previous deployment.


Master prompt, Phase F: "End-to-end tests, permissions, migrations, performance, mobile, backups, export, documentation, staging preview, deployment only after approval." Acceptance item 12: "The website can be deployed and maintained with documented configuration and recovery steps." Roadmap Phase 6: accessibility, performance and monitoring, hardened export and backup scheduling, a deployment runbook, and security and restore drills.

**Why Phase 6 now, before 5B:** 5B (assistant proposals you accept or reject) builds on 5A, which isn't switched on or tried with a real key yet. Meanwhile the gaps below affect everything already live.

## Where things stand (checked 2026-11-21)

| Area | Finding |
| --- | --- |
| **Backups** | **No backup covers the current data.** The only snapshot (`run-20261116T002012Z`, DPAPI-encrypted) predates the 16 Nov reset and the 4A–5A tables. The tools in `scripts/vault/` export a fixed list of old tables (ideas, idea files, a few system tables) and don't download Storage bytes. Your live data is small today (2 ideas, 2 projects, 4 project files, 1 Lab entry). Supabase's own backups depend on the plan; the plan hasn't been checked. |
| **Export** | No "download my data" in the Vault. |
| **Security headers** | The live homepage sends only Vercel's default HSTS. There's no Content-Security-Policy, X-Frame-Options or `frame-ancestors`, Referrer-Policy, X-Content-Type-Options or Permissions-Policy. So the Vault could be framed by another site (clickjacking). |
| **Accounts** | The Vault allows one email (proxy and route checks), and publishing is limited to `site_owner`. Whether Supabase Auth still accepts **new sign-ups** hasn't been verified. Another account couldn't reach your data, but it could create its own rows. |
| **Service worker** | Fixed earlier: private pages are never cached (`public/sw.js`). The 2026-11-14 audit item is resolved. |
| **Dependencies** | `npm audit --omit=dev`: 0 vulnerabilities. |
| **CI** | None. Every check runs only on this PC. |
| **Tests** | 190 unit, 74 browser and 11 SQL suites. The Phase 2 SQL suite still stops on a missing seed record (a test-only gap since 4A). No automated accessibility checks. |
| **Google Drive** | The OAuth app is in Testing mode, so Drive refresh tokens expire every 7 days. |
| **Docs** | Deploy steps, environment variables, migration order and rollback are spread across PROGRESS entries; there is no single runbook. |

## Recommended order

| Slice | What you get |
| --- | --- |
| **6A Backups, export, restore drill** | A one-command encrypted backup of the whole database and all Storage files, run from this PC. A tested restore into a throwaway local database. A "Download my data" button in Settings. A backup step added to every future go-live. |
| **6B Security hardening** | Security headers (clickjacking protection, referrer, content-type, permissions, then a Content-Security-Policy, first in report-only mode). Sign-ups confirmed off. A check that no secrets were ever committed. |
| **6C Quality gates and runbook** | GitHub Actions CI (type check, lint, unit, SQL and build on every push). Automated accessibility checks at 320/768/1280 px. Homepage performance budget. Phase 2 test gap fixed. `docs/RUNBOOK.md`. Drive OAuth app moved to Production. |

**I'm asking for approval of 6A only**, plus its decisions. 6B and 6C will each be presented with exact files before any change. I recommend doing them right after 6A; 6B is small.

## 6A scope

1. **Backup command** (`scripts/vault/backup-live.mjs`, run by you on this PC). It uses the Supabase CLI login that already works here (read-only queries) and the existing encryption tools.
   - **Database:** every table in `public`, discovered at run time so future tables are included. Also `auth.users` (ids, emails, timestamps; no password hashes), the Storage object list and bucket settings, and the policies, grants and functions as schema SQL.
   - **Files:** the bytes of every object in `attachments`, `library`, `showcase` and `profile-files`, each with a SHA-256.
   - **Output:** one encrypted archive in a private folder outside the repository, plus a plain manifest of counts and hashes (no content).
   - **Read-only.** It never writes to production.
2. **Restore drill** (`scripts/vault/restore-drill.mjs`): extracts a backup into a fresh disposable local Postgres (the same Docker setup the SQL tests use) with migrations 002–017. It then:
   - Loads the rows.
   - Checks every table's row count and content hash against the manifest.
   - Checks each file's hash.
   - Runs the RLS and grant checks against the restored database.

   It reports exactly what was and wasn't restored. Auth logins and the Storage API can't be proven this way; the report says so.
3. **"Download my data"** in Settings: a JSON file of everything your account owns (ideas, projects and every project record, story, journal, profile drafts and history, library entries, conversations), with file names and sizes but no file bytes. Read through your session, owner-only, and nothing is changed.
4. **Process:** a backup becomes step 1 of every future go-live, and the runbook (6C) records how to restore.

## Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-045 | Backup scope | The whole database plus the bytes of all four Storage buckets. Files in your Google Drive are not copied; they live in Drive and Google keeps them. |
| V-046 | Where it runs and how it's protected | **On this PC, run by you**, using the Supabase CLI login that already exists. Encrypted with a passphrase you keep in a password manager (AES-256-GCM, as the existing archives are), so a copy can safely go to a USB drive or cloud folder. The alternative is a scheduled GitHub Action, which would need a database password stored as a GitHub secret: more exposure for a one-person site. |
| V-047 | How often | Before every migration or go-live (built into the process), and weekly otherwise. Weekly needs a reminder of your choosing; I can't schedule it on your PC without your say. |
| V-048 | Supabase's own backups | **Check your Supabase plan** (Dashboard → Project Settings → Billing). The Free plan has no downloadable daily backups. Pro ($25/month) adds them, which this plan doesn't need. |
| V-049 | Download my data | Include it: owner-only JSON, no file bytes, nothing changed. Import is not offered; restoring goes through the documented drill, which is safer than a one-click import. |

## Files (expected)

| Kind | Files |
| --- | --- |
| New | `scripts/vault/backup-live.mjs` (export via Supabase CLI read-only queries, Storage download, manifest, encryption via the existing `preservation.mjs`), `scripts/vault/restore-drill.mjs`, `src/app/api/export/route.ts` (owner-only JSON download), `src/lib/export.ts` |
| Changed | `src/app/vault/settings/page.tsx` (Download my data), `scripts/vault/README.md` (how to back up and restore today's data; the old Phase 0 sections marked historical) |
| Tests | `tests/export.test.mjs` (every owner table included, no secrets or tokens, no other accounts' rows); `tests/browser/export.spec.ts` (anonymous and cross-site refused, file contents correct); a scripted drill against a synthetic backup in the disposable database (no production data in tests) |

## Risks

- **A backup holds everything private.** Mitigations:
  - It is encrypted before it touches disk, apart from a counts-only manifest.
  - It is written only outside the repository, and `.gitignore` gets a guard.
  - The passphrase is never stored by the tool.
  - Drive OAuth tokens (already encrypted with `DRIVE_TOKEN_KEY`) are exported encrypted as they are. The key itself is not in the backup; the runbook says where it lives.
- **Downloading Storage needs authority.** The CLI path for reading bucket bytes must be confirmed in the first step. If it needs the service-role key, I'll stop and ask rather than handle that key. The fallback is downloading through your own signed-in session with the app's existing owner policies.
- **The export route reveals data.** It is owner-only (proxy, `routeOwner`, row security), GET with no side effects, `Cache-Control: no-store`, and tested for anonymous and cross-site refusal.
- **Restore gives false confidence.** The drill proves database rows, grants and file hashes, not a running app. The report says exactly that.

## Acceptance tests

1. A backup of production finishes read-only. Its manifest's table counts equal a separate read-only count query, and every Storage object is present with a matching hash.
2. The drill restores that backup into a fresh local database with every table, count and hash matching and the RLS and grant checks passing. It is recorded with what wasn't covered.
3. A wrong passphrase or a corrupted archive is detected, not silently restored.
4. Download my data contains every table you own, matching counts, and no tokens, keys or other accounts' rows. It is refused for anonymous visitors and other sites (master prompt §6 items 2, 11, 12).
5. tsc, ESLint, unit, SQL and browser suites and the build pass; no production writes occur.

## Go-live and rollback

- No migration. The export button deploys normally. The backup and drill are local and make no production change.
- **Rollback:** promote the previous deployment (removes the button). The scripts are local files.

## Not in 6A

Security headers and sign-up check (6B), CI, accessibility, performance and runbook (6C), scheduled cloud backups, one-click import, and backing up Drive contents.

## 6B plan: security hardening (proposal 2026-11-21; not approved)

### Checked before planning (2026-11-21, read-only)

- **Headers on the live site:** only Vercel's HSTS. There is no X-Frame-Options or `frame-ancestors`, so any site can frame the Vault and the homepage. There is also no CSP, X-Content-Type-Options, Referrer-Policy or Permissions-Policy.
- **Secrets in git history:** none. All 83 commits were scanned for Supabase secret and service keys, JWTs, Google API keys and client secrets, private keys, and OpenAI-style keys. The only env-style file ever committed is `.env.example`.
- **`rls_auto_enable()`** (flagged by the 6A drill): Supabase's event-trigger function that turns on row security for every new public table. It is protective, and as an `event_trigger` function it can't be called through the API, so the execute grant exposes nothing. No change.
- **Sign-ups:** not checked automatically. The public key wasn't found in the login page's scripts, and fetching keys through the CLI would also print the service-role key, so I didn't. **You check:** Supabase Dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" should be **off**. Another account couldn't read your data (row security, the email allowlist, `site_owner`), but it could create rows of its own.
- **What the pages need from outside:**
  - The Supabase project (data, Storage images, signed links).
  - Google (`apis.google.com` Picker script, the `docs.google.com` Picker frame, `www.googleapis.com` for resumable Drive uploads from the browser).
  - The microphone for the voice recorder.
  - Fonts are served from this site.
  - Next's inline bootstrap scripts.

### Scope

1. **Headers on every response,** enforced at once:
   - `X-Frame-Options: DENY` (no framing anywhere).
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy: microphone=(self), camera=(), geolocation=(), payment=(), usb=(), browsing-topics=()`.
   - `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
2. **A Content-Security-Policy, in report-only mode first:**
   - `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.
   - `img-src 'self' data: blob: <supabase>`; `media-src 'self' blob:`; `font-src 'self'`.
   - `connect-src 'self' <supabase> https://www.googleapis.com`; `frame-src https://docs.google.com`.
   - `script-src 'self' 'unsafe-inline' https://apis.google.com`; `style-src 'self' 'unsafe-inline'`.
   - `worker-src 'self'`; `upgrade-insecure-requests`.
3. **A violation report endpoint** (`/api/csp-report`): logs one short line per report (directive and blocked origin only; no page query strings, no personal data) to Vercel's runtime logs, capped per request.
4. **Browser tests enforce the CSP locally.** The fixture build serves the same policy enforced rather than report-only, and every browser test fails if the page raises a `securitypolicyviolation`. So the whole suite checks the policy from day one.
5. **Enforcing on the live site** is a one-line switch, done as a short follow-up after about a week of normal use (Picker, uploads, recorder, assistant) with no unexplained reports.

### Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-050 | Headers to enforce now | The five in Scope 1. `same-origin-allow-popups` keeps Google's popups and the Picker working. |
| V-051 | How strict the CSP is on scripts | `'self' 'unsafe-inline'` plus Google's Picker host, without nonces. This Next version can only add nonces to pages rendered per request, which would make the homepage and every static page dynamic (slower, and more Vercel work). The policy still blocks scripts from any other site, plugins, framing, base-tag tricks and form posts elsewhere. The app has no `dangerouslySetInnerHTML`, and all text is rendered as text. |
| V-052 | Rollout | Report-only on the live site plus enforced in the local browser tests, then enforce live after a week of clean reports (a separate small go-live). The alternative, enforcing at once, risks breaking the Picker or uploads in ways the fixture can't show. |
| V-053 | Sign-ups | You turn off "Allow new users to sign up" in the Supabase dashboard. I then confirm it from the public Auth settings once the key is available from the deployed page. |

### Files (expected)

| Kind | Files |
| --- | --- |
| Changed | `next.config.ts` (`headers()` for all routes; CSP built from `NEXT_PUBLIC_SUPABASE_URL`; report-only or enforced through `CSP_ENFORCE`), `tests/browser/app-server.mjs` (`CSP_ENFORCE=1` for tests), the browser specs' shared setup (fail on CSP violations) |
| New | `src/lib/security-headers.ts` (builds the header list; unit-tested), `src/app/api/csp-report/route.ts`, `tests/security-headers.test.mjs` |

### Risks

- **Breaking a feature with a missed origin.** Report-only on the live site; enforced and watched in all 75+ browser tests. The Google Picker and Drive uploads can only be fully proven live, which is why enforcement waits for real use.
- **Report endpoint abuse.** It accepts small JSON bodies only (8 KB cap), logs two short fields, and stores nothing.
- **`'unsafe-inline'` scripts** leave inline-script XSS less contained than nonces would. That is accepted while pages are static; revisit if any feature ever renders HTML.

### Acceptance tests

1. Every live response carries the five headers, and `/`, `/vault/*` and `/api/*` all refuse framing.
2. Every browser test passes with the CSP enforced and no violations.
3. The live site serves the CSP report-only and the report endpoint logs a test report.
4. Homepage, projects, journal and the Vault still work; `/` stays static.
5. Sign-ups are off (owner screenshot or public settings check).

### Rollback

Promote the previous deployment; headers live only in `next.config.ts`. No database change.

### 6B as built (2026-11-21, local only)

Built as planned, with these differences:

- **The Drive file route keeps its own policy.** `/api/drive/file/*` already served Drive files with `Content-Security-Policy: default-src 'none'; sandbox`, so a served file can't run scripts. The first site-wide header replaced it; the existing Drive browser test caught that. The site CSP now applies to every route except that one. The five protective headers still apply everywhere, and a test checks the route keeps its sandbox.
- **Proof that "no violations" means something.** The final spec (`tests/browser/zz-csp.spec.ts`) first asserts the whole suite produced no reports. It then injects a blocked image and confirms the report arrives, so a silent reporting pipeline can't pass for a clean one.
- **Development builds** add `'unsafe-eval'` and `ws:` (Next's hot reload needs them). Production and test builds don't. `upgrade-insecure-requests` is added only when the Supabase URL is https, so local http test builds still work.
- **A timing race** in the journal browser test (the loading placeholder briefly coexisting with the content) is fixed by waiting for the content. It was not caused by the CSP.

Files:
- **New:** `src/lib/security-headers.ts`, `src/app/api/csp-report/route.ts`, `tests/security-headers.test.mjs`, `tests/browser/zz-csp.spec.ts`.
- **Changed:** `next.config.ts`, `tests/browser/app-server.mjs` (enforced CSP; reports to the fixture), `tests/browser/api-fixture.mjs` (collects reports for the whole run), `tests/browser/vault-journal.spec.ts`.

**Enforcing later:** in Vercel, add `CSP_ENFORCE=1` (Production) and redeploy. **Rollback:** promote the previous deployment, or remove `CSP_ENFORCE`.

## 6C plan: quality gates and runbook (proposal 2026-11-23; not approved)

### Checked before planning (2026-11-23, read-only)

- **6B is committed (`f04bc47`) but not live.** `main` is still `fa269ca`. 6C doesn't depend on it, but 6B should go live first so the week of CSP reports can run while 6C is built.
- **No CI.** There's no `.github/` folder. Every check runs only on this PC. The GitHub repo's visibility couldn't be read (`gh` isn't signed in). If it's private, the free plan gives 2,000 Actions minutes a month.
- **SQL suites have no runner.** All 11 suites in `tests/sql/` were run by hand in a disposable offline `supabase/postgres:17.11.0.018` container. The Phase 2 suite stops on its first project insert because the ideas it references (`a…0001`, `a…0003`) are never created. With them added by hand it passed 28/28 (PROGRESS, 4A).
- **No accessibility tooling.** The browser suite checks some ARIA states by hand. It has no automated rule checks.
- **No performance budget.** `/` is static and nothing measures how much it ships.
- **Docs are out of date.** The README's Database section lists 3 of the 18 SQL files, and Deploy lists 3 of about 15 settings. Deploy, migration, rollback and switch steps are spread across PROGRESS entries.
- **Google Drive** OAuth app is still in Testing, so the Drive connection expires every 7 days.

### Scope

1. **One SQL runner** (`scripts/vault/run-sql-suites.mjs`). It starts a disposable container with no network, applies `schema.sql`, the Storage stand-in and 002–017 **twice** (to prove they're re-runnable), runs every suite in `tests/sql/`, prints each suite's pass count and removes the container. The same script runs here and in CI.
2. **Phase 2 suite fixed:** it creates the two ideas it uses at the top. The 28 checks themselves don't change.
3. **GitHub Actions CI** (`.github/workflows/ci.yml`) on every push and pull request:
   - `npm ci`, then type check, ESLint, unit tests, production build.
   - The SQL runner.
   - Browser tests against the existing fake Supabase and Google fixture (Chromium only). The CSP is enforced there, as locally.
   - `npm audit --omit=dev --audit-level=high`.
   - **No secrets in GitHub.** CI uses only the fixture and dummy values. It never reaches Supabase, Google, Gemini or Vercel.
   - Failure screenshots and traces kept as run artifacts for 7 days. The fixture contains only made-up data.
4. **Accessibility checks** with `@axe-core/playwright` (one new dev dependency). They run on `/`, `/projects`, `/journal`, a project story page, `/login`, and the Vault's main screens (ideas, an idea, projects, a project, Settings) at 320, 768 and 1280 px, against WCAG 2.2 A and AA rules. Any violation fails. I'll fix what they find in this slice if it's small (labels, contrast, landmarks). I'll list anything larger for you before changing it, since it would change how the public pages look.
5. **Homepage performance budget.** A browser test loads `/` and measures the JavaScript, CSS, fonts and images it downloads. CI fails if any of them grows more than 10% over today's measured size (recorded in the test). Lighthouse scores are left out because they vary between runs.
6. **`docs/RUNBOOK.md`:**
   - Every environment variable, where it lives and what turns each feature on.
   - Migration order and how to apply one with the CLI.
   - Go-live steps: backup, migration, fast-forward `main`, Vercel check, smoke checks.
   - Rollback: promote a deployment, and when a migration can stay.
   - Backup and restore drill.
   - Switches: `CSP_ENFORCE`, `AI_ENABLED`, `DRIVE_UPLOADS_ENABLED`.
   - What to do if a key leaks or someone else logs in.
   The README's Database and Deploy sections then point to it.
7. **Drive OAuth app to Production** (your step in Google Cloud Console, with my checklist). The app asks only for `drive.file`, which I believe is not a sensitive scope, so it shouldn't need Google's full review. Google may still ask for brand details (app name, homepage, privacy policy link). I'll confirm against Google's current docs before you start.

### Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-054 | What CI runs | Everything in Scope 3 on every push and pull request. Each push to `main` is a production deploy, so the full suite should be green there. |
| V-055 | Secrets in CI | None. Fixture and dummy values only. Anything that needs real Supabase or Google stays a local or live check. |
| V-056 | How CI gates a go-live | The go-live rule gets a new first step: CI is green on the commit before `main` is fast-forwarded. No branch-protection change (you deploy by fast-forwarding from this PC). |
| V-057 | Accessibility standard | WCAG 2.2 A and AA via axe, every listed page at three widths, any violation fails. Larger fixes come back to you first. |
| V-058 | Performance budget | Bytes downloaded by `/`, by type, at most 10% over today's measurement. Raising it is a deliberate one-line change in the test. |
| V-059 | Drive OAuth to Production | Yes, after I confirm Google's current requirements. If it needs a public privacy policy page, that's a separate small change to the public site and I'll ask first. |

### Files (expected)

| Kind | Files |
| --- | --- |
| New | `.github/workflows/ci.yml`, `scripts/vault/run-sql-suites.mjs`, `tests/browser/a11y.spec.ts`, `tests/browser/performance.spec.ts`, `docs/RUNBOOK.md` |
| Changed | `tests/sql/phase2-behaviour.sql` (seed ideas), `package.json` and `package-lock.json` (`@axe-core/playwright`; `test:sql` script), `README.md` (point to the runbook), `.gitignore` if needed. Plus small accessibility fixes in `src/` if axe finds any (each listed in the report). |

### Risks

- **CI differs from this PC** (Linux, fonts, timing). The browser suite runs one worker with no retries. A test that's only flaky in CI gets fixed, not retried.
- **CI time and minutes.** Building the app twice (normal and fixture build), pulling the Postgres image and running about 80 browser tests may take 15–20 minutes. If the repo is private, that's roughly 100 pushes a month on the free plan. If it's too slow, browser tests can run only on `main` and pull requests.
- **Accessibility fixes touch the public pages.** Any visible change to the portfolio gets before and after screenshots, and big ones wait for your OK.
- **Drive Production** could show Google's "unverified app" screen if Google classifies the app differently than expected. That only affects your own sign-in, and moving back to Testing undoes it.
- **No production risk from CI itself.** It has no secrets and no deploy step.

### Acceptance tests

1. A push to the branch runs CI, and every job passes: types, lint, unit, build, SQL (all 11 suites, including Phase 2's 28 checks), browser, accessibility, budget, audit.
2. A deliberately broken commit (a failing unit test, an unlabeled button, an extra 200 KB script on `/`) fails the right job. Tested on a throwaway branch, then deleted.
3. `npm run test:sql` passes on this PC with the same output as CI.
4. No secret appears in the workflow, the logs or the artifacts. CI never contacts Supabase, Google or Vercel.
5. The runbook covers every variable in `.env.example` and every migration. A dry read-through of the go-live steps matches what was done for 6A.
6. After Drive moves to Production, the Drive connection is still valid 8 days later (live, owner).
7. If any `src/` fix ships: `/` stays static, homepage text and section ids match the baseline, smoke checks pass.

### Rollback

- **CI:** delete or disable the workflow. Nothing in production depends on it.
- **Accessibility fixes, if deployed:** promote the previous deployment.
- **Drive:** set the OAuth app back to Testing in Google Cloud Console.
- No database change.

### Not in 6C

Enforcing the CSP live (the 6B follow-up after a week of reports), scheduled cloud backups, Dependabot or automatic dependency updates, uptime monitoring or error alerting, cross-browser runs (Firefox, WebKit), and 5B.
