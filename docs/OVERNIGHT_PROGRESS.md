# Overnight progress (started 2026-11-24)

The owner's autonomous run ("master prompt", 2026-11-24). **If context is lost, re-read this file and resume from the first unchecked item.**

**Rules for this run:**
- Work only on the branch `vault-audit-and-planning-docs`. Pushing that branch runs CI and builds a Vercel preview.
- **Never:**
  - push or merge to `main`;
  - deploy to production;
  - change the live database;
  - rotate credentials;
  - pay for anything.
- 8 GB RAM, about 0.5 GB free at the start. Run heavy checks one at a time and locally only for the affected specs; rely on CI for the full browser suite.
- **Checkpoint:** tag `overnight-start-2026-11-24` = `bc2dc8a`. Roll back with `git reset --hard overnight-start-2026-11-24`, on this branch only.

## Checklist

- [x] **7A: sketching on storyboard shots** (`e02570a`, `564c58d`; CI green, run 45313627530) ([PHASE_7_PLAN.md](vault/PHASE_7_PLAN.md))
  - [x] migration 018 `drawings`, and SQL suite phase7a
  - [x] `src/lib/drawing` (format, thinning, size) and unit tests
  - [x] editor page (pen, eraser, undo, redo, clear, autosave, local draft, conflict copy)
  - [x] storyboard grid, touch reorder, Sketch button, thumbnails
  - [x] export PNG to Drive, and an imported background
  - [x] fixture support, browser spec, WebKit Vault login
  - [x] Download my data includes drawings; docs
- [x] **7B: annotation** (`94a11ba`): Annotate buttons, overlay with toggle, removal blocked while annotated, export as a new file
- [x] **7C: visual board** (`0261fa4`): migration 019, board page, Boards panel. No new library.
- [ ] **Other unfinished phases:**
  - 5B and 5C: assess. They depend on 5A being switched on with a real key.
  - Domain, Drive Production and CSP enforcement are owner-blocked.
- [ ] **Security audit:** SECURITY_AUDIT.md
- [ ] **Bug audit:** BUG_FIX_REPORT.md
- [ ] **Tests:** TEST_REPORT.md
- [ ] **Performance:** PERFORMANCE_REPORT.md
- [ ] **Final verification:** audit, lint, tsc, unit, SQL, browser (CI), build
- [ ] **FINAL_HANDOVER.md**

## Log

- 2026-11-24: checkpoint tag created; the tree was clean at `bc2dc8a`.
- 7A built and committed:
  - **SQL:** 12/12 suites, 408 checks (31 new). **Unit:** 219/219.
  - **Browser:**
    - sketch spec 7/7 in Chromium, and the 3 sketch tests 6/6 in WebKit (repeated twice);
    - a11y and contrast pass with the editor added;
    - vault and export specs pass.
  - **Bugs found and fixed while building:**
    - straight Pencil strokes lost their pressure shape when thinned;
    - the editor treated a missing `base_file_id` as an annotation;
    - the login form ignored text typed before the page finished loading (WebKit, slow devices).
- 7B built:
  - annotate spec 2/2 in Chromium and 1/1 in WebKit; the 27 affected Chromium specs pass; tsc and lint clean.
  - The WebKit export failure turned out to be the test's request blocking (WebKit routes blob: URLs). Fixed in the tests.
  - Export now loads images with onload instead of decode(). This is a precaution; I didn't confirm decode() actually fails in Safari.
- Next: 7C, the visual board (migration 019; boards, cards, links; drag with pen, finger or mouse; zoom buttons; list view). No new library.
- 7C built:
  - **SQL:** 13/13 suites (24 new board checks).
  - **Unit:** 223/223.
  - **Browser:** board spec 3/3 in Chromium and 2/2 in WebKit; a11y and all 5 contrast checks pass.
  - **Bugs found and fixed:**
    - a fast drag could land short, because the release used state from the last render;
    - a board title typed before the page finished loading was ignored;
    - the contrast check measured clipped text against pixels outside the clip.
- Next: decide on 5B and 5C (read PHASE_5_PLAN), then the security and bug audits, reports, and final verification.
