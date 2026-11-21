# Slice 4D plan: Journal (approved 2026-11-21 with all recommendations; built locally, not deployed)

## As built (2026-11-21, local only)

Built as planned, with these differences:

- **"Start from a Lab entry" lives in the entry editor**, not on the project's Lab tab. Once you choose a project, its Lab entries are listed with "Copy into this entry". It fills an empty title and appends the text. It is still a one-time copy into a private draft. The project workspace wasn't changed.
- **Two helper functions had to stay executable for signed-in users.** `journal_slug_ok` and `journal_images_ok` run inside `journal_entries`' check constraints, so revoking them made every draft write fail; the SQL suite caught it. They reveal nothing. `journal_text_ok` stays private.
- **The owner can read only status columns of `journal_published`** (entry id, slug, images, draft version, times). The text and project id are not readable even to the owner except through `journal_public()`.
- **The homepage root carries `data-journal="<count>"`.** The editor requests the homepage until the count matches, as 4B does with the publish time, and only then runs the public-file clean-up.
- **The suggested address and the 4C résumé file name now drop accents correctly.** "Résumé" gives "resume" instead of "re-sume"; the unit tests caught it.
- **The Journal pages use the projects frame with a Journal link.** Project pages are unchanged.

Files:
- **SQL:** `supabase/016_journal.sql`.
- **Library code:** `src/lib/journal.ts`, `src/lib/journal-public.ts`.
- **Public pages:** `src/app/journal/{layout,page,journal-view}.tsx`, `src/app/journal/[slug]/page.tsx`.
- **Routes:** `src/app/api/journal/{publish,unpublish}/route.ts`.
- **Vault:** `src/app/vault/portfolio/journal/{page,journal-list}.tsx`, `src/app/vault/portfolio/journal/[id]/{page,entry-editor}.tsx`, `.../[id]/preview/page.tsx`, `src/app/vault/portfolio/homepage-check.ts`.
- **Changed:** `page.tsx`, `home-view.tsx`, `projects/frame.tsx`, `public-files.ts` (clean-up counts journal images), the Portfolio page, and the profile editor's name suggestion.
- **Tests:** `tests/sql/phase4d-behaviour.sql`, `tests/journal.test.mjs`, `tests/browser/vault-journal.spec.ts`; fixture support in `tests/browser/api-fixture.mjs`; pinned rules updated in `tests/portfolio.test.mjs` and `tests/profile.test.mjs`.

**Deploy order:** apply 016 first. The homepage build calls `journal_public()`, so a deploy before 016 fails its build; the live site stays up.

**Rollback:**
1. Unpublish every entry.
2. Promote the previous deployment.
3. `revoke execute on function public.journal_public(text) from anon`.


Parent plan: [PHASE_4_PLAN.md](PHASE_4_PLAN.md). Builds on:
- 4A (showcases and their public snapshot, live).
- 4B (the static homepage refreshed by tag, live).
- 4C (the files library, public copies without metadata, live as `30de53c`).

Master prompt §1: "Journal: optional short, real engineering notes and lessons linked to their parent projects; unpublished by default. No generic AI-generated filler." Master prompt §3: Journal entries have "separate explicit publication controls and must never bypass project-publication rules or leak private records."

This is the last Portfolio Manager slice. After it, the remaining master-prompt phases are Gemini (5) and hardening and launch (6).

## Current behaviour (source, 2026-11-21)

- **No journal anywhere.** The homepage navigation leaves Journal out on purpose (`home-view.tsx`: "it stays hidden until a real entry is published"). `tests/portfolio.test.mjs` asserts there is no Journal link.
- **The Engineering Lab already has private entries.** `project_entries` holds notes, experiments, evidence, results, lessons and decisions per project. They are private, may contain unfinished thinking, and nothing reads them publicly.
- **Public projects:**
  - **Published showcases** (`/projects/<slug>`). Anon can read their slug and title, but not which private project they belong to.
  - **Three hand-written case studies** with fixed slugs.
- **Public files:** 4C copies files into `profile-files` and removes copies the published profile no longer uses. That clean-up only knows about the profile.

## Scope

1. **Journal in the Vault** (Vault → Portfolio → Journal): a list of your entries with their status (Draft, Published, Published with unpublished changes) and a "New entry" button.
2. **Entry editor:**
   - Title, a short summary, the body as plain-text paragraphs, a date, and up to 4 images from the 4C library, each with a required description.
   - An optional link to a project.
   - Save draft, preview, publish after confirming, unpublish. Entries start as drafts and stay private until you publish each one.
3. **Optional starting point: "Start from a Lab entry".** From a project's Lab, copy one of its notes, results or lessons into a new journal draft. It is a one-time copy you then edit; nothing is published or kept in sync automatically.
4. **Public pages:**
   - `/journal` lists published entries, newest first.
   - `/journal/<slug>` shows one entry.
   - A **Journal** link appears in the homepage navigation only while at least one entry is published.
5. **Project link rules:** an entry linked to a project shows "Part of <project title>" only while that project is public: a published showcase, or one of the three case studies. Otherwise the entry appears with no project name or link, so it never reveals a private project. If the project is later unpublished, the link disappears on the next request.

## Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-031 | Storage shape | Private `journal_entries` (owner-only drafts) and a public `journal_published` snapshot per entry, written only by security-definer `publish_journal_entry(id, draft_version)` and `unpublish_journal_entry(id)`, as in 4A. Visitors read through one public function that returns only public fields. The project link is resolved inside it, so anon never sees project ids. |
| V-032 | History and rollback | **No version history for entries.** Republishing replaces the public copy, and the list shows "Published with unpublished changes" when the draft differs. Rollback means unpublishing, or editing and republishing. Profile-style history adds a table and screens for short notes, and the master prompt says "where practical". |
| V-033 | Freshness | Like showcases: `/journal` and entry pages read the database on every request, so unpublishing takes effect immediately. The homepage stays static, and its Journal link is refreshed by tag from the publish and unpublish routes. A published entry can't be deleted until it is unpublished, so the link never points at an empty Journal. |
| V-034 | Linking to projects | Choose from your projects or the three case studies. Show the link only while the target is public (V-033's per-request read makes this immediate). Never show the name of a private project. |
| V-035 | Images | Reuse the 4C library and public copies (re-encoded, no metadata). The public-copy clean-up then counts files used by the profile **and** published journal entries before removing anything. |
| V-036 | Start from a Lab entry | Include it, as an explicit one-time copy into a new draft. Alternative: leave it out and type entries from scratch. |
| V-037 | Addresses | `/journal/<slug>`, slug chosen in the editor (lowercase words and dashes, kept stable once published). Changing the slug of a published entry is refused; unpublish first. |

## Limits (proposed)

Title up to 120 characters; summary up to 300; body up to 20 paragraphs and 12,000 characters; date as text up to 40 (for example "March 2026"); up to 4 images. Plain text only: no HTML, no Markdown rendering; links in the body appear as plain text.

## Files (expected)

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/016_journal.sql`: `journal_entries` (owner RLS, version trigger, refuses deleting a published entry), `journal_published`, `publish_journal_entry` / `unpublish_journal_entry` (security definer, site owner only), `journal_public()` read function (anon execute), content checks. Also widens the 015 delete trigger so a library file used by a journal draft or published entry can't be deleted. |
| New | `src/lib/journal.ts` (types, validation, slug rules), `src/lib/journal-public.ts`, `src/app/journal/{page,[slug]/page,journal-view}.tsx`, `src/app/api/journal/{publish,unpublish}/route.ts`, `src/app/vault/portfolio/journal/{page,journal-list}.tsx`, `src/app/vault/portfolio/journal/[id]/{page,entry-editor}.tsx`, `.../[id]/preview/page.tsx` |
| Changed | `src/lib/public-files.ts` (copies for entries; clean-up counts journal use), `src/app/portfolio/home-view.tsx` and `src/app/page.tsx` (Journal link when entries exist), `src/app/vault/portfolio/page.tsx` (Journal entry), the Lab entry list in the project workspace ("Start a journal entry"), `tests/portfolio.test.mjs` (a Journal link only when an entry is published) |
| Tests | `tests/sql/phase4d-behaviour.sql`, `tests/journal.test.mjs`, `tests/browser/journal.spec.ts`; earlier SQL suites and the full browser suite re-run |

## Risks

- **Leaking a private project.** The public function returns a project's slug and title only when that project is public right now. Tests cover private, ready-but-unpublished, archived, moved-out-of-Completed and unpublished projects.
- **Private Lab text reaching the public.** Only through the explicit copy, into a draft you edit and then publish yourself. Nothing reads `project_entries` publicly.
- **A stale Journal link on the homepage.** Publish and unpublish go through the server, which refreshes the homepage tag. Deleting a published entry is refused. Tested, including a failed refresh, which keeps the last good homepage as in 4B.
- **Removing an image still in use.** Clean-up counts every published use (profile and journal). Tests publish the same library image in the profile and in an entry, take it off one, and check the other still shows it.
- **Empty or thin journal.** Hidden entirely until you publish something. Nothing is generated or filled in for you.

## Acceptance tests

Mapped to master prompt §6:
1. Before any publish: no Journal link, `/journal` shows "not found" (soft 404 with `noindex`, as for unknown projects), and the homepage is unchanged (1, 10).
2. Create, save, preview, then publish. `/journal` and the entry page show exactly the preview's text, and the homepage gains the Journal link (7, 8).
3. Unpublish: the entry page is gone on the next request, and with no entries left the Journal link goes too (6).
4. An entry linked to a private project shows no project name or link. After you publish that project's showcase, the link appears; after you unpublish it, the link goes again (3, 4, 5).
5. Anon can't read drafts, the private tables, project ids, or the editor, preview or API routes (any method, other accounts, other sites) (1, 2).
6. Images are public copies without metadata. A file used by a published entry can't be deleted, and clean-up keeps files the profile or another entry still uses.
7. HTML and unsafe slugs are refused, and nothing is invented: empty fields stay hidden (9).
8. Layout at 320–1280 px, reduced motion respected (10).
9. 016 applies twice in a disposable Postgres; every earlier suite, tsc, ESLint, unit and browser tests and the build pass (11).

## Go-live and rollback

- **Deploy order:** apply 016 first. It is additive apart from the widened delete trigger, and the 4C app keeps working with it. Then deploy.
- **Rollback:**
  1. Unpublish every entry; this empties `journal_published` and removes the Journal link.
  2. Promote the previous deployment.
  3. `revoke execute on function public.journal_public() from anon`.

  Drafts can stay; nothing private is moved or deleted.

## Not in 4D

A "Currently Building" teaser (needs its own approval of exact text), comments, RSS, tags or search on the Journal, scheduled publishing, Markdown, and Gemini. Moving the three hand-written case studies into the database also stays out.

## Content you'd supply

The entries themselves: real notes and lessons from your projects. Nothing will be written for you; the Journal stays hidden until you publish one.
