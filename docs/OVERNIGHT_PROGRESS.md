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

- [ ] **7A: sketching on storyboard shots** ([PHASE_7_PLAN.md](vault/PHASE_7_PLAN.md))
  - [ ] migration 018 `drawings`, and SQL suite phase7a
  - [ ] `src/lib/drawing` (format, thinning, size) and unit tests
  - [ ] editor page (pen, eraser, undo, redo, clear, autosave, local draft, conflict copy)
  - [ ] storyboard grid, touch reorder, Sketch button, thumbnails
  - [ ] export PNG to Drive, and an imported background
  - [ ] fixture support, browser spec, WebKit Vault login
  - [ ] Download my data includes drawings; docs
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
