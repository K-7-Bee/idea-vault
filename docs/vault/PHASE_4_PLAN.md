# Phase 4 plan: Portfolio publishing (4A live 2026-11-21; 4B live 2026-11-21, see [PHASE_4B_PLAN.md](PHASE_4B_PLAN.md); 4C live 2026-11-21, see [PHASE_4C_PLAN.md](PHASE_4C_PLAN.md); 4D approved 2026-11-21, see [PHASE_4D_PLAN.md](PHASE_4D_PLAN.md))

## 4A as built (2026-11-21, local only)

Owner approved 4A with all recommendations (V-014 to V-018 in [DECISIONS.md](DECISIONS.md)). Built as planned, with these differences:

- **Functions are security definer, not invoker.** Nobody, including the owner, can write `showcases` directly; only `publish_showcase`/`unpublish_showcase` can, and they check `auth.uid()` themselves. This is stricter than the plan.
- **No check constraint on `publication_status`.** A constraint would make leaving Completed fail. Instead a trigger refuses `published` unless a snapshot exists, and moves a project that leaves Completed or is archived back to `ready`. A second trigger then drops its snapshot.
- **Publishing uses the exact saved draft version.** The owner confirms that version, so a draft edited in another tab is refused rather than published unseen.
- **"Soft 404".** With Cache Components, a page read at request time always starts with HTTP 200. An unpublished address shows the not-found page with `noindex` and none of the project's text. A true 404 status would need a database check in the request proxy; that wasn't built.
- **Leftover image copies are cleaned automatically, not by a Settings button.** This runs when the Portfolio page opens and after an editor save takes a project off the site. Copies younger than 5 minutes are kept, in case a publish is still in progress elsewhere. Until then, a removed image stays reachable only to someone who already has its exact random URL. Visitors' browsers and the CDN may keep an image for up to 60 seconds.
- **Owner id in image paths.** Public image URLs contain the owner's Supabase user id (an opaque UUID), because Storage policies key on the folder name.

Files:
- **SQL:** `supabase/013_showcases.sql`.
- **Library:** `src/lib/showcase.ts`, `showcase-public.ts`, `showcase-images.ts`.
- **API routes:** `src/app/api/showcase/{publish,unpublish,cleanup}/route.ts`.
- **Public pages:** `src/app/projects/{frame,showcase-view}.tsx`, `projects/page.tsx`, `projects/[slug]/page.tsx`. The projects layout now uses the shared frame, with identical markup.
- **Vault:** `src/app/vault/portfolio/{page,orphan-cleanup}.tsx`, `portfolio/preview/[id]/page.tsx`, `src/app/vault/projects/[id]/showcase-editor.tsx`; changes to `page.tsx`, `project-workspace.tsx`, `nav-links.tsx` and `src/lib/workspace.ts`.
- **Tests:** `tests/sql/phase4a-behaviour.sql`, `tests/showcase.test.mjs`, `tests/browser/showcase.spec.ts`, with fixture support in `tests/browser/api-fixture.mjs`.

**Deploy order:** apply 013 first, because the project page now reads `project_showcases` and `showcases`; then deploy.

**Rollback:** unpublish every showcase (this empties the snapshot table and bucket), then redeploy the previous build. After that, run `revoke select on public.showcases from anon`. Drafts can stay.

## Original proposal

Drafted 2026-11-21. Phases 1–3 are live: projects, Engineering Lab, Story Studio and Google Drive files (3A–3D). The final master prompt still lists two pieces that don't exist yet: the **project publishing bridge** (its Phase D) and the **Portfolio Manager** (its Phase C). Gemini (Phase 5) and release hardening (Phase 6) come after this.

## Where things stand (from source, 2026-11-21)

- `projects.publication_status` exists (`private` / `ready` / `published`), and `isPubliclyVisible()` in `src/lib/workspace.ts` already encodes "completed AND published AND not archived". Nothing can set `published`, and the public site doesn't read the database.
- The public portfolio is hard-coded: the three case studies live in `src/lib/projects.ts`, and the homepage text in `src/app/page.tsx`. `/projects/[slug]` is static (`generateStaticParams`).
- Project edits go **from the browser straight to Supabase** (`src/lib/workspace.ts`, row security). The server never sees a stage change, so it can't rely on calling `revalidateTag` to hide a project.
- No table is readable by anonymous visitors (migration 010 revoked every `anon` grant). Phase 4 adds the first public data, so it carries the most privacy risk of any phase so far.
- Project images live in the owner's private Drive under `drive.file`, and the Google app is in Testing mode, so refresh tokens expire after 7 days.
- `next.config` has `cacheComponents: true`. In this Next version, `revalidateTag(tag, "max")` serves stale content once; only `{ expire: 0 }` or `updateTag` removes data immediately.

## Recommended order

| Slice | What you get | Why this order |
| --- | --- | --- |
| **4A Publish projects** | Ready to Showcase queue, showcase editor, preview, publish/unpublish, public `/projects` lists published projects next to the three existing case studies | Uses data you already have; proves the public-snapshot and privacy model on one entity before it's reused |
| **4B Portfolio Manager: profile** | Edit Home, About, Education, Experience, Certificates, Social links and Contact in the Vault, with draft, preview, publish, history and rollback. Seeded from today's published text, so the public site looks identical on day one | Reuses the snapshot/publish machinery from 4A |
| **4C Journal, résumé, media** | Journal entries linked to projects (unpublished by default), résumé upload/download, a media picker that reuses already-published images | Smallest value until 4A/4B exist; Journal stays hidden while empty |

Each slice gets its own approval, migration, tests and go-live, as in Phase 3. **I'm asking for approval of 4A only**, plus the decisions below. 4B and 4C will be re-presented with exact files before any code.

## Decisions needed (4A)

| ID | Question | Recommendation |
| --- | --- | --- |
| V-014 | How do public pages read published content, given that the app has no Supabase service key? | A separate `showcases` table holding only the approved fields. Anonymous visitors get `SELECT` on that table only, through a policy that requires `published_at is not null`. Private tables stay anon-denied. Alternative: a security-definer function. That's harder to test and easier to widen by accident. |
| V-015 | Where do public images come from? | **Copy** the chosen images into a new public Supabase Storage bucket `showcase` when you publish, and delete them when you unpublish. Serving them from Drive would tie the public site to your Drive token, which expires every 7 days in Testing mode, and would route visitor traffic through your Google account. Images are capped (proposed 5 MB each, 8 per project; WebP/JPEG/PNG only). Drive originals are never shared or changed. |
| V-016 | What about the three hard-coded case studies? | Leave them exactly as they are in 4A. Published database projects are listed alongside them. 4B can offer to move them into the database later. |
| V-017 | How fast must unpublishing take effect? | Immediately. Public project pages read the database on each request (no Next data cache). Database triggers delete the snapshot when the project leaves Completed, stops being Published, or is archived or deleted. So it works even though stage edits bypass the server. Cost: about 0.05–0.1 s per public project page from Seoul. The homepage stays static. |
| V-018 | Public URL | `/projects/<slug>`, where the slug is chosen in the showcase editor and kept stable. A slug can't reuse one of the three existing slugs. |

## 4A design

**Showcase draft (private)**
- New table `project_showcases`, owner-only, one per project: slug, public title, summary, cover image, selected images, allowed sections (problem, objective, approach, tools, implementation, results, limitations, lessons), and approved links.
- Text is typed or copied in the editor. Nothing is pulled from private notes automatically.

**Publishing**
- `publish_showcase(project_id)`: security invoker, authenticated only. It refuses unless the project is completed, not archived, and has a complete draft. It copies the draft's whitelisted fields into `showcases` and sets `projects.publication_status = 'published'`.
- Images are copied first by `/api/showcase/publish`. That route checks the owner, fetches each selected image from Drive server-side, checks the type and size, and uploads it to `showcase/<showcase id>/` with the owner's session. Only then does it call the function.
- The **preview** renders the same public component from the draft, behind the owner check.
- Publishing asks for explicit confirmation and shows exactly which fields and images will become public.

**Unpublishing and reverting**
- An Unpublish button, plus database triggers that delete the `showcases` row when the project's stage, publication status, archive or deletion changes.
- The public route then returns 404 on the next request.
- Orphaned images are removed by the unpublish route. A "clean up public images" check in Settings catches any left behind after a trigger-only removal (for example, a stage change made in another tab).

**Public pages**
- `/projects` lists the static case studies plus published showcases.
- `/projects/[slug]` serves static ones as today; otherwise it reads `showcases` at request time with the anonymous key.
- Responses are `Cache-Control: no-store` at the CDN, and nothing private is selected (an explicit column list, never `*`).

## Files (expected)

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/013_showcases.sql` (`project_showcases`, `showcases`, triggers, `publish_showcase`/`unpublish_showcase`, `showcase` bucket and storage policies, anon `SELECT` on `showcases` only) |
| New | `src/lib/showcase.ts` (types, validation, whitelist), `src/app/api/showcase/{publish,unpublish}/route.ts`, `src/app/vault/portfolio/page.tsx` (Ready to Showcase queue), `src/app/vault/projects/[id]/showcase-editor.tsx`, `src/app/vault/portfolio/preview/[id]/page.tsx`, `src/app/projects/showcase-view.tsx` |
| Changed | `src/app/projects/page.tsx`, `src/app/projects/[slug]/page.tsx`, `src/app/vault/nav-links.tsx` (Portfolio link), `src/app/vault/projects/[id]/project-workspace.tsx` (Showcase tab; `published` is no longer selectable by hand) |
| Tests | `tests/sql/phase4a-behaviour.sql`, `tests/showcase.test.mjs`, `tests/browser/showcase.spec.ts`; existing 3A/3B/3C/3D/grant SQL suites re-run after 013 |

## Risks

- **Private data leaking to the public**: the anonymous role gets one table with whitelisted columns. Tests assert anonymous visitors can't read any other table, bucket or column, and can't see drafts, unpublished rows, Drive IDs or links.
- **Stale public content after unpublishing**: no Next data cache on showcase reads, `no-store` at the CDN, and removal by trigger. Tested by reverting stage, archiving, deleting and unpublishing, then requesting the page directly.
- **Public bucket exposure**: only files the publish route copied are there, under unguessable IDs. Listing is denied, and images are deleted on unpublish.
- **Static/dynamic slug collision**: refused by validation and a reserved-slug check.
- **Public site performance**: the homepage stays static. Only showcase pages hit the database.
- **Abuse of the publish route**: owner-only, same-origin checks as the Drive routes, and size and count caps.

## Acceptance tests (4A)

Mapped to the master prompt's §6:
1. Anonymous visitors see only published showcase fields (1, 5).
2. Anonymous requests to every private table, the `attachments` bucket, drafts and the preview route are denied (2).
3. A completed project that isn't published is invisible. Published on a non-completed project is refused by the function and by a check constraint (3, 4).
4. Unpublish, a stage change away from Completed, archive and delete each give a 404 on the next public request, with the images removed (6).
5. The preview matches the public page for the same draft (8).
6. The three existing case studies, homepage and navigation are unchanged (10, 11).
7. Layout works at 320–1280 px, with reduced motion respected.
8. The 013 migration applies twice in a disposable Postgres. Earlier suites still pass. tsc, ESLint, unit tests, browser tests and build all pass.

## Go-live and rollback

- **Deploy order**: apply 013 first (additive; no existing column changes except a new check on `publication_status`), then deploy the code. Pre- and post-checks are read-only counts, as in Phase 3.
- **Rollback**: unpublish all, which empties `showcases` and the bucket, and redeploy the previous build. Then revoke anonymous `SELECT` on `showcases`. The draft tables can stay; no private data is moved or deleted.

## Not in 4A

Profile and Experience editing (4B), Journal, résumé and the media library (4C), "Currently Building" teaser, Gemini, and moving the three static case studies.

## Content you'll need to supply (for 4B, not 4A)

Verified internship roles, dates, tools and responsibilities. Certificate details. Résumé file. Approved photos. Nothing will be invented. Missing sections stay hidden.
