# Slice 3B plan: idea attachments and recordings in Google Drive (proposal; not approved, nothing built)

Parent plan: [PHASE_3_PLAN.md](PHASE_3_PLAN.md). Builds on 3A (live 2026-11-20). Decisions: V-007a (owner-picked folder, `drive.file`), V-008a (legacy Supabase files stay), V-008b (up to 1 GB), V-013 (fallback to Supabase under its limit; larger files wait for Drive).

## Current behaviour (source and live checks, 2026-11-20)

- Attachments are uploaded from the browser straight to the private Supabase bucket `attachments`, limited to **25 MB per file** (live bucket `file_size_limit` 26214400; app `MAX_FILE_BYTES`).
- There are two upload paths:
  - `pushIdea` in `src/lib/sync.ts`: new captures, including offline captures replayed from the IndexedDB outbox. Files are kept on the device until they are sent.
  - `uploadFiles` in `src/app/vault/capture.tsx`: adding files to an existing idea, online only.
- Records live in `idea_files` (owner-only insert/select/delete; no update policy). Display uses one-hour Supabase signed URLs.
- Removing an attachment deletes its record, keeps the bytes and stores a device recovery record. Restoring re-inserts the record.
- Live data: 0 `idea_files` rows, 0 storage objects.

## Scope

1. **Destination per file:**
   - Drive is connected with a folder chosen → the file goes to Drive (up to 1 GB).
   - Otherwise, a file of 25 MB or less goes to Supabase as today.
   - Otherwise, the file waits on the device as "Waiting for Google Drive" and uploads when Drive is available.

   The idea's text always saves immediately.
2. **Resumable direct upload, browser → Drive.**
   - The server creates the upload session with the owner's token and returns only the session URL.
   - The browser sends 8 MB chunks with `Content-Range`.
   - After an interruption, the upload asks Drive how much arrived and continues from there. This also works after a reload, because the session URL and file ID are kept with the outbox entry.
   - The refresh token never reaches the browser.
3. **Completion check on the server.** The server reads the Drive file's metadata and records it only if all of these hold:
   - the size matches;
   - the parent folder is the chosen folder;
   - the file's private `vaultFileId` tag matches;
   - the file isn't trashed.

   It stores Drive's MD5 checksum for later integrity checks. Content is not re-hashed in the browser: hashing 1 GB on a phone is slow, so size plus Drive's checksum is the check.
4. **Records:** additive migration `009_drive_files.sql` extends `idea_files` instead of adding a new table, so existing queries, recovery and exports keep working.
   - `provider` (`supabase` | `drive`, default `supabase`)
   - `drive_file_id`
   - `md5`
   - Drive rows use `path = 'drive/<drive_file_id>'` so the existing not-null and recovery comparisons still hold.
   - Checks: a Drive row needs a valid Drive ID; a Supabase row has none.

   Project and Story files (3C/3D) can reuse the same columns later.
5. **Viewing:**
   - `GET /api/drive/file/[fileId]` checks the owner and the row, then streams the file from Drive with `Range` support, so audio and video can seek. Images, audio and video under 50 MB play in place.
   - Larger files show **Open in Google Drive**, a link to the file in your own Drive. This avoids Vercel function time and bandwidth limits.
   - A file that was deleted, moved out or trashed in Drive shows "Unavailable in Drive" with the reason. The record and the idea stay intact.
6. **Removal:** "Remove attachment" unlinks it in the Vault only. The Drive file stays in your folder (no automatic Drive deletion). Recovery records carry `provider` and `drive_file_id`, so restore works for Drive files too.
7. **Size limits:** a file over 1 GB is refused before upload. The 25 MB message now only applies when Drive isn't connected.
8. **Kill switch:** `DRIVE_UPLOADS_ENABLED` (server env, default off).
   - Off: everything behaves exactly as today (Supabase, 25 MB).
   - It is turned on only after the live check below passes, and turned off again to roll back without a redeploy of code.

## Not in this slice

- Project/Lab files and the Picker for existing Drive files (3C).
- Story images (3D).
- Moving legacy Supabase files to Drive.
- Deleting files from Drive.
- AI indexing.

## Files

New:
- `supabase/009_drive_files.sql`
- `src/lib/drive/upload.ts` (browser: chunking, resume, progress)
- `src/app/api/drive/upload-session/route.ts`
- `src/app/api/drive/upload-complete/route.ts`
- `src/app/api/drive/file/[fileId]/route.ts`
- `src/lib/drive/files.ts` (server: session creation, metadata verification, streaming)
- tests: `tests/drive-upload.test.mjs`, `tests/browser/drive-upload.spec.ts`, `tests/sql/phase3b-behaviour.sql`

Changed:
- `src/lib/sync.ts` (destination choice in `pushIdea`)
- `src/app/vault/capture.tsx` (destination choice in `uploadFiles`, size messages, progress, "waiting for Drive" state, Drive file display)
- `src/lib/ideas.ts` (columns, URLs for Drive rows, limits)
- `src/lib/outbox.ts` (per-file upload session state)
- `src/lib/recovery-operations.ts` (carry Drive fields)
- `src/app/vault/ideas/[id]/idea-view.tsx` (display)
- `src/lib/drive/google.ts` (resumable session, metadata, media download)
- `tests/browser/api-fixture.mjs` (synthetic resumable upload and media download)
- `.env.example`

## Risks

- **Browser upload to a server-created session (CORS).** Google allows the browser to continue a resumable session when the session was started with the app's `Origin`. This must be proven live before the switch goes on. If it fails, the fallback is to pass 4 MB chunks through a Vercel function (under its 4.5 MB request limit). That works but uses function time; it would come back to you as a change.
- **Session URL is a capability:** anyone holding it can upload bytes into that one pending file for about a week. It is kept only in the owner-bound outbox on the device, never logged, and points only at the chosen folder.
- **Device storage:** offline files wait in IndexedDB. Very large files on iPhone/iPad Safari can hit storage limits. The existing quota handling keeps the file in memory and warns, and the tab must stay open.
- **Weekly reconnect (Testing mode):** while Drive needs reconnecting, small files fall back to Supabase (as decided) and large ones wait. The banner says which happened.
- **Streaming limits:** previews go through a Vercel function; files over 50 MB open in Drive instead.
- **Orphans:**
  - An upload that finishes in Drive but whose record save fails is retried with the same file ID (idempotent).
  - An abandoned session leaves no file.
  - A Drive file whose record was never created can be found by its `vaultFileId` tag; no automatic cleanup.

## Acceptance tests

Unit (synthetic):
- Destination choice for every combination: connected, needs reconnect, not connected, flag off, size ≤ 25 MB, size between 25 MB and 1 GB, size over 1 GB.
- Chunk boundaries are multiples of 256 KiB; a 308 response with `Range` resumes from the right byte; retries back off on 429/5xx, and the number of attempts is bounded.
- Completion is refused for a size mismatch, the wrong parent, a missing or wrong `vaultFileId` tag, or a trashed file.
- Recovery round trip of a Drive record.
- No token or session URL appears in logs or responses other than the session response.

SQL (disposable Postgres, run twice):
- Existing rows default to `supabase`.
- A Drive row needs a valid ID; a Supabase row cannot carry one.
- Owner-only rules are unchanged; other users and anon are denied.

Browser (synthetic Google):
- Capture with a Drive file; interrupt mid-upload and reload, and it resumes from the confirmed byte; the record matches.
- Offline capture with small and large files: the small one falls back while Drive needs reconnecting; the large one waits and uploads after reconnecting.
- Add a file to an existing idea.
- Previews: image and audio play from `/api/drive/file`; a large file shows Open in Drive; a missing file shows unavailable.
- Remove and restore a Drive attachment; the Drive file stays.
- The other account, anon and cross-origin are denied on all new routes.
- Existing Supabase attachments still display.
- Widths 320–1280.

Live (with you, switch on):
- A 2 MB photo, a voice note, and a large video (≥ 100 MB, interrupted once) land in your folder, with matching size and checksum.
- Previews work; the large video opens in Drive.
- Remove → the file is still in Drive → restore.

Also: tsc, ESLint, production build.

## Deploy order and rollback

1. Apply `009` with read-only pre- and post-checks.
2. Deploy with `DRIVE_UPLOADS_ENABLED` off and smoke-check that nothing changed.
3. Turn the switch on.
4. Run the live acceptance tests with you.

Rollback: turn the switch off. New files then go to Supabase again (25 MB), and Drive files already linked stay viewable. Or promote the previous deployment. The added columns stay (additive). Nothing in Drive or Supabase is moved or deleted.
