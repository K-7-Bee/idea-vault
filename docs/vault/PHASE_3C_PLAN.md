# Slice 3C plan: project files and linking existing Drive files (approved 2026-11-20 with all recommended choices; live 2026-11-20)

Parent plan: [PHASE_3_PLAN.md](PHASE_3_PLAN.md). Builds on 3A (connection, folder) and 3B (resumable upload, verified recording, owner-checked viewing), both live. Decisions so far: V-007a (`drive.file`, owner-picked folder), V-008b (1 GB), V-013 (capture fallback).

## Current behaviour (source, 2026-11-20)

- Projects (`/vault/projects/[id]`, also reached through Engineering Lab and Story Studio) have:
  - tabs for the task board, milestones, lab notebook (`project_entries`: notes, experiments, evidence, results, lessons, decisions), components and code links/references;
  - story tabs for story and hybrid projects.
- Records hold text and optional web links only. There are no files.
- The project workspace is online-only ("changes need a connection"). It has no device outbox, unlike Capture.
- Deleting a record or project is a direct, confirmed delete (child rows cascade).

## Scope

1. **New "Files" tab** on every project.
   - **Upload:** choose files and send them to Drive, up to 1 GB each. Uses the 3B resumable browser-to-Drive upload, with the same completion checks (tags, folder, size, not trashed).
   - **Link from Drive:** opens Google Picker (multi-select, any file type, including Google Docs/Sheets). It links the chosen files where they already are. Nothing is moved or copied. Picking grants the Vault `drive.file` access to exactly those files.
   - **Attach to a record (optional):** a file can be tied to a lab-notebook entry (for example test evidence) or a component (for example a datasheet). That record then lists its files, read-only, with links.
   - **Unlink:** removes the Vault link only. The file stays in Drive and can be linked again with the Picker. No Drive deletion.
   - **Check files:** asks Drive about every linked file. A file renamed in Drive gets its name refreshed. A file that is trashed, deleted or no longer accessible is marked "Unavailable in Drive" with the reason. The record is never removed automatically.
2. **Where uploads go (proposed):** a `Projects/<project title>` subfolder inside your Vault folder, created on first upload. The Vault keeps the folder IDs, so renaming the project or folder later doesn't break anything; names are for display only.
3. **Viewing:** `/api/drive/file/[id]` also serves project files, with the same owner check, the 50 MB in-Vault limit, Range support and the safe-type rules.
   - Google Docs, Sheets and Slides have no downloadable bytes, so they always open in Drive.
4. **When Drive isn't available (proposed):** project uploads and picking are blocked with a clear message ("Connect or reconnect Google Drive in Settings"). Nothing is queued, because project pages are online-only. There's no Supabase fallback here; the V-013 fallback stays for Capture only.
5. **Data:** migration `011_project_files.sql`, additive.
   - **`project_files`:**
     - owner and project (composite foreign key to `projects(id, user_id)`, cascading);
     - optional `entry_id` / `component_id` (same-project foreign keys; set to null if the record is deleted);
     - `source` (`upload` | `picked`), `drive_file_id`, name, MIME type, size (null for Google Docs), md5;
     - `state` (`ok` | `unavailable`) with a reason, and `checked_at`.
     - Rules: owner-only RLS, no anon grants, a server-owned timestamp trigger, a unique `(project_id, drive_file_id)`, and Drive-ID format checks.
   - **`drive_folders`:** owner-only, holding the `Projects` folder and each project's folder ID. It is kept off the `projects` table so creating a folder never bumps the project's version and clashes with your edits.

## Not in this slice

- Story images on characters and shots (3D).
- Files on tasks, milestones or story records.
- Moving or copying existing Drive files.
- Deleting from Drive.
- Offline project uploads.
- Supabase fallback for projects.

## Files

New:
- `supabase/011_project_files.sql`
- `src/app/api/drive/project-files/route.ts` (link picked files; list and check)
- `src/app/api/drive/project-files/[id]/route.ts` (attach/detach to a record; unlink)
- `src/app/vault/projects/[id]/project-files.tsx` (tab UI)
- `src/lib/drive/picker.ts` (shared Picker loader, moved out of Settings)
- tests: `tests/drive-project-files.test.mjs`, `tests/browser/project-files.spec.ts`, `tests/sql/phase3c-behaviour.sql`

Changed:
- `src/lib/drive/upload.ts` (upload target: idea or project)
- `src/app/api/drive/upload-session/route.ts` and `upload-complete/route.ts` (project target, project subfolder, record into `project_files`)
- `src/lib/drive/google.ts` (create folder, batch metadata)
- `src/lib/drive/files.ts` (pure checks for picked files and check results)
- `src/app/api/drive/file/[fileId]/route.ts` (also look up `project_files`; Google Docs open in Drive)
- `src/app/vault/projects/[id]/project-workspace.tsx` and `page.tsx` (Files tab, load files)
- `src/app/vault/projects/[id]/record-section.tsx` (list files under entries and components)
- `src/app/vault/settings/drive-settings.tsx` (use the shared Picker loader)
- `tests/browser/api-fixture.mjs` (project files table, folder creation, batch metadata, Google Docs types)

## Risks

- **Picker grants are per file.** A picked file stays accessible until you remove the app's access in your Google account. Unlinking in the Vault doesn't revoke Google's grant: the Vault simply stops using it.
- **Picker-linked files live anywhere in your Drive**, not in the Vault folder. If you delete or trash them in Drive, they show as unavailable; the Vault can't prevent that.
- **The access token in the browser for the Picker** works as in 3A: short-lived, `drive.file` only, never stored.
- **Large file lists:** "Check files" asks Drive about up to 5 files at a time (individual requests, not the batch API), with up to 3 attempts on rate limits or server errors; anything still unanswered is reported as not checked and keeps its stored state.
- **Folder creation races:** two uploads at once could each create a project folder. Folder creation is serialised per project on the server: the unique row in `drive_folders` decides the winner, and an extra empty folder is left in place (not deleted).

## Acceptance tests

Unit:
- Upload target validation (idea vs project, entry/component must belong to the project).
- Classification of check results: ok, renamed, trashed, missing, no access.
- Google Docs are treated as open-in-Drive.
- Folder creation, reuse and the race rule; forgetting only folders that are gone.

SQL (disposable Postgres, run twice):
- Owner-only rules; other users and anon are denied.
- Composite foreign keys stop linking to another project's entry or component.
- Deleting an entry nulls the link; deleting the project removes its file rows.
- The unique Drive file per project holds.
- Folder rows are owner-only.

Browser (synthetic Google):
- Upload to a project lands in `Projects/<title>`; a second upload reuses the folder.
- Linking picked files (Picker simulated by calling the link route, since the real Picker script is external) records them without moving them.
- Attach a file to an entry and a component, and see it listed there.
- Check files flags renamed, trashed and deleted files.
- Unlink keeps the Drive file.
- A Google Doc opens in Drive.
- When Drive isn't connected, the message is shown and nothing is sent.
- Anon, the other account and cross-origin requests are denied on every new route.
- Widths 320–1280.

Live (with you):
- Upload a file to a project.
- Link an existing Drive file and a Google Doc with the Picker.
- Attach one to a lab entry.
- Rename one in Drive, then Check files.

Also: tsc, ESLint, production build.

## Deploy order and rollback

1. Apply `011`, with read-only checks before and after.
2. Deploy.
3. Smoke-check, then the live acceptance test.

The Files tab sits behind the existing `DRIVE_UPLOADS_ENABLED` switch. With it off, the tab shows linked files but offers no uploading or linking.

Rollback: switch off, or promote the previous deployment. The tables stay (additive). Nothing in Drive is moved or deleted.
