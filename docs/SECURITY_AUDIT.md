# Security audit (2026-11-24)

**Scope:** the whole application at branch `vault-audit-and-planning-docs` (`127115c` and later), including tonight's new features: drawings (7A/7B), boards (7C) and assistant proposals (5B).

**How it was tested:**
- reading the code;
- the existing SQL policy suites, run against a disposable offline Postgres;
- browser tests against the synthetic fixture;
- scans of the git history and of the built browser bundles.

**What it doesn't cover:**
- No active testing against production or the live Supabase project.
- No penetration test by a third party.

This doesn't claim the application is fully secure. It records what was checked, what was found, and what remains.

## Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S-1 | The drawing editor offered Upload and Export PNG even when Drive uploads are switched off. The request was refused server-side, but with a misleading error. | Low (no exposure; bad error handling) | **Fixed** (`127115c`) |
| S-2 | `/api/csp-report` (public, unauthenticated) read the whole body before its 8 KB size check | Low (Vercel caps bodies at about 4.5 MB) | **Fixed**: the declared length is checked first (`127115c`) |
| S-3 | The site address used for redirects and the same-origin check comes from the forwarded `Host` headers | Informational | **Accepted**, see below |
| S-4 | Login brute-force protection relies on Supabase Auth's rate limits; the app has none of its own | Low or medium (single-owner site) | **Open**: owner check, see below |
| S-5 | Supabase session cookies can be read by the page's JavaScript (`httpOnly` off; required by `@supabase/ssr` in the browser) | Low (the CSP limits script sources) | **Accepted**: inherent to the library; enforcing the CSP (due 2026-11-30) strengthens it |
| S-6 | 7 moderate `minimatch` advisories | Informational (development tools only, not shipped) | **Open**: Dependabot will propose updates; no forced upgrade |
| S-7 | 5C would send file text to Gemini, which contradicts the live privacy page | Policy | **Blocked**: owner decision; not built |

No critical or high-severity issues were found.

## What was checked, and the evidence

### Secrets and environment

- **Git history:** every commit's patches were scanned for Google API keys (`AIza…`), Supabase secret keys (`sb_secret_…`), Google OAuth secrets (`GOCSPX-…`), private key blocks and JWT-shaped service tokens. **No matches.**
- **Tracked files:** only `.env.example` (placeholders). No backups, archives, `.vaultlive`, `.dpapi` or key files are tracked.
- **Browser bundles:** the test build (`.next-e2e/static`) contains the fixture's real test values. Searched for the fake Gemini key, `GOOGLE_CLIENT_SECRET`'s value, `DRIVE_TOKEN_KEY`, the service-role name and the owner email:
  - **none appear in client chunks**;
  - `ALLOWED_EMAIL` appears only as the *name* in a help sentence on the login page, not its value.
- **Client components:** they read only `process.env.NODE_ENV` and `NEXT_PUBLIC_*` values.
- **Logs:** `csp-report` logs only the directive and the blocked origin. The AI routes never log keys; the Gemini adapter sends the key in a header, never in the URL.

### Authentication and sessions

- `/vault/*` is gated by the proxy (`src/proxy.ts`): no session, or a session for an account other than `ALLOWED_EMAIL`, redirects to `/login` (`?denied=1` for the wrong account).
- Every page re-verifies the owner server-side with `verifiedOwner`.
- Logout and session-lock behaviour are covered by `tests/browser/vault.spec.ts` (20 tests passed tonight).
- **Change tonight (bug, not security):** the login form reads the typed values at submit. Text typed before the page loaded had been ignored. The inputs deliberately have no `name`, so a submit before the page finishes loading can never put the password in the URL.
- **S-4:** the browser signs in directly with Supabase Auth, so brute-force protection is Supabase's per-IP rate limit. **Owner check:** in Supabase, Authentication → Rate Limits; and confirm "Allow new users to sign up" is off (V-053, still open). Optional and free: enable Supabase's CAPTCHA (Cloudflare Turnstile or hCaptcha) for sign-in.

### Authorization and access control

- **All 23 API routes were inventoried.** Every state-changing route (POST, PATCH, DELETE) checks the same-origin `Origin` header (403) and an owner session (401). The GET routes:
  - `drive/connect` and `drive/callback`: owner session, plus the OAuth state cookie and PKCE;
  - `drive/file/[fileId]` and `drive/status`: owner-only;
  - `export`: owner-only, and also refuses `Sec-Fetch-Site: cross-site`.
- **New tables** (`drawings`, `boards`, `board_cards`, `board_links`):
  - row-level security is on, with owner-only policies;
  - no privileges for `anon`;
  - no TRUNCATE, REFERENCES or TRIGGER for `authenticated` (catalog-wide check in `grants-behaviour.sql`);
  - links are composite foreign keys within the same project, so a record from another project can't be referenced, even by id;
  - triggers stop a drawing changing its shot or image, and a card or connection changing its board;
  - SQL suites `phase7a` (31 checks) and `phase7c` (24 checks) prove these as the owner, another account and anon.
- **IDOR:** the drawing and board pages filter by project id, owner id and the record id together, so another account's id gives "not found". Browser tests confirm that logged-out requests redirect to `/login`.
- **Publishing:** nothing new is public. Drawings and boards are never read by public pages. An exported PNG is an ordinary private project file, and appears publicly only through the existing showcase approval for a Completed project.

### AI (5A and 5B)

- `/api/ai/propose` repeats every 5A check:
  - same-origin and owner;
  - the off switch (`AI_ENABLED`);
  - ticked records re-read from the database (the browser sends ids only);
  - records outside the mode are refused;
  - the monthly and daily caps are checked before calling Gemini;
  - every call, failures included, is written to the ledger.
- **Model output is treated as untrusted** (`src/lib/ai/proposals.ts`):
  - only JSON is accepted, and only the mode's kinds;
  - each item must cite a record that was actually sent;
  - fields are stripped of control characters and length-capped;
  - dates must be valid ISO dates;
  - scene and character references resolve only to ticked records of the right table;
  - anything else is dropped and counted, and an unreadable reply shows nothing.
- **Zero unapproved mutations:** the route writes only the usage ledger. Each accepted item is one normal owner insert in the browser. Tested by `tests/browser/proposals.spec.ts` (the task table stays empty until Accept).
- The prompt marks the records as data, not instructions, the same defence against prompt injection as 5A.

### Injection and XSS

- No `dangerouslySetInnerHTML` or `innerHTML` assignment in live code; only the archived component, which isn't routed.
- Drawing data from the database passes `parseDrawing`. Colours must match `#rrggbb`, numbers are clamped, and label text is cleaned and rendered as a React text node.
  - A unit test feeds an attribute-injection colour and a `javascript:` background id; both are dropped.
  - A browser test confirms `Gate <b>& tower</b>` displays as literal text.
- SQL: all queries use the Supabase query builder or parameterised RPCs; the new migrations' trigger functions use `set search_path = ''`.

### Redirects (S-3)

- The redirect targets are `/login`, `/vault/settings?drive=…` and Google's OAuth URL built from server configuration. None takes a destination from user input, so there's no open redirect.
- `siteOrigin()` builds the site address from `x-forwarded-host` or `Host`. A browser can't forge these in a cross-site attack, Vercel sets the forwarded host itself, and Google accepts only registered redirect URIs. **Accepted.** If the site ever runs behind a proxy that passes client `Host` values through, pin the origin with a `SITE_URL` setting.

### File upload and serving

- **Uploads:**
  - go straight to the owner's Drive through a resumable session that the owner-checked route creates (size limit `DRIVE_MAX_BYTES`, scope `drive.file`);
  - the route refuses requests when uploads are switched off;
  - the editor now respects that switch (S-1).
- **Serving** (`/api/drive/file/[id]`):
  - owner-only, with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`;
  - files are served `attachment` unless the type is on the safe inline list;
  - the name is encoded safely in `Content-Disposition`.
- **Exported PNGs** are made in the browser from validated data and uploaded as new files. Originals are never written to; a test confirms no non-GET call touches the original Drive file.

### HTTP and browser security

- The headers from 6B are live and checked every 6 hours by the live check: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP and CSP.
- **The CSP is report-only** until about 2026-11-30, then enforced (runbook). Tonight's features need no CSP change: drawings are inline SVG, `blob:` and `data:` images are already allowed, and there are no new origins. Browser tests run with the CSP enforced.

### Dependencies

- `npm audit --omit=dev`: **0 vulnerabilities**. Full audit: 7 moderate (`minimatch`, through the ESLint toolchain; not shipped).
- **New dependency:** `perfect-freehand@1.2.3` (MIT, no dependencies, pinned exactly; published 2026-02-01).
- Outdated packages (patch or minor: React 19.3.1, supabase-js 2.119.2, Tailwind 4.3.5) are left for Dependabot's grouped PRs, so each upgrade gets its own CI run.

## Remaining risks and owner actions

1. **Sign-ups off and Auth rate limits** (S-4, V-053): check in the Supabase dashboard.
2. **Enforce the CSP** on or after 2026-11-30 once the logs are clean (runbook, Switches).
3. **Supabase CAPTCHA** for sign-in (optional, free).
4. **5C** stays unbuilt unless you change the privacy promise.
5. **Production:** tonight's checks ran against the fixture and an offline Postgres, not the live Supabase project. **Migrations 018 and 019 are not applied live.** After applying them, run the read-only post-checks in the runbook (RLS on, policies, no anon grants).
