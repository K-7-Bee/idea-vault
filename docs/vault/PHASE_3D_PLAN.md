# Slice 3D plan: Story Studio images (approved 2026-11-20 with all recommended choices; built locally, not applied or deployed)

Parent plan: [PHASE_3_PLAN.md](PHASE_3_PLAN.md). Builds on 3C (live): project files in Drive, uploads into `Projects/<title>`, Picker linking in place, attach to a record, Check files. Parent acceptance for 3D: "Images load from Drive with owner checks; missing image shows a placeholder, record intact."

## Current behaviour (source, 2026-11-20)

- Story and hybrid projects have tabs for the Story Bible, Characters (with relationships), Structure (season → episode → scene → shot, with shots shown as panels inside their scene), Timeline and Continuity. All of these are text only.
- The 3C Files tab can upload or link any file, but a file can only be attached to a lab entry or a component.
- Images in the Files tab load in full through `/api/drive/file/[id]`, up to 50 MB.

## Scope

1. **Images on characters and story items.**
   - Attaching works the same way as in 3C. A file can be attached to a character or to any Structure item (season, episode, scene or shot), as well as to a lab entry or component.
   - Each character card and Structure card gets an **Add image** button. It offers upload or "Link from Google Drive" and attaches the image to that card in one step.
2. **Main image.**
   - A card shows its **main image** large: a portrait on characters, a frame on shot panels (16:9).
   - Other images show as a small strip under it.
   - The first image attached becomes the main one. **Make main** changes it.
3. **Story Library (image-first).**
   - Story and hybrid projects get a **Gallery** view in the Files tab: a grid of the project's images.
   - Each image shows what it's attached to (a character, a scene and so on). It can be filtered by character or by scene/shot.
4. **Thumbnails.**
   - Cards and the gallery use small previews instead of the full file. This uses a new `?size=thumb` option on the same owner-checked file route.
   - The server asks Drive for the file's thumbnail and streams it. If Drive has no thumbnail, it falls back to the full image within the 50 MB limit, or to a placeholder.
5. **Missing images.**
   - A file that's unavailable in Drive (from Check files, or when loading fails) shows a placeholder with the reason. The card and its text stay as they are.
   - Nothing is removed automatically.
6. **Data:** migration `012_story_images.sql`, additive. On `project_files`:
   - `character_id` and `unit_id`, with same-project foreign keys (set to null if the record is deleted);
   - a check that a file is attached to at most one record;
   - `is_main` (boolean), with partial unique indexes that allow only one main image per character and per Structure item.

## Not in this slice

- Images on Story Bible entries, timeline events or continuity records.
- Image editing, cropping or generated images.
- Reordering beyond "make main".
- Moving or copying Drive files, and deleting from Drive.
- Offline story uploads.

## Files

New:
- `supabase/012_story_images.sql`
- `src/app/vault/projects/[id]/story-image.tsx` (card image, strip, placeholder, Add image)
- `src/app/vault/projects/[id]/gallery.tsx`
- tests: `tests/sql/phase3d-behaviour.sql`, `tests/browser/story-images.spec.ts`, unit tests in `tests/drive-project-files.test.mjs`

Changed:
- `src/lib/drive/files.ts` and `targets.ts` (upload target gains character/unit; one-record rule)
- `upload-session`/`upload-complete` (unchanged flow, new target fields)
- `src/app/api/drive/project-files/route.ts` and `[id]/route.ts` (attach to character/unit; make main)
- `src/app/api/drive/file/[fileId]/route.ts` (`size=thumb`)
- `src/lib/drive/google.ts` (thumbnail fetch)
- `src/lib/project-files.ts`
- `project-files.tsx`, `record-section.tsx`, `project-workspace.tsx`
- `tests/browser/api-fixture.mjs` (thumbnails, new columns)

## Risks

- **Drive thumbnails:** `thumbnailLink` is short-lived, and its behaviour under `drive.file` is not verified live. The server fetches it with the owner's token and never exposes the link. If it fails, the full image is used within 50 MB, or a placeholder is shown.
- **Many images on one page:** previews load lazily and are bounded by the number of cards on screen. Each preview is one owner-checked request.
- **Make main races:** two quick "make main" clicks are serialised by the unique index. The loser gets a clear "try again".
- **Deleting a character or Structure item** clears the link; the file stays in the project and in Drive. A Structure item that still contains others can't be deleted (existing rule).

## Acceptance tests

Unit:
- The upload target accepts a character or unit only from the same project, and only one record per file.
- Choosing the thumbnail versus full image versus placeholder.
- Make main switches exactly one row.

SQL (disposable Postgres, run twice):
- Same-project foreign keys for characters and units.
- The at-most-one-record check.
- One main image per record.
- Deleting a character or unit nulls the link and clears main.
- Owner-only access, with anon and other users denied.
- The 3A, 3B, 3C and grant suites still pass.

Browser (synthetic Google):
- Add image to a character, by upload and by link, and it shows as the portrait.
- An image on a shot shows in its scene's panel.
- A second image goes in the strip; make main swaps them.
- Gallery filters by character and by scene.
- A trashed image shows the placeholder while the card text is intact.
- Thumbnails are served from the thumbnail route.
- Anon, the other account and cross-origin requests are denied.
- Widths 320–1280.

Live (with you):
- Add a portrait to a character and a frame to a shot.
- Open the Gallery.
- Trash one image in Drive, then Check files and see the placeholder.

Also: tsc, ESLint, production build.

## Deploy order and rollback

1. Apply `012`, with read-only checks before and after.
2. Deploy.
3. Smoke-check, then the live test.

Behind the existing `DRIVE_UPLOADS_ENABLED` switch: with it off, images still show, but adding is disabled.

Rollback: promote the previous deployment. The columns stay (additive), and old code ignores them. Nothing in Drive is moved or deleted.
