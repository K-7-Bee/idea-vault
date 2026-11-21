# Slice 4C plan: Résumé, profile photo and a files library (approved 2026-11-21 with all recommendations; live 2026-11-21 as 30de53c)

## As built (2026-11-21, local only)

Built as planned, with these differences:

- **`publish_profile` keeps its one-argument signature.** Instead of taking a mapping, it reads each library file's `public_path` itself.
  - It refuses with `55000` if the file isn't the caller's, is the wrong kind (an image as the résumé), or its public copy isn't in the `profile-files` bucket.
  - The old 4B app keeps working against the new function, so the window between migration and deploy is safe.
- **History keeps the draft form, the public row the public form.** `profile_versions` stores library ids, so Restore to draft brings back the same files. `profile_published` stores only the copies' names. The editor compares the draft with the history entry of the live version.
- **Old copies are removed by a clean-up call, not by the publish route.**
  - The route can't wait for the homepage to refresh. If it deleted the old copy at once, a visitor could get a page pointing at a deleted file.
  - The editor calls `/api/profile/cleanup` once it has confirmed the homepage shows the new version. The Portfolio and Files pages call it when they open.
  - Copies younger than 5 minutes are kept, in case a publish is still in progress elsewhere.
- **`is_site_owner()`** is a security-definer function, so Storage policies can check the site owner (`site_owner` itself stays closed to every API role).
- **In-use files are protected by the database.** A trigger refuses deleting a library file while the draft uses it or it has a public copy. Account deletion (a cascade) is not blocked.
- **`/resume` is read at request time** (`connection()`, `no-store`), from the same cached profile the homepage uses. It never points at a copy the homepage has stopped using.
- **Showcase images** go through the same `cleanImage` before upload (`src/lib/showcase-images.ts`).

Files:
- **SQL:** `supabase/015_library.sql`.
- **Library code:** `src/lib/library.ts` (shared), `src/lib/library-server.ts`, `src/lib/public-files.ts` (sharp, public copies, clean-up).
- **Routes and pages:** `src/app/resume/route.ts`, `src/app/api/profile/cleanup/route.ts`, `src/app/vault/portfolio/library-picker.tsx`, `src/app/vault/portfolio/files/{page,files-manager}.tsx`.
- **Changed:** `profile.ts`, `profile-public.ts`, `showcase-images.ts`, `page.tsx`, `home-view.tsx`, the profile editor, its page and preview, the publish route, the Portfolio page and `orphan-cleanup.tsx`; `package.json` adds `sharp`.
- **Tests:** `tests/sql/phase4c-behaviour.sql`, `tests/library.test.mjs`, `tests/browser/resume.spec.ts`; fixture support in `tests/browser/api-fixture.mjs`; pinned rules updated in `tests/portfolio.test.mjs` and `tests/profile.test.mjs`.

**Deploy order:** apply 015 first, then deploy. The 4C app reads `library_files` and the new buckets.

**Rollback:**
1. In the editor, remove the résumé and photo and publish.
2. Promote the previous deployment.
3. Set `profile-files` to non-public.

The 015 functions still work with the 4B app.

Parent plan: [PHASE_4_PLAN.md](PHASE_4_PLAN.md). Builds on 4A (showcases, live) and 4B (profile editor, live as `360ff75`).

The parent plan grouped Journal, résumé and the media picker as one slice. This proposal **splits** it:
- **4C:** résumé and photo, the files library they need, and a privacy fix to 4A images.
- **4D:** Journal, which comes after and reuses the library.

The reason: the résumé is the highest-value missing item for an internship reviewer (master prompt §1, Home and Contact), while Journal is optional and has its own publication rules. Splitting keeps each change reviewable.

## Current behaviour (source, 2026-11-21)

- **No résumé exists anywhere.** `tests/portfolio.test.mjs` asserts the homepage has no résumé link, because none has been supplied.
- **The homepage has no photo of you.** The hero is a drawn background (`src/app/portfolio/hero-bg.png`); 4B deliberately left images out.
- **Showcase images are copied byte-for-byte** from Drive into the public `showcase` bucket (`src/lib/showcase-images.ts`, `copyImage`). Phone camera files often embed GPS coordinates, camera serial and capture time in EXIF/XMP metadata, and all of that would become public with the image.
  - The bucket currently holds 0 objects (genesis was unpublished), so nothing is exposed today.
  - Whether any earlier copy carried GPS data is not known.
- **There is no reusable file store.** Story and Lab pictures live in Drive (picked per file). Idea attachments sit in the private `attachments` bucket. Showcases copy images per publish. Nothing can be chosen once and reused elsewhere.

## Scope

1. **Files library** (Vault → Portfolio → Files). You upload a PDF or image from your device into a **private** library.
   - Uploading the same file again reuses the existing entry, matched by content hash, so there are no duplicate copies.
   - Each file shows where it is used (draft or published profile).
   - A file can't be deleted while it is in use.
2. **Résumé.** The profile editor gets a Résumé field: choose a library PDF and set the download file name, for example `MD-Kaushik-Kamal-Resume.pdf`.
   - Once published, a **Résumé** button appears in the hero and the Contact section, linking to a stable address, `/resume`.
   - Hidden while empty.
3. **Profile photo (optional).** Choose a library image and write its description (alt text, required).
   - It appears in the About section; hidden while empty.
   - The hero background is unchanged.
4. **Publishing stays the 4B flow.** Save, preview, confirm with a changed-sections list, publish, history and restore. At publish, the chosen files are copied from the private library into a public bucket. Files you remove from the profile are deleted from public storage.
5. **Metadata stripped from every public image**, including showcases (fixes the 4A gap). Images are re-encoded: rotated upright, with all EXIF/XMP/ICC text removed, in the same format.
   - PDFs are published as-is. The editor warns that everything inside the PDF, including its document properties, becomes public.

## Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-025 | Split the slice? | Yes: 4C as above, Journal becomes 4D with its own approval. |
| V-026 | Where files live before publishing | A **private** `library` bucket plus an owner-only `library_files` table (hash, type, size, name). Public copies go into a separate public `profile-files` bucket, made only at publish and deleted when no longer published. Alternative: upload straight into a public bucket under a random name. That is simpler, but an unpublished résumé would be fetchable by anyone holding the exact URL. |
| V-027 | Résumé address | A stable `/resume` that redirects to the current public copy and downloads it under your chosen file name. It returns "not found" when no résumé is published. It is refreshed together with the homepage (same cache tag), so a link you send stays valid when you replace the file. |
| V-028 | Profile photo | Include it as optional, in About only, with required alt text. Skip it if you'd rather not have a photo on the site. |
| V-029 | Image metadata | Re-encode every public image with `sharp`: upright, metadata removed, long edge capped at 2400 px, quality 85, same format. `sharp` is already installed with Next; it becomes a direct dependency. This also applies to showcase images from now on. Visible quality changes slightly; the Drive or library originals are untouched. |
| V-030 | Upload path | From the browser straight to the private bucket (owner-only Storage policy), so files above Vercel's ~4.5 MB request limit work. The server checks the real bytes (`%PDF-`, JPEG/PNG/WebP signatures) when publishing, not just at upload. Caps: PDF 10 MB, image 10 MB in, at most 5 MB once re-encoded. Importing from Drive is left for later. |

## How publishing changes

- **What the draft stores:** the draft references library files by id.
- **What the publish route does:**
  1. Checks the owner and that the draft version matches.
  2. For each file referenced in the draft, makes (or reuses) its public copy. Images are re-encoded; PDFs are copied after the signature check.
  3. Calls `publish_profile(p_draft_version, p_files)`. The function checks each mapping: a library row you own, and a public object present in your folder of `profile-files`. It then writes the published content with public paths only, so library ids and owner ids never reach the public row.
  4. After the homepage refresh, deletes public copies no longer referenced. The Portfolio page also sweeps leftovers older than 5 minutes, as in 4A.
- **Restoring an old version** whose library file has since been deleted is blocked at publish with "choose the file again". History stays read-only.
- **Removal speed:** public copies are cached for at most 60 seconds (same as showcase images). After removal, `/resume` stops redirecting within the homepage refresh.

## Files (expected)

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/015_library.sql`: `library_files` (owner-only RLS), private `library` and public `profile-files` buckets with owner-folder policies, and an updated `publish_profile(integer, jsonb)` with resume and photo checks in `profile_content_problem`. The old one-argument function is revoked. |
| New | `src/lib/library.ts` (types, hashing, signature checks), `src/lib/public-files.ts` (re-encode, copy, cleanup; shared with showcases), `src/app/vault/portfolio/files/{page,files-manager}.tsx`, a library picker dialog component, `src/app/resume/route.ts` |
| Changed | `src/lib/profile.ts` (`resume`, `photo` fields and checks), `src/app/api/profile/publish/route.ts`, `src/app/vault/portfolio/profile/profile-editor.tsx` (Résumé and Photo section, PDF warning), `src/app/portfolio/home-view.tsx` (Résumé buttons, About photo), `src/app/vault/portfolio/page.tsx` (Files link), `src/lib/showcase-images.ts` (re-encode before upload), `package.json` (`sharp`), `tests/portfolio.test.mjs` (a résumé link only when one is published) |
| Tests | `tests/sql/phase4c-behaviour.sql`, `tests/library.test.mjs` (signatures, dedupe, metadata really gone from JPEG/PNG/WebP fixtures that carry GPS), `tests/browser/library.spec.ts`. The 4B, 4A, 3A–3D and grant suites are re-run after 015. |

## Risks

- **Personal data in the résumé.** A public PDF can be indexed and copied. Mitigation: the editor warns before you publish it. I'd suggest a public version without home address or phone number; that is your call, and nothing is altered inside the PDF.
- **Leaking unpublished files.** The library bucket is private and owner-only. Tests assert anon can't list or fetch from `library` or read `library_files`, and that published content contains no library or owner ids.
- **`sharp` on Vercel.** It is the library Next itself uses for images, but calling it from our route is new.
  - Verified locally and in a preview deploy before go-live.
  - If it fails at publish, publishing stops with a clear message, and nothing is published unstripped.
- **Showcase behaviour change.** Re-publishing a showcase now re-encodes its images. The live site currently has no published showcases, so nothing changes until you publish.
- **Storage use.** The free Supabase plan allows 1 GB, and the library is capped per file. The Files page shows the total used.

## Acceptance tests

Mapped to master prompt §6:
1. Before any change, `/` is unchanged and `/resume` is "not found" (1, 10).
2. Upload a PDF, choose it, preview, then publish. The homepage shows Résumé, and `/resume` downloads exactly that file under the chosen name (7, 8).
3. Upload the same file twice: one library entry. Choose one file for two uses: one public copy.
4. Remove the résumé and publish. `/resume` is "not found", and the public object is deleted (6).
5. Anonymous visitors can't list or read the library, its table, drafts or history. Published content contains only public paths (1, 2).
6. A JPEG with GPS EXIF, a PNG with text chunks and a WebP with XMP come out with no metadata. A phone photo with an orientation tag comes out upright. A renamed non-image or non-PDF is refused.
7. A file in use can't be deleted. Restoring a version whose file was deleted is blocked at publish with a clear message (8).
8. Layout works at 320–1280 px with the photo and buttons present or absent; reduced motion respected (10).
9. 015 applies twice in a disposable Postgres; all earlier suites, tsc, ESLint, unit and browser tests and the build pass (11).

## Go-live and rollback

- **Deploy order:** apply 015 first. It is additive apart from replacing `publish_profile`, and the old function is kept until the new code is live, so the current editor keeps working in between. Then deploy.
- **Rollback:**
  1. Publish the profile without résumé and photo, which empties `profile-files`.
  2. Promote the previous deployment.
  3. Set `profile-files` to non-public.

  The library and its table can stay; nothing private is moved or deleted.

## Not in 4C

- Journal (4D).
- Importing library files from Drive.
- Reusing library files in showcases. Showcases keep picking from the project's Drive files; they only gain metadata stripping.
- Editing or redacting PDFs.
- A photo in the hero.
- Gemini.

## 4D preview (Journal; for approval later)

- Short engineering notes, each optionally linked to a project. Each entry has its own draft, preview and publish; entries are unpublished by default.
- A public `/journal` list and `/journal/<slug>` pages. The Journal menu link appears only when at least one entry is published.
- Images come from the 4C library.
- Open question for then: an entry linked to a project that isn't published. Recommendation: the entry may still be published, but without the project link or name, so it never reveals a private project.

## Content you'd supply (only when you want it live)

The public résumé PDF; the download file name; optionally a portrait photo and its description. Nothing will be invented, and empty fields stay hidden.
