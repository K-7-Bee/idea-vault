# Phase 3 plan: Google Drive for attachments (proposal; not approved, nothing built)

Goal (from the final master prompt and decision V-008): new attachments and recordings are stored in the owner's Google Drive. The app keeps only metadata in Supabase. Existing Supabase files stay where they are and remain readable. The integration uses least-privilege OAuth, handles tokens securely, validates links and permissions, disconnects cleanly, and retrieves files selectively.

## Decisions needed from the owner before any code

| ID | Question | Recommendation |
| --- | --- | --- |
| V-007 | Google account and Cloud project for the OAuth app | A Cloud project you own. The consent screen stays in **Testing**, with only your Google account as a test user, so no Google verification is needed for one user. |
| V-007a | Drive permission (scope) | `drive.file` only: the app sees files it created or that you pick. It cannot read the rest of your Drive. Broader scopes need separate approval. |
| V-008a | Existing Supabase attachments | Leave them in Supabase, readable as today. No automatic copy, move or deletion. A later, separately approved slice could copy them on request. |
| V-008b | Largest file you expect (recordings, renders) | Needed to size uploads. Files go straight from the browser to Drive (see below), so the Vercel 4.5 MB request limit doesn't apply. |
| V-013 | When Drive is disconnected or unreachable | New captures keep the current Supabase upload as a fallback, so offline capture and the outbox keep working. Alternative: block attachments until reconnected. |

## Owner setup (about 15 minutes, done in your Google account; I can't do these)

1. In Google Cloud Console, create (or choose) a project and enable the **Google Drive API**.
2. Set up the **OAuth consent screen**: External, publishing status *Testing*, add your Google account as a test user, and add the scope `.../auth/drive.file`.
3. Create an **OAuth client ID** of type *Web application*, with these authorized redirect URIs:
   - `https://kaushik-kamal.vercel.app/api/drive/callback`
   - `http://localhost:3000/api/drive/callback`
4. In Vercel → Project → Environment Variables (Production, and Preview if wanted), add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `DRIVE_TOKEN_KEY`: a random 32-byte key I generate locally and hand to you. It's never committed or logged.
5. Tell me when that's done. Never paste the client secret into chat; enter it only in Vercel.

## Design

- **OAuth (server only):**
  - `/api/drive/connect` creates a one-time, expiring state bound to the session, plus a PKCE verifier, kept in an HttpOnly cookie. It then redirects to Google with `access_type=offline`.
  - `/api/drive/callback` checks the state, the logged-in owner and the scope, then exchanges the code on the server.
  - `/api/drive/disconnect` revokes the token at Google and deletes it.
  - Each of these routes re-checks the allowed owner, like the proxy does.
- **Token storage:**
  - Table `drive_connections`, one row per owner: Google account ID/email, granted scopes, expiry, and refresh/access tokens encrypted with AES-256-GCM under `DRIVE_TOKEN_KEY` (plus a key version for rotation).
  - It's owner-only under row security, and anonymous access is revoked. The app runs without a Supabase service key, so the owner's own session can technically read the *ciphertext*, but it's useless without the server-only key.
  - Tokens are never sent to the browser, never logged, and never stored in plain text.
- **Folders:**
  - On first connect the app creates `Idea Vault/`, with `Ideas/` and `Projects/<project>/` beneath it. Under `drive.file` these are app-created, so the app can use them.
  - Folder IDs are stored; names are display only.
- **Uploads (large files):**
  - The browser asks `/api/drive/upload-session` for a resumable upload session (file name, type, size, target).
  - The server creates the session with Google and returns only the session URL.
  - The browser then uploads in chunks directly to Google, and the server records the final file ID, size and MD5 that Drive reports.
  - Interrupted uploads resume from the last confirmed byte.
  - *To verify in slice 3B:* browser access (CORS) to the session URL when the session was created server-side with the app's Origin.
- **File references:** a new table `file_refs` covers ideas and projects:
  - Provider (`supabase` or `drive`), Drive file ID or Supabase path, name, MIME type, size, checksum, provider-modified time.
  - Sync state: `uploading`, `ready`, `missing` or `revoked`.
  - Existing `idea_files` rows keep working unchanged; reading them doesn't depend on Drive.
- **Viewing:**
  - `/api/drive/file/[id]` streams the file after an owner check, with range support so audio and video can seek. Images and audio preview the same way they do today.
  - A file that was deleted or moved in Drive, or whose permission was revoked, shows as unavailable with a reason. Nothing breaks, and the metadata is kept.
- **Picking existing Drive files** (Google Picker, optional slice 3C): grants `drive.file` access to just the chosen files and links them to an idea or project.
- **Story Studio images (3D):** an image-first Story Library and real images in shot panels, using the same file references.

## Slices

| Slice | Scope | Acceptance |
| --- | --- | --- |
| 3A Connect | Settings page (`/vault/settings`): connect, status, disconnect; `drive_connections` migration; encrypted token storage; app folder creation | State mismatch, replay and expiry rejected; wrong Google account or a missing scope refused; refresh works after expiry; disconnect revokes and removes tokens; tokens never appear in responses or logs; anonymous and other-account requests denied |
| 3B Upload | Drive upload for new idea attachments and recordings (with the fallback chosen in V-013); `file_refs` migration; resumable upload; owner-checked streaming view | Interrupted large upload resumes; MD5 and size match; duplicate names handled; quota/429/5xx back off with bounded retries; outbox and offline capture unchanged; legacy Supabase files still readable |
| 3C Projects + picker | Files on projects (Lab evidence, components, references); pick existing Drive files | Only picked files accessible; moved, renamed or deleted files reported without data loss |
| 3D Story images | Image-first Story Library; images on characters and shot panels | Images load from Drive with owner checks; missing image shows a placeholder, record intact |

Each slice gets its own scope, files, risks, tests and rollback before code, as before.

## Risks

- **Token theft:** mitigated by encryption with a server-only key, HttpOnly cookies, exact redirect URIs, and keeping tokens out of logs.
- **Testing-mode refresh tokens expire after 7 days:** Google limits refresh tokens for apps in *Testing*. Expect a "reconnect Drive" prompt weekly unless the app is published. Publishing with only `drive.file` usually doesn't require a security assessment, but the consent screen must be completed. To confirm when we get there.
- **Vercel function time and size limits:** avoided for uploads by direct browser-to-Drive transfer. Streaming large downloads through a function may hit duration limits, so for very large files offer "Open in Drive".
- **Drive quota is your storage:** the Drive's free tier is 15 GB shared with Gmail and Photos.
- **Accidental file loss:** the app never deletes Drive files automatically. "Remove attachment" unlinks it in the app; deleting from Drive is a separate, explicit action, if offered at all.

## Rollback

Disable the Drive feature (a flag or the previous deployment). New captures fall back to Supabase uploads. Drive files remain in your Drive, and their references stay in `file_refs`. Revoke the OAuth client in Google Cloud if needed. No Supabase data or files are moved or deleted at any point.
