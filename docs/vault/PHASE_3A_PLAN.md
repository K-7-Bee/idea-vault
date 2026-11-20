# Slice 3A plan: Connect Google Drive (approved 2026-11-20; built locally, not applied or deployed)

Parent plan: [PHASE_3_PLAN.md](PHASE_3_PLAN.md). Decisions: V-007, V-007a, V-008a, V-008b, V-013 in [DECISIONS.md](DECISIONS.md).

## Scope

The owner can connect, check and disconnect Google Drive from a new Settings page, and choose the target folder once with Google Picker. No attachment uploads yet (that is 3B); capture, the outbox and existing Supabase files are untouched.

1. **Settings page** `/vault/settings`, linked from the sidebar and top bar. It shows Drive status (not connected / connected as `<Google account>` / folder `<name>` / needs reconnect), with **Connect**, **Choose folder** and **Disconnect** buttons.
2. **OAuth routes** (server only, Route Handlers, each re-checks the Supabase session and `ALLOWED_EMAIL` like the proxy):
   - `GET /api/drive/connect`: creates a random state plus a PKCE verifier in a short-lived HttpOnly, Secure, SameSite=Lax cookie bound to the user ID, then redirects to Google with `scope=drive.file`, `access_type=offline` and `prompt=consent`.
   - `GET /api/drive/callback`: checks the state (single use, 10-minute expiry, same user), exchanges the code on the server, and checks the granted scope is exactly `drive.file`. It then calls Drive `about.get` to read the Google account and refuses any account other than the configured one (`DRIVE_GOOGLE_ACCOUNT`, falling back to `ALLOWED_EMAIL`). Tokens are stored encrypted, and the route redirects to Settings.
   - `POST /api/drive/disconnect`: revokes the token at Google, then deletes the row. If revocation fails, the row is still deleted and the page says to remove access at myaccount.google.com.
   - `POST /api/drive/picker-token`: returns a short-lived access token (about 1 hour, `drive.file` only) so the browser can open Google Picker. This is the only time a token reaches the browser (see Risks).
   - `POST /api/drive/folder`: saves the picked folder ID after the server confirms it is a folder the app can access, by creating and deleting a zero-byte probe file in it. Nothing else in the folder is read.
   - `GET /api/drive/status`: returns connection status without any token.
3. **Migration** `supabase/008_drive_connections.sql` (additive): `drive_connections` with one row per owner. Columns: Google account ID and email, granted scope, encrypted refresh token and access token (AES-256-GCM, random IV, key version), access-token expiry, folder ID and name, `connected_at`, `updated_at`. Owner-only RLS, no anon grants, and the `vault_touch_row` trigger.
4. **Server library** `src/lib/drive/`:
   - `crypto.ts`: encrypt/decrypt with `DRIVE_TOKEN_KEY`.
   - `oauth.ts`: authorization URL, code exchange, refresh, revoke.
   - `connection.ts`: load and save the row, and refresh the token when it is close to expiry.

   It uses plain `fetch` to Google, with no new dependencies, and is imported only from server code.
5. **Picker:** loads `https://apis.google.com/js/api.js` only on the Settings page when **Choose folder** is clicked. It is configured for folders only, with `setAppId(<project number>)` so the pick grants `drive.file` access to that folder.

## Owner setup still needed (about 5 minutes, before 3A goes live)

1. Google Cloud: **APIs & Services → Library → Google Picker API → Enable**.
2. Google Cloud: **APIs & Services → Credentials → + Create credentials → API key**. Restrict it:
   - **Application restrictions:** Websites → `https://kaushik-kamal.vercel.app/*` and `http://localhost:3000/*`
   - **API restrictions:** Google Picker API only
3. Vercel (Production):
   - `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`: the restricted key. It is visible in the page by design; the restrictions protect it.
   - `NEXT_PUBLIC_GOOGLE_APP_ID`: the project number, `671937524018`.
   - `DRIVE_GOOGLE_ACCOUNT`: the Google address allowed to connect. Optional if it equals `ALLOWED_EMAIL`. Mark it Sensitive.
4. Local testing only: the same variables in `.env.local`, which git ignores.

## Files

New: `src/app/vault/settings/` (page and client component), `src/app/api/drive/{connect,callback,disconnect,picker-token,folder,status}/route.ts`, `src/lib/drive/{crypto,oauth,connection}.ts`, `supabase/008_drive_connections.sql`, `tests/drive-*.test.mjs`, browser tests under `tests/browser/`, and `tests/sql/phase3a-behaviour.sql`.
Changed: `src/app/vault/nav-links.tsx` (Settings link), `.env.example` (variable names only), and `public/sw.js` only if it would cache `/api/drive/*` (to verify; it must not).

## Risks

- **Token in the browser for Picker:** Google Picker needs an OAuth access token in the page. It is short-lived, `drive.file` only, never stored, and only issued after the owner check. The refresh token never leaves the server.
- **Owner can read ciphertext:** the app has no service-role key, so the owner's session can read the encrypted token row. That data is useless without the server-only `DRIVE_TOKEN_KEY`.
- **Testing mode:** Google expires refresh tokens after 7 days, so the Settings page will show "Reconnect Drive" about weekly. Publishing the consent screen to Production is a separate later decision.
- **Picked-folder write access:** creating files inside a Picker-granted folder under `drive.file` is documented behaviour, but the 3A acceptance check proves it with the probe file before saving the folder.
- **Key loss or rotation:** if `DRIVE_TOKEN_KEY` changes, stored tokens can't be decrypted. The app treats this as "needs reconnect" and never crashes. The key version column allows rotation later.
- **New external script:** `apis.google.com` loads only on Settings, on demand.

## Acceptance tests

Unit (synthetic, no network):
- Encrypt/decrypt round trip; tampered ciphertext, wrong key and wrong version are rejected.
- State: mismatch, reuse, expiry and different user are rejected.
- PKCE verifier and challenge are correct.
- Callback: wrong Google account, missing or extra scope, and Google error responses are refused, and nothing is stored.
- Refresh: an expired access token is refreshed once. A revoked or expired refresh token gives "needs reconnect".
- Disconnect: revoke plus delete; delete still happens if revoke fails.
- No response body or log line contains a token; this is checked by scanning captured output.

SQL (disposable Postgres, run twice):
- The migration is idempotent; RLS is owner-only; another user and anon get zero rows and cannot write; the trigger works.

Browser (synthetic fixture with Google endpoints mocked; external hosts stay blocked):
- Settings at 320/390/768/1280 px with no overflow.
- Connect → callback → connected status; Disconnect → not connected.
- A logged-out request and a non-owner request to every `/api/drive/*` route are denied.

Live (after deployment, needs your login):
- Connect with your Google account; another Google account is refused.
- Choose your folder with Picker; the probe succeeds, and nothing remains in the folder afterwards.
- Disconnect; the app disappears from myaccount.google.com → Security → Third-party connections.

Also run: tsc, ESLint, the production build and `git diff --check`.

## Deploy order and rollback

1. Owner setup above.
2. Apply `008` with a read-only pre-check and post-check.
3. Fast-forward `main`; Vercel deploys.
4. Smoke checks, then the live acceptance tests with you.

Rollback: promote the previous deployment (`dpl_Di5KCp7HPLBsqTvgxERHSZJUJqn8`). The `drive_connections` table can stay (additive) or be dropped by a reviewed migration. Revoke access at myaccount.google.com or delete the OAuth client. No idea, project, file or Drive data is moved or deleted at any point.
