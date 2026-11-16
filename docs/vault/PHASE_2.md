# Phase 2: projects, Engineering Lab, Story Studio (2A + 2B + 2C)

Owner decisions (2026-11-17, in conversation):
- Migrate the stored idea stages to Exploring → Analyzing → Building → Completed (not just relabel them).
- Build slices 2A, 2B and 2C together.

Production SQL, commit and deployment are owner-gated and **not done**.

## Scope

- **Stage migration:** ideas move `raw → exploring`, `exploring → analyzing`, `building → building` and `done → completed`. New ideas default to `exploring`. Labels, colours and dashboard cards follow the new names. The public Idea Vault case study text was updated to name the new stages.
- **2A, projects:**
  - Project Library (`/vault/projects`).
  - Create a project as Engineering, Story or Hybrid.
  - Turn an idea into a project from the idea page. The idea is left unchanged, and converting it again opens the same project.
  - Overview: title, type, stage, summary and goals.
  - **Showcase** status (Private / Ready to showcase), kept independent of stage.
  - Archive and restore, a link back to the source idea, record counts, and Resume project (next action).
  - Navigation now links to Projects, Engineering Lab and Story Studio.
- **2B, Engineering Lab** (`/vault/lab`; tabs on engineering and hybrid projects):
  - Task board (To do / Doing / Done) with milestones.
  - Lab notebook: technical notes, experiments, test evidence, results, lessons and decisions, each with an optional evidence link.
  - Components list (quantity, unit, status, datasheet link; no prices).
  - Code and repository links.
  - No simulations.
- **2C, Story Studio** (`/vault/story`; tabs on story and hybrid projects):
  - Story Bible (premise, world, rules, tone, themes).
  - Character Bible and character relationships.
  - Optional Season → Episode → Scene → Shot structure. Levels can be skipped, and shots appear as panels inside their scene.
  - Timeline and continuity records, which reference the exact scene/shot (for example `Season: S1 › Scene: Market › Shot: Close-up`) and the character.
  - References (links).

**Not included:**
- Images in the Story Library and shot panels (they need Google Drive, Phase 3).
- Drag-and-drop: ordering uses ↑/↓ and column buttons, which are keyboard-accessible.
- Portfolio Manager and public publishing. "Published" exists in the database, but nothing can set it and the public site doesn't read projects.
- Gemini, Drive, offline editing of projects (online-only, says so when offline), full-text search over projects, and 3D tools.

## Files

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/005_idea_stages.sql`, `supabase/006_projects.sql`, `supabase/007_story.sql` |
| New app code | `src/lib/workspace.ts`, `src/app/vault/use-vault-writer.tsx`, `src/app/vault/projects/{page,project-list,new-project-form}.tsx`, `src/app/vault/projects/[id]/{page,not-found,project-workspace,record-section}.tsx`, `src/app/vault/lab/page.tsx`, `src/app/vault/story/page.tsx`, `src/app/vault/ideas/[id]/convert-to-project.tsx` |
| Changed (stage rename) | `src/lib/ideas.ts`, `src/app/vault/status.ts`, `src/app/globals.css`, `src/app/vault/capture.tsx`, `src/app/vault/dashboard.tsx`, `src/lib/vault-stats.ts`, `src/lib/recovery-operations.ts`, `src/app/vault/ideas/[id]/idea-view.tsx`, `src/lib/projects.ts` (public case study wording) |
| Changed (navigation) | `src/app/vault/nav-links.tsx`, `src/app/vault/sidebar.tsx` (mobile links wrap onto their own row) |
| Tests | `tests/sql/phase2-behaviour.sql` (new), `tests/workspace.test.mjs` (new), `tests/browser/projects.spec.ts` (new), `tests/browser/api-fixture.mjs`, `tests/vault.test.mjs` |

## Database design

- **Owner only:**
  - Every new table has row level security for `authenticated`, where `user_id = auth.uid()`, and anonymous access is revoked.
  - Child records use a composite foreign key `(project_id, user_id) → projects(id, user_id)`, so a record can't be attached to another account's project, even with a forged `user_id`.
  - Cross-references use `(project_id, x_id)`, for example a task's milestone or a continuity record's shot, so they can't point into a different project.
- **Server-owned fields:** a trigger sets `id`, `user_id`, `created_at`, `updated_at` and `version` (`version` increases by 1 per update). Records can't move to another project. A project's source-idea link can be cleared but not repointed. `archived_at` uses server time.
- **Stale writes:** every update and delete in the app is filtered by `version`. A write from a stale tab or device changes nothing, keeps the edit on screen and says so.
- **One project per idea:** a partial unique index on `source_idea_id`. If the idea is deleted, the project remains and only loses the link.
- **Story structure:**
  - A trigger enforces that a unit can only sit inside a higher level.
  - A unit that still contains others cannot be deleted (`RESTRICT`).
  - Deleting a shot or scene keeps timeline and continuity records and clears only their link.
  - Deleting a character removes its relationships and clears the character link on continuity records.
  - Deleting a milestone keeps its tasks.
- **Stage migration safety:**
  - It runs in one transaction and is idempotent. The rename only runs while the new constraint is absent, so a second run can't shift `exploring` again.
  - Edit timestamps are not touched.
  - A `before insert/update` trigger translates the unambiguous legacy values `raw` → `exploring` and `done` → `completed` from old tabs or device recovery records.

## Verification actually performed

- **SQL:** ran in a disposable `supabase/postgres:17.11.0.018` container (no network) on top of `schema.sql`, `002_tags.sql` and `004_idea_details.sql`. `003_files.sql` needs Supabase Storage, which that image lacks; Phase 2 doesn't depend on it.
  - Each migration ran twice successfully.
  - Legacy rows `raw/exploring/building/done` became `exploring/analyzing/building/completed`, with `updated_at` unchanged.
  - `tests/sql/phase2-behaviour.sql`: 28 checks passed, as `authenticated` with JWT claims and as `anon`. They cover:
    - translation of legacy values
    - server-owned fields
    - duplicate conversion refused
    - bad type, publication value and link refused
    - deleting a milestone keeps its tasks
    - a record cannot move to another project
    - server time used for archiving
    - level rules and delete restriction
    - deletes that keep continuity and timeline records
    - another account reads, updates and deletes 0 rows, and cannot insert into the owner's project or link to the owner's idea
    - anonymous access refused
    - deleting the source idea keeps the project
  - The container was removed. The recovery container was not touched.
- **Unit tests:** `npm test` gave 95 passed, 0 failed (14 new in `tests/workspace.test.mjs`; the stats test was updated for the new stage values).
- **Browser tests:** `npx playwright test` gave 20 passed, 0 failed (6 new), against the synthetic fixture with a production build. The new tests cover:
  - converting an idea twice gives one project, with the idea unchanged
  - the full engineering workflow, including a stale-edit conflict that keeps the edit buffer and a milestone delete that keeps its tasks
  - the full story workflow: blocked scene delete, the exact shot reference, and a shot delete that keeps the continuity record
  - showcase is limited to Private / Ready, archive deletes nothing, and the public `/projects` page doesn't show the project
  - denial to anonymous visitors and other accounts, not-found pages, and the logout lock
  - 320 and 390 px widths without horizontal scroll
- **Other checks:** `tsc --noEmit` and ESLint are clean, and `npm run build` succeeds (new routes are partially prerendered, `◐`).
- **Visual check:** screenshots of the task board, the structure panels and the 390 px overview were inspected.
- **Accessibility fix found in testing:** the Showcase hint had been part of the select's accessible name.
- **Fixture fix:** it now allows the `content-profile` CORS header that supabase-js sends.

Not verified: live Supabase, real devices or screen readers, and deployment. The fixture is not PostgreSQL; the database rules were checked in the container, not in production.

## Deploy order (owner action)

1. Read-only pre-check on production: `select version();` must be PostgreSQL 15 or later (column lists in `ON DELETE SET NULL (…)` need it). Also confirm `public.ideas` has no `ideas_stage_check` yet and record the current stage counts.
2. Run `005_idea_stages.sql`, then `006_projects.sql`, then `007_story.sql`. Each is one transaction and safe to re-run.
3. Read-only post-check: stage counts moved as expected, 12 new tables exist with RLS enabled, and there are 4 policies per table.
4. Deploy the app right after step 2. Until then, the live app (old code) still offers the old stage names. Picking "raw" or "done" is translated correctly, but picking the old "exploring" (which meant stage 2) would be stored as the new stage 1.

If the app were deployed first, it would write values the old constraint rejects: a visible error, with no data lost.

## Rollback

- **App:** promote the previous production deployment (`dpl_HAVypGFPykzZcrGusL3wVYMQ6BoQ`).
  - Leave all new tables in place: the old app ignores them.
  - The old app shows the new stage values with their raw names and can't set the old values on migrated rows. Its own conditional writes fail safely rather than overwrite anything.
- **Stage values:** a reverse mapping is possible (`exploring → raw`, `analyzing → exploring`, `completed → done` plus the old constraint), but only as a separate, reviewed migration. Ideas created after the migration can't be told apart from migrated ones.
- Do not drop the project or story tables. That would delete owner data.

## Risks and limitations

- A device recovery record captured before the migration with the old `exploring` (stage 2) restores as the new `exploring` (stage 1). The live Vault was reset on 2026-11-16 and has had little use since, so exposure is small.
- Reordering swaps two rows with two version-checked writes. If the second write fails, the page says the move was only partly saved and asks for a reload.
- Each record type loads up to 1000 items per project. The page says so if a list is cut off.
- Projects aren't in the dashboard counts or search yet.
