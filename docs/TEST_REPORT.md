# Test report (2026-11-24)

**Environment:**
- Windows 11 PC (8 GB RAM), Node 24.22.1, Playwright 1.63, Docker (Postgres 17.11).
- CI: GitHub Actions on Ubuntu.
- Every browser test runs against the **synthetic fixture** (a fake Supabase, Google and Gemini on 127.0.0.1) with the CSP enforced. Nothing touched production.

## Commands and results

| Command | Result | Where |
| --- | --- | --- |
| `npx tsc --noEmit` | Pass | Local, after every change |
| `npm run lint` | Pass: 0 errors, 1 old warning (`vault-journal.spec.ts:62`, unused variable in a test) | Local and CI |
| `npm test` (unit) | **229 / 229 pass**: 202 before tonight, 27 new across `drawing`, `boards`, `proposals` and `workspace` | Local |
| `npm run test:sql` | **13 / 13 suites, 432 checks pass**, including `phase7a` (31) and `phase7c` (24); every migration applied twice from 004 on | Local (Docker) |
| `npm audit --omit=dev` | 0 vulnerabilities | Local |
| `npx playwright test sketch annotate board proposals` | Chromium: sketch 7/7, annotate 2/2, board 3/3, proposals 3/3 | Local |
| WebKit subset (`CROSS_BROWSER=1 --project=webkit`) | Sketch 3/3 (pen and mouse, palm, unsaved-draft recovery), annotate 1/1, board 1/1; repeated twice with no failures | Local |
| Affected existing specs (story-images, project-files, showcase, vault, export, assistant) | All pass (27 + 20 + 1 + 5 in separate runs) | Local |
| `a11y.spec.ts` Vault screens (now includes the drawing editor and a board) | Pass: no axe violations at 320, 768 and 1280 px | Local |
| `contrast.spec.ts` (public and Vault, light and dark, plus the canary) | 5 / 5 pass, after the clipped-text fix to the check (T-5) | Local |
| `performance.spec.ts` | Pass: homepage within budget (see PERFORMANCE_REPORT) | Local |
| Full CI (types, lint, unit, audit, SQL, full Chromium browser suite) | 7A `564c58d`: green (run 45313627530). 7B `94a11ba`: green (45315498831). Audit fixes `127115c`: see FINAL_HANDOVER for the last run. | GitHub Actions |

A production `next build` runs as part of every browser test run: the app server builds with `VAULT_E2E` into `.next-e2e`. It succeeded every time tonight. A build against the real Supabase settings wasn't run locally, because `.env.local` isn't read in this workspace.

## What each new test covers (success and failure paths)

- **SQL `phase7a`:**
  - owner create, read and update;
  - another account and anon get nothing;
  - links across projects refused; one link only;
  - shape and data-format checks; the 2 MB limit;
  - stale-version updates change nothing; links can't be changed;
  - delete is refused while a shot or image is in use; project delete cascades.
- **SQL `phase7c`:**
  - cards and connections on the same board only; one connection per pair;
  - limits on kinds, text and position;
  - a card keeps existing when its record is deleted;
  - deleting a card removes its connections;
  - RLS and anon privileges.
- **`sketch.spec.ts`:**
  - pen (with pressure) and mouse strokes; eraser, undo, redo, clear and undoing the clear;
  - autosave, reload identical, thumbnail opens the editor;
  - palm rejection;
  - failed saves kept locally and restored after a reload;
  - two tabs: the second becomes a copy;
  - drag reorder, persisted, with the arrow buttons too;
  - a shot with sketches can't be deleted;
  - background image and export, original unchanged;
  - logged-out access refused.
- **`annotate.spec.ts`:**
  - pen, arrow and a label containing markup characters (shown as text);
  - reload; export as a new file on the same record, original file and Drive object untouched;
  - overlay toggle;
  - removal refused while annotated, allowed after deleting the annotations.
- **`board.spec.ts`:**
  - creating a board and cards of three kinds;
  - drag (snapped to the grid) and keyboard moves;
  - connection with a label;
  - List view after a reload;
  - deleting a card removes its connection; deleting the board;
  - a removed record shows as "(removed)"; logged-out access refused.
- **`proposals.spec.ts`:**
  - grounded proposals listed and bad ones dropped (counted);
  - nothing saved before Accept; Reject saves nothing; Accept inserts and shows on the Task board;
  - story continuity linked to the cited scene;
  - an unreadable reply shows nothing;
  - visitors (401), other sites (403), and records outside the mode or an over-long focus (400) refused.

## Not tested, or untestable here

- **A real iPad and Apple Pencil:** pressure values, palm behaviour, Safari scrolling. WebKit with synthetic `pointerType: "pen"` events is the closest CI gets. The checklist is in FINAL_HANDOVER.
- **The live Supabase project:** migrations 018 and 019 aren't applied there, and RLS on the live database is unverified for the new tables.
- **Real Google Drive:** PNG export and image upload were tested only against the fake Google.
- **Real Gemini:** proposal quality and whether the model sticks to JSON.
- **The editor's "Drive uploads off" state** (B-6): no browser test, because the fixture runs with uploads on.
- **The full Firefox suite** (only the public sample runs in Firefox), and the cross-browser workflow on GitHub for tonight's commits (it runs on pushes to `main`).
