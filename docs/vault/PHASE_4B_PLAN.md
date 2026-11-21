# Slice 4B plan: Portfolio Manager — profile (approved 2026-11-21 with all recommendations; live 2026-11-21 as 360ff75)

## As built (2026-11-21, local only)

Built as planned, with these differences:

- **Site owner (new).** The database had no record of which account owns the site; the email allowlist lives only in the web server. `014` adds `site_owner` and fills it when exactly one Auth account exists (production has one). Only that account can call `publish_profile`. If there were several accounts, nobody could publish until an administrator inserts the row.
- **Refresh uses `'max'`, not `{ expire: 0 }` (V-020 changed).** A browser test made the database unreadable during the rebuild. With `{ expire: 0 }`, Next served the **build-time page**, which before a redeploy is the seed. That is exactly what V-021 forbids. With `'max'` the last good page stays, and the page catches up once the database answers.
  - `revalidateTag` in a route handler only applies after the response is sent, so the route can't confirm the page itself. Instead the route returns the publish time. The editor then requests `/` (up to 8 times over about 4 seconds) until the page's `data-published` attribute matches.
  - That first request takes the one stale view and starts the rebuild. The editor says "shows it now" only when it has confirmed this; otherwise "within a minute".
  - `published_at` is already public, so the attribute reveals nothing new.
- **No `restore_profile_version` function.** "Restore to draft" copies the old version's content into the draft through the normal owner-only, version-checked draft save. History stays append-only because nobody but `publish_profile` can write it.
- **Draft trigger.** `profile_drafts` has its own touch trigger. The shared `vault_touch_row` pins `project_id`, which this table lacks; the SQL suite caught that every update failed.
- **Certificates sit under Current focus**, in the Experience section; both are hidden while empty. Timeline extras ("What I did", "What I learned", tools) show only when filled in.
- **Unchanged:** page metadata (title and description) stays in code, and the hero picture, project cards and footer link are not editable.

Files: `supabase/014_profile.sql`; `src/lib/profile.ts`, `src/lib/profile-public.ts`; `src/app/portfolio/home-view.tsx`; `src/app/page.tsx` (now 20 lines); `src/app/api/profile/publish/route.ts`; `src/app/vault/portfolio/profile/{page,profile-editor}.tsx`, `profile/preview/page.tsx`; `src/app/vault/portfolio/page.tsx` (Profile entry); tests `tests/profile.test.mjs`, `tests/sql/phase4b-behaviour.sql`, `tests/browser/profile.spec.ts`, fixture support in `tests/browser/api-fixture.mjs`, `tests/portfolio.test.mjs` pointed at the moved markup.

**Deploy order:** apply 014 **first**. The homepage now reads `profile_published` at build time, so a deploy before 014 fails its build (the live site stays up). **Rollback:** promote the previous deployment, then `revoke select on public.profile_published from anon`. The tables can stay.


Parent plan: [PHASE_4_PLAN.md](PHASE_4_PLAN.md). Builds on 4A (live 2026-11-21): the `showcases` snapshot, security-definer publish functions, the Portfolio page and preview. Master prompt §3: edit Home, About, Education, Experience, Certificates, Social Links and Contact inside the Vault, with draft, preview, publish, history and rollback, and no source-code edits.

## Current behaviour (source, 2026-11-21)

- Every public profile fact is a constant in `src/app/page.tsx`: `NAME`, `EMAIL` (split so the address never appears whole), `NAV`, `LINKS`, `HIGHLIGHTS`, `TIMELINE`, `FOCUS`, plus hero and About text written inline in the JSX.
- `/` is fully static. Only `/projects/[slug]` reads the database at request time.
- `tests/portfolio.test.mjs` pins parts of this source: no Journal link, no résumé link, no whole email address.
- Internship roles, dates, tools and responsibilities have never been supplied. The timeline shows only the organization and year.

## Scope

1. **Profile editor** at `/vault/portfolio/profile`, linked from the Portfolio page. Sections:
   - **Hero:** eyebrow, headline, introduction.
   - **Highlights:** up to 4, each with an icon chosen from the existing set, a title and a detail.
   - **About:** heading and up to 4 paragraphs.
   - **Timeline:** education, experience and award entries. Each has a kind, date text, title, organization and place. Experience and education entries can also have optional role, tools, responsibilities (list) and learning outcomes. Entries can be reordered.
   - **Certificates:** name, issuer, date text, optional https link. Hidden while empty.
   - **Current focus:** up to 6 items.
   - **Links:** label plus https URL, reorderable.
   - **Contact:** heading, short text, email address. It is stored as a whole address but always rendered split, as it is today.
2. **Draft, preview, publish.** One private draft with a version number. Save keeps the draft. Preview renders the real homepage component from the draft, behind the owner check. Publish asks for confirmation, names the sections that changed, and publishes exactly the confirmed draft version. As in 4A, a draft edited in another tab is refused rather than published unseen.
3. **History and rollback.** Each publish keeps a copy in history: version, time and content. **Restore to draft** copies an old version into the draft, and the owner then publishes it normally. Nothing in history is ever edited.
4. **Public homepage reads the published profile.** Before the first publish, and when nothing has been published, the homepage renders a code seed that matches today's text exactly. So day one looks identical and no deploy step depends on the database.
5. **Empty sections stay hidden.** An entry without responsibilities shows exactly as it does today. Nothing is filled with placeholders.

## Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-019 | Storage shape | A private `profile_drafts` table (one row per owner: content as jsonb, plus a version), a public `profile_published` table (one row: content, version, published_at) and a private `profile_versions` table for history. Writes only through `publish_profile(expected_version)`, which is security definer and checks `auth.uid()`, as in 4A. Anonymous visitors may `SELECT` `content` and `published_at` on `profile_published` only. |
| V-020 | How fresh is the homepage | Keep `/` in the static shell (`'use cache'`, `cacheTag('profile')`, `cacheLife('max')`). The publish route calls `revalidateTag('profile', { expire: 0 })`, so the next request rebuilds it. Unlike 4A, every profile change goes through the server, so a request-time read isn't needed and the homepage stays as fast as today. |
| V-021 | What if the database can't be read | **At build:** fail the build, so the previous deployment stays live. **At revalidation:** keep serving the last good page and log the failure. Never fall back to the seed after a profile has been published, because that could bring back text the owner removed. Whether Next keeps the stale entry when a cached function throws must be verified in a production build before go-live. |
| V-022 | Validation | Plain text only, rendered as text and never as HTML. Length caps per field. Links must be `https:`; `mailto:` is allowed only via the Contact email field. No images in 4B; photos come with the 4C media picker. |
| V-023 | Email exposure | The address becomes readable through the public Supabase API as well as on the page. It is already public on the page, so the risk is mainly scraping. Accept it, or keep the contact email in code and make only the other sections editable. Recommendation: accept, and keep rendering it split. |
| V-024 | The three hard-coded case studies and "Selected work" | Unchanged in 4B (V-016 stands). Selected work keeps listing them. Showing published showcases on the homepage is a separate small change for later. |

## Files (expected)

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/014_profile.sql`: the three tables, RLS, `publish_profile`, `restore_profile_version`, and anon column grant on `profile_published` only |
| New | `src/lib/profile.ts` (types, validation, whitelist, diff by section), `src/lib/profile-seed.ts` (today's text, moved from `page.tsx`), `src/lib/profile-public.ts` (cached anonymous read), `src/app/portfolio/home-view.tsx` (the homepage as a component taking content), `src/app/api/profile/publish/route.ts`, `src/app/vault/portfolio/profile/{page,profile-editor}.tsx`, `src/app/vault/portfolio/profile/preview/page.tsx` |
| Changed | `src/app/page.tsx` (reads the published profile and renders `home-view`), `src/app/vault/portfolio/page.tsx` (Profile entry with draft/published status), `tests/portfolio.test.mjs` (the same rules, checked against the seed and the view) |
| Tests | `tests/sql/phase4b-behaviour.sql`, `tests/profile.test.mjs`, `tests/browser/profile.spec.ts`; 4A, 3A–3D and grant SQL suites re-run after 014 |

## Risks

- **Homepage regression:** the visible page must not change on day one. Mitigation: the seed is moved, not rewritten, and a test compares the rendered text of `/` before and after the refactor.
- **Stale or missing homepage after publish:** see V-020 and V-021. Tested in a production build: publish, then the next request shows the change; database unreachable, then the last good page is still served.
- **Private drafts leaking:** anon gets one column pair on one table. Tests assert anon can't read drafts, history, or `user_id`.
- **Unsafe content:** `javascript:` and `data:` links, HTML and over-long text are refused by both the route and the database function.
- **Losing work:** a stale draft is refused rather than overwritten, history is append-only, and restore only writes into the draft.

## Acceptance tests

Mapped to master prompt §6:
1. Before any publish, `/` text matches today's page (10, 11).
2. Edit → save → preview → publish; the next request to `/` shows exactly the preview's content (7, 8).
3. Restore an earlier version, then publish; `/` returns to it, and history keeps every version (8).
4. Anonymous requests can't read drafts, history, `user_id`, or the preview and publish routes (anonymous, other-account and cross-origin) (1, 2).
5. Empty sections and empty optional fields are hidden; nothing invented appears (9).
6. Unsafe links and HTML are refused; the email address never appears whole in HTML.
7. `/` stays prerendered in `next build` output; layout works at 320–1280 px with reduced motion respected (10).
8. 014 applies twice in a disposable Postgres; earlier suites still pass; tsc, ESLint, unit tests, browser tests and build all pass (11).

## Go-live and rollback

- **Deploy order:** apply 014 first (additive; no existing table changes), then deploy. With no published profile, the deployed homepage renders the seed, identical to today.
- **Rollback:** redeploy the previous build; the homepage returns to its constants. Then `revoke select on public.profile_published from anon`. The tables can stay; nothing private is moved or deleted.

## Not in 4B

Journal, résumé upload and the media picker (4C), photos on the profile, moving the three case studies, a "Currently Building" teaser, separate About/Experience pages (navigation stays anchors on one page), and Gemini.

## Content you can supply (optional for go-live)

Internship roles, exact dates, tools, responsibilities and learning outcomes; certificate name, issuer and date; any links to add or remove. You enter these in the editor after go-live. Nothing will be invented, and empty fields stay hidden.

## Known gaps carried forward (not part of 4B unless you say so)

- The Phase 2 SQL suite stops on a missing seed idea (test-only gap, recorded at 4A).
- 4A removal by stage change, archive or delete is covered by tests but not yet exercised live.
- The Google app is in Testing mode, so Drive refresh tokens expire every 7 days. Publishing the consent screen to Production would remove that.
