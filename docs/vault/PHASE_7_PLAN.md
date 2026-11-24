# Phase 7 plan: iPad and Pencil (proposed 2026-11-24, awaiting owner approval)

Source: [IDEA_VAULT_3_IPAD_PENCIL_ADDENDUM.md](../../IDEA_VAULT_3_IPAD_PENCIL_ADDENDUM.md). It was committed with the first audit, but no phase plan covered it until now. The addendum's rules apply throughout:
- change the existing Vault and Story Studio, never a separate app;
- private by default;
- nothing public without the Completed + Published approval;
- no duplicate login, asset library or Story Studio;
- audit first, then stop for approval.

Three slices, each approved and taken live on its own:
- **7A:** sketching on storyboard shots;
- **7B:** annotating images;
- **7C:** a visual board, planned here but built only after 7A and 7B have been used for a while.

## Audit (2026-11-24, from the code)

| Area | What exists | Reuse |
| --- | --- | --- |
| Framework | Next.js 16.4.6, React, Tailwind. Supabase (RLS, owner-only). Runtime dependencies: only `@supabase/*`, `next`, `react`, `react-dom`, `sharp`. | Everything. Read `node_modules/next/dist/docs` before writing code (AGENTS.md). |
| Story structure | `story_units` (007): season → episode → scene → shot. Each shot has `summary` (notes), `camera`, `duration_seconds` and `position`. The Story tab edits them in `src/app/vault/projects/[id]/record-section.tsx`, and **↑/↓ buttons already reorder** siblings. | Shots are what sketches attach to. Scene notes already exist (`summary`). The buttons stay as the non-drag alternative. |
| Images | `project_files` (011, 012) are **Google Drive files** (`drive_file_id`). They link to an entry, a component, a character or a structure item, each with one main image. Thumbnails come through `/api/drive/file/…`, same-origin and owner-only, and render with `Thumb` / `StoryImages` (`story-image.tsx`). Adding files uses the Picker, or a resumable upload straight to Drive (`/api/drive/upload-session`, `/api/drive/upload-complete`). | Images to annotate (7B), backgrounds imported into a sketch, and PNG exports, which become ordinary project files. No second asset library. |
| Engineering notes and diagrams | `project_entries` and `project_components`, which can have files attached. | 7B can annotate their images. |
| Drawing code | None. No canvas or drawing library is installed, and no pointer handling exists outside an archived 3D component. | New, small. |
| Security headers | `img-src 'self' data: blob:` plus Supabase; `connect-src 'self'` plus Supabase and Google APIs. | Drawing in SVG or canvas and exporting through `blob:` work without CSP changes. |
| Offline | Ideas use an IndexedDB outbox (`src/lib/sync.ts`); project records save directly. | 7A adds a local draft only for the open drawing (below), not a second sync system. |
| Backup and export | `backup-live.mjs` finds every public table at run time, so a new table is included automatically. "Download my data" lists its tables explicitly. | Add the new table to Download my data. |
| Tests | SQL suites, unit tests, Playwright (Chromium for everything; Firefox and WebKit for public pages). WebKit doesn't complete the Vault login against the http fixture. | New suites. Getting the WebKit Vault login working is part of 7A, because WebKit is the closest thing to iPad Safari that CI has. |

**Conclusion:** most of the infrastructure exists already: storage (Drive), linking (`project_files`), ordering, privacy (RLS) and publishing rules. What's missing is one table for drawing data and one editor component that both 7A and 7B use.

## The shared design (7A and 7B)

**One table, one editor.** A *drawing* is vector data the owner draws. It belongs to a project and is linked to one shot or scene (7A), or laid over one existing image (7B). The same editor handles both: 7B is 7A with an image underneath.

**Migration `018_drawings.sql`** (additive, re-runnable):
- `drawings`:
  - identity: `id`, `user_id` (default `auth.uid()`), `project_id`;
  - links: `unit_id` (a shot or scene) or `base_file_id` (a `project_files` row: the image being annotated);
  - `title`, and `aspect` (`16:9`, `4:3`, `1:1`, `9:16`);
  - `data` (jsonb: the strokes, arrows and labels, described below);
  - `version` (each save must name the version it edited), `created_at`, `updated_at`.
- Rules:
  - both links are foreign keys within the same project (the existing `(project_id, id)` pattern);
  - a drawing has exactly one link;
  - at most one annotation layer per image;
  - `data` is limited to 2 MB.
- Row-level security: owner only, like every Vault table. No `anon` grants. Not readable by the public site or by the assistant.

**Drawing data** (versioned format, `v: 1`), in coordinates on a fixed logical canvas (for example 1600 × 900 for 16:9), so a sketch looks the same at any screen size:
- **Pen:** colour, size, and points as whole numbers `[x, y, pressure, …]`. Points are thinned while drawing so a busy page stays small.
- **Arrow (7B):** start, end, colour.
- **Label (7B):** position, text (up to 200 characters), colour.

**Display:** thumbnails and the editor draw the data as inline SVG. Viewing a sketch needs no Drive connection and no stored image. Each thumbnail has a text alternative ("Sketch for shot 3: <title>").

**Editor** (`/vault/projects/[id]/drawings/[drawingId]`): a full page, so it fills an iPad screen and survives a reload.
- **Tools:** pen (3 sizes, 6 colours), eraser (removes whole strokes), and in 7B arrow and label. Plus undo, redo and clear (clear can be undone).
- **Controls:** every control is a button at least 44 px. Keyboard: ⌘/Ctrl+Z, ⇧⌘/Ctrl+Shift+Z, and tool letters. A mouse works everywhere.
- **Input:** Pointer Events.
  - **Apple Pencil** (`pointerType: "pen"`) draws, with pressure when the device reports it and coalesced points where Safari provides them.
  - **A finger** scrolls and zooms the page by default. "Draw with finger" turns finger drawing on.
  - **While the Pencil is touching the screen**, other touches are ignored. This is the closest a website can get to palm rejection; it isn't the system feature, and the page says so in its help text.
  - **Without pressure** (mouse, or a stylus that doesn't report it), lines have constant width.
- **Stroke rendering:** `perfect-freehand` (MIT, a few KB, no dependencies), pinned to an exact version. It turns points and pressure into smooth outlines. Without it, lines would be plain polylines (decision D4).
- **Saving:**
  - It saves automatically 2 s after the last stroke and on leaving the page, and shows "Saving…", "Saved" or "Not saved – Retry".
  - Until the server confirms a save, the drawing is also kept in this browser's IndexedDB, so a reload, a crash or going offline loses nothing. The page offers to restore it.
  - If the server copy changed meanwhile (another device), nothing is overwritten: the local version is saved as a copy named "(from this iPad)".
- **Export PNG:** an explicit button. It renders the drawing, or the image plus annotations, to a PNG and saves it to Drive through the existing upload as a new project file on the same shot, character or record. The original image is never changed, and the drawing stays editable.

**Loading:** the editor and `perfect-freehand` load only on the editor page and on the Story tab's storyboard view, never on public pages. The homepage byte budget test proves this.

## 7A: sketching on storyboard shots

### Scope
1. Migration 018 (the shot and scene link part), SQL suite `phase7a-behaviour.sql`.
2. The editor (pen, eraser, undo, redo, clear, autosave, local draft, conflict copy, export PNG).
3. **Storyboard view** in the Story tab: a scene's shots as a grid of cards, each showing its sketch (or main image), title, duration and notes. Each card has "Sketch", "Open" and the existing ↑/↓.
4. **Touch reorder:** press and hold a card's handle, then drag. Saved through the same `position` update as ↑/↓. No library: the grid is a single list.
5. **Import an image as a sketch background:** pick or upload an image with the existing Drive flow. It sits under the strokes, and the image itself is not modified.
6. Getting the WebKit Vault login working in the test fixture, then the editor tests in Chromium and WebKit.
7. Download my data includes drawings, and the runbook and privacy page are checked. Privacy needs no change: sketches are Vault content, private, and never sent to the assistant. The privacy page is re-read to confirm.

### Files (expected)
- **New:**
  - `supabase/018_drawings.sql`
  - `tests/sql/phase7a-behaviour.sql`
  - `src/lib/drawing/` (data format, encode and decode, point thinning, size check, SVG path; pure functions with unit tests)
  - `src/app/vault/projects/[id]/drawings/[drawingId]/page.tsx` and the editor component
  - `src/app/vault/projects/[id]/storyboard.tsx`
  - `tests/drawing.test.mjs`
  - `tests/browser/sketch.spec.ts`
- **Changed:**
  - `record-section.tsx` (storyboard toggle and Sketch button)
  - `story-image.tsx` (sketch thumbnail)
  - the Download my data route
  - `package.json` (`perfect-freehand`)
  - the browser fixture (the drawings table; a WebKit-friendly login)
  - `playwright.config.ts` (the sketch spec added to the WebKit sample)
  - the runbook, PROGRESS and DECISIONS

### Risks
- **Data loss while drawing**, the main risk: handled by the local draft, autosave with visible state, the conflict copy, and tests that reload mid-drawing and go offline.
- **iPad Safari behaviour** (scrolling while drawing, pressure, coalesced events) can't be fully proven in CI. WebKit plus synthetic pen events get close; your real-device pass is the final check.
- **Large drawings:** point thinning and the 2 MB limit. Near the limit, the editor warns and suggests a new sketch.
- **Drive expiry while exporting:** while the OAuth app is in Testing, a token over 7 days old makes export fail. The editor says "Reconnect Drive to export" and keeps the drawing; drawings don't depend on Drive.

### Acceptance tests
1. SQL:
   - owner only;
   - `anon` and another account can't read or write drawings;
   - a shot from another project is refused;
   - one link per drawing;
   - over 2 MB is refused;
   - a save with a stale `version` is refused.
2. Unit: the format round-trips, thinning keeps the shape within 1 logical pixel, and size checks hold.
3. Browser (Chromium and WebKit):
   - draw with a mouse, and with synthetic pen events with and without pressure;
   - erase, undo, redo, clear and undo the clear;
   - autosave shows "Saved";
   - after a reload the sketch is identical.
4. Reload before the save completes, and while offline: the draft is offered and restored. Two tabs editing the same sketch: the second save becomes a copy, and nothing is lost.
5. The storyboard grid at 320, 768 and 1280 px:
   - reorder by drag;
   - reorder with ↑/↓, also by keyboard;
   - the order persists after a reload.
6. A sketch with an imported background: export PNG creates a new Drive file on the shot (fixture), and the background file is unchanged (same md5).
7. Accessibility and contrast checks on the editor and the storyboard. The homepage byte budget is unchanged.
8. `/api/drive/file/…` and drawings can't be read logged out. No public page includes drawing data.
9. **Real iPad (you):** acceptance items 1, 2 and 5 of the addendum, from the checklist that comes with the go-live.

### Rollback
- Promote the previous deployment. The table stays (additive), and the old app ignores it.
- Drawings remain in the database and in backups.
- PNGs already exported remain ordinary Drive files.

## 7B: annotating images

### Scope
1. Migration 019 if needed: the `base_file_id` link is already in 018, so probably no new migration.
2. **"Annotate"** on any image in the Vault: character portraits, shot and scene images, Gallery images, and images on engineering entries and components. It opens the same editor with the image underneath, at its own proportions.
3. Two more tools: **arrow** and **label** (short text, set in place with the keyboard on screen). Labels are real text in the data, so they stay editable.
4. **Thumbnails show annotations**, with an "Annotated" mark and a "Show original / Show notes" toggle. The original image file is never modified.
5. **Export PNG** of the image with its annotations, as a new project file on the same record, named "<original> (annotated).png". PDF export isn't included: nothing in the app makes PDFs today (the addendum says only with existing tooling).
6. Publishing stays as it is. An exported PNG is an ordinary project file, so it can appear on the public site only if you choose it in the showcase editor and publish a Completed project. Drawings themselves are never public.

### Files (expected)
- **Changed:**
  - the editor (base image, arrow, label)
  - `story-image.tsx` and `project-files.tsx` (Annotate, the mark, the toggle)
  - `src/lib/drawing/` (arrow and label data)
  - the SQL suite (`base_file_id` rules)
  - `tests/browser/annotate.spec.ts`
- **Possibly:** `019_*.sql` if the 7A review changes the link rules.

### Risks
- **Drawing over a Drive image and exporting it:** the image comes through the same-origin `/api/drive/file` route, so the canvas isn't "tainted" and export works. Covered by a test.
- **An image that's later removed from Drive:** the annotation remains, marked "Original unavailable". Export is then disabled.
- **Confusing the original and the annotated copy:** the mark and the toggle, and exports are always new, separately named files.

### Acceptance tests
1. Annotate a character image and an engineering diagram: pen, arrow and label; undo; save; reload, and everything is identical.
2. The original's bytes are unchanged (md5 before and after), with or without an export.
3. Each image has one annotation layer. Annotating an image in another project is refused (SQL).
4. Export creates "(annotated).png" on the same record. The showcase editor lists it like any file, and it isn't public until published.
5. `anon` can't read annotations or the exported file without publishing.
6. Accessibility and contrast checks, and the WebKit run.
7. **Real iPad (you):** addendum items 3 and 5.

### Rollback
As 7A. Annotations stay in the table, and exports stay in Drive.

## 7C: visual board (later; planned now, built only on request)

The addendum calls it optional and says it must not delay anything. It's planned here so the whole phase is visible. It gets its own approval after 7A and 7B have been used for a few weeks; that use will show whether a board is still wanted and what it should hold.

### Scope (as planned today)
- **Boards:** one or more per project.
- **Cards:** movable cards for a note, a project image, a sketch, a shot, a character or an engineering entry. They link to the real records and never copy them.
- **Connections:** lines between cards with a short label.
- **Navigation:** pan and zoom with a finger, and drag cards with the Pencil or a finger.
- **List view:** a "List" view of the same board for the keyboard and screen readers.
- **Not included:** an infinite-canvas engine, real-time collaboration, or handwriting recognition (the addendum defers these).

### Likely approach
- **Library:** an established, MIT-licensed node-and-connection library rather than custom code. The leading candidate is `@xyflow/react` (React Flow). Its exact version and licence get checked when 7C is planned in detail. Proprietary or watermark-licensed canvas SDKs are excluded.
- **Data:** tables `boards`, `board_cards` (position, size, a link to one record) and `board_links`, in migration `02x_boards.sql`. Owner-only, with the same SQL and browser test pattern.

### Risks to settle at that time
- **Bundle size:** the library loads only on the board page.
- **Touch gestures** conflicting with Safari's page zoom.
- **Keeping cards valid** when a record is deleted: the card shows "removed" rather than vanishing.

## Decisions needed

| # | Question | Recommendation | Alternative |
| --- | --- | --- | --- |
| D1 | Where drawing data lives | In the database (`drawings.data`, owner-only, included in backups, works when Drive is disconnected) | A JSON file per drawing in Drive (depends on Drive being connected to open a sketch) |
| D2 | Eraser | Removes whole strokes (simple, exact, undoable) | Rubs out parts of strokes (much more complex; later if needed) |
| D3 | PNG copies | Only when you press Export; thumbnails are drawn from the data | A PNG to Drive on every save (needs Drive connected; creates many files) |
| D4 | Smooth, pressure-shaped lines | `perfect-freehand` (one tiny MIT library, pinned) | No library: plain lines of constant width |
| D5 | Sketch shape | Choose per sketch: 16:9 (default), 4:3, 1:1, 9:16 | Always 16:9 |
| D6 | Layers per image (7B) | One annotation layer per image | Several named layers (more UI; later if needed) |
| D7 | 7C | Plan only; build after using 7A/7B, on request | Build straight after 7B |

## Order and gates

1. Approve this plan and D1–D7. 7A is built on the branch with every check passing in CI, and you get screenshots and a short screen recording from the fixture.
2. **7A go-live** (your word):
   - a backup first, because of the migration;
   - apply 018, with read-only checks before and after;
   - fast-forward `main`;
   - live checks;
   - then your iPad checklist.
3. 7B is built and goes live the same way, after you've used 7A on the iPad.
4. 7C only when you ask for it.

## Not in Phase 7

- Handwriting to text, AI reading of sketches, vector brush engines, real-time multi-user editing, infinite canvas (deferred by the addendum).
- Publishing drawings directly (only exported PNGs, through the existing showcase approval).
- A native iPad app or Apple Pencil hover and double-tap features that websites can't use reliably.
