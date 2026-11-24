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

- [x] **7A: sketching on storyboard shots** (`e02570a`, `564c58d`; CI pending) ([PHASE_7_PLAN.md](vault/PHASE_7_PLAN.md))
  - [x] migration 018 `drawings`, and SQL suite phase7a
  - [x] `src/lib/drawing` (format, thinning, size) and unit tests
  - [x] editor page (pen, eraser, undo, redo, clear, autosave, local draft, conflict copy)
  - [x] storyboard grid, touch reorder, Sketch button, thumbnails
  - [x] export PNG to Drive, and an imported background
  - [x] fixture support, browser spec, WebKit Vault login
  - [x] Download my data includes drawings; docs
- [ ] **7B: annotation** (base image, arrow, label, Annotate button, original unchanged, export)
- [ ] **7C: visual board** (owner asked to complete Phase 7; built without a new library if feasible)
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
- Next: 7B (Annotate buttons on images, mark and toggle, a file-removal message when an image has annotations).
