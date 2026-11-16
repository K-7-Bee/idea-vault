# Phase 1, slices 1A + 1B: Vault navigation, idea detail pages, archive

Owner go-ahead: "Start Phase 1" (2026-11-16), covering the new Vault layout, idea detail pages and archiving. Slice 1C (projects and search) is not started and needs its own go-ahead. Production SQL and deployment are owner-gated and **not done**.

## Scope

- **1A, navigation:** the sidebar and top bar now link to real routes (Dashboard `/vault`, Ideas `/vault#ideas`, Archive `/vault/archive`) and highlight the current one. Every Vault page shares one shell (`vault-shell.tsx`). The capture, outbox, recording, tag, status, search, file and recovery flows are unchanged.
- **1B, idea detail:** `/vault/ideas/[id]` shows the title, text, stage, tags, attachments (image/audio preview), capture time, last-edited time and the original capture when the text has changed since. You can edit the title, text and stage there. List cards show titles and gain a **Details** link.
- **1B, archive:** Archive and Restore actions on the detail page. Archived ideas are hidden from the list, search and dashboard counts, and are listed at `/vault/archive`. Nothing is deleted, including attachments. Permanent deletion stays where it was (list card → Delete, with device recovery).

Not included: deleting from the detail page, offline edits on the detail page (it says it is offline and disables changes), and archive pagination beyond the 200 most recent (the page says so when it truncates).

## Files

| Kind | Files |
| --- | --- |
| SQL (new, additive) | `supabase/004_idea_details.sql` |
| New | `src/lib/idea-detail.ts`, `src/lib/vault-owner.ts`, `src/app/vault/{nav-links,vault-shell,session-boundary}.tsx`, `src/app/vault/ideas/[id]/{page,idea-view,not-found}.tsx`, `src/app/vault/archive/page.tsx` |
| Changed | `src/lib/ideas.ts` (title + detail columns), `src/app/vault/page.tsx` (shell; active-only reads), `src/app/vault/capture.tsx` (active-only search, title display, Details link), `src/app/vault/sidebar.tsx` (route nav) |
| Tests | `tests/idea-detail.test.mjs` (new), `tests/vault.test.mjs`, `tests/browser/{vault.spec.ts,api-fixture.mjs}` |

## Migration 004

Adds four nullable columns: `title` (1–200 characters), `original_content`, `updated_at` and `archived_at`. It also adds a trigger and two partial indexes. The trigger makes the database own these values. `original_content` is copied from `content` on insert and never changes afterwards. `updated_at` moves only when the title, text, stage or tags change. `archived_at` uses server time. Values sent by a browser for these columns are ignored. Existing rows keep empty `original_content`/`updated_at` rather than invented values; the live Vault is currently empty anyway. RLS policies are unchanged and cover the new columns.

## Verification actually performed

- **Migration:** ran in a disposable `supabase/postgres:17.11.0.018` container (no network) on top of `schema.sql` + `002_tags.sql`. Applying it twice succeeded. Legacy row id/content/created_at were untouched. Forged `original_content`/`updated_at`/`archived_at` on insert were replaced. The original capture survived an edit. Archive and restore worked, and an empty title was rejected. As `authenticated`, a second user saw and updated 0 rows, while the owner could set the title and archive. The container was then removed. The separate recovery database container was not touched.
- **Unit tests:** `npm test` → 81 passed (7 new: conditional writes, title normalisation, conflict/failure handling without leaking backend text, archive/restore preconditions, detail-page owner checks, not-found, identity rejection). Page tests now assert that both `/vault` reads exclude archived ideas.
- **Browser tests:** `npm run test:browser` → 13 passed against the synthetic fixture (5 new):
  - edit on the detail page, including the original capture and a stale-save conflict that keeps the edit buffer
  - archive hides the idea without deleting rows, files or bytes, and restore brings it back
  - other account denied, unknown IDs not found, logout locks the detail view
  - in-app links back to the list show fresh data
  - phone widths of 320 and 390 px have no horizontal scroll
- **Other checks:** `tsc --noEmit` and ESLint clean. The browser suite performs a production `next build`.

Not verified: live Supabase, real devices and deployment. The fixture is not PostgreSQL; it imitates the trigger.

## Deploy order (owner action)

1. Run `supabase/004_idea_details.sql` in Supabase → SQL Editor. It is safe to re-run.
2. Then deploy the app. Deploying first would make `/vault` show "Unable to load your ideas" until the SQL runs. That is a loud failure, but no data is lost.

## Rollback

Redeploy the previous app version. Leave the columns, trigger and indexes in place: older app versions ignore them, and archived ideas simply reappear in their lists. Do not drop the columns, which would lose titles, archive state and original captures.

## Risks

- Older cached app versions on a device do not filter archived ideas. They show them in the list, but cannot lose them.
- Detail-page edits are online-only and are separate from the list's inline editor. Both use conditional writes, so neither silently overwrites the other.
