# Decisions and owner approval queue

2026-11-14. Planning is authorized. The owner's subsequent conversation instruction, "start", authorizes starting Phase 0 preservation work; it does not resolve configuration questions or waive the verified-restore gate. Feature implementation and migrations remain pending. Blank answers are intentionally not approval. This is the Vault decision record; `admin.md` remains the general project log.

## Recommended defaults, not new integrations

Retain Next/Tailwind/Supabase and password login; add schema incrementally. Retain legacy IDs, original content/tags/status/dates, object bytes and local outboxes. Keep Vault strictly private and public portfolio publishing manual. Existing Supabase files remain readable when Drive arrives; no automatic copy/deletion. AI stays off. No dependency, runtime or hosting migration is currently justified.

## Decisions needed before next work

| ID | Owner decision / question | Concrete recommendation and tradeoff | Work waiting | Answer |
| --- | --- | --- | --- | --- |
| V-001 | Approve Phase 0B/0C preservation work and Phase 1A–1C direction? | Approve preservation first; each implementation slice returns for concrete scope review. Source audit alone cannot prove preservation. | Feature implementation; live work needs source/target access | Partial: owner said "start" in conversation, 2026-11-14; Phase 0 preservation tooling started. Phase 1 and unresolved settings not approved by inference. |
| V-002 | Which production URL, Supabase project and devices/browser profiles contain the expected nine ideas? Where is hosting and how is secure read-only access provided? | Confirm references/config through secure channels, never paste secrets. Include every device with offline captures. The app uses Supabase plus browser storage, not Drive today. | Actual record count, backup and isolated restore | Partial: owner confirmed https://kaushik-kamal.vercel.app/vault and both phone and PC in conversation, 2026-11-14. Supabase project/access, browser profiles and deployment settings remain unverified. |
| V-003 | Confirm strict single-user ownership and manual-only public publishing? | Yes; enforce configured owner at API/DB as well as navigation. Expanding to collaborators would require a separate access model. | Authorization design before new data paths | |
| V-004 | Approve UI/navigation and archive/retention behavior? | 232px desktop sidebar; tablet/mobile drawer; graphite/orange dark theme with existing light option preserved. Archive/restore replaces routine permanent deletion; no automatic purge until retention approved. | Phase 1 UX and recoverable deletion | |
| V-005 | Is offline private content allowed on trusted devices, and what should logout do with unsynced drafts/files? | Keep offline capture, owner-bind queue/cache, lock on logout and offer explicit preserve/export/discard choices. Never silently erase pending captures. More protection adds device UX. | Cache/queue security changes | |
| V-006 | Backup destination, retention, acceptable recovery point/time, and isolated test project? | Encrypted independent DB+object+device exports and verified isolated restore before migrations; choose frequency/retention from usage and cost. | Phase 0 preservation gate | |

## Deferred decisions (do not block documentation or unrelated early slices)

| ID | Needed by | Owner input and recommendation | Answer |
| --- | --- | --- | --- |
| V-007 | Phase 3 | Google Cloud OAuth project/client, account, exact deployed/local callbacks and consent configuration. Prefer `drive.file` with picker/import; no broad scopes without separate approval. No integration currently configured in app. | |
| V-008 | Phase 3 | Drive-only for new files or temporary private upload staging? Prefer direct/resumable upload where host permits; retain legacy Supabase. Determine host limits and large-file needs before staging. No live source relocation without selection/verification. | Owner confirmed in conversation, 2026-11-14: Google Drive stores attachments and recordings; Supabase retains idea text, tags and status. Staging and moving existing files are not yet resolved. |
| V-009 | Phase 4 | Blender versions, board families, firmware toolchains, preferred templates and supported file types? Track exact user-supplied versions/commits; do not invent defaults that imply compatibility. | |
| V-010 | Phase 5 | AI provider/model, monthly ceiling, context consent and provider retention? Leave disabled until explicit configuration; only selected files/notes and reviewed mutations. | |

Record each answer with date, conversation/file source, authorized scope and resulting follow-up. Later OAuth consent does not authorize Drive-wide indexing, public sharing, destructive file operations or AI access to every file.

## Phase 2 decisions (2026-11-17, in conversation)

| ID | Question | Answer |
| --- | --- | --- |
| V-011 | The spec says "maintain current stages Exploring → Analyzing → Building → Completed", but stored stages were raw/exploring/building/done. Relabel, keep, or migrate? | Migrate stored values (raw→exploring, exploring→analyzing, building, done→completed). See `supabase/005_idea_stages.sql`. |
| V-012 | Phase 2 scope? | 2A projects + 2B Engineering Lab + 2C Story Studio (text/structure). Drive, Gemini, Portfolio Manager and public publishing remain later phases. |

## Phase 3 decisions (2026-11-18 to 2026-11-20, in conversation)

| ID | Question | Answer |
| --- | --- | --- |
| V-007 | Google account and Cloud project | Owner's personal Google account (address kept out of the repo; enforced through configuration). Cloud project `idea-vault-515017`, consent screen External/Testing with the owner as the only test user, Web client "Idea Vault web" with the production and localhost `/api/drive/callback` redirect URIs. Drive API enabled. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `DRIVE_TOKEN_KEY` set in Vercel Production. The first client secret was exposed in a conversation; owner confirmed it was replaced and the old one deleted, and the downloaded JSON deleted. |
| V-007a | Drive scope and location | `drive.file` only. New files go into an existing owner folder chosen once through Google Picker (option A), not an app-created folder. Folder ID is stored in the database, not the repo. The app cannot see other files, including existing files in that folder. |
| V-008a | Existing Supabase attachments | Leave them in Supabase, readable as today; no copy, move or deletion. |
| V-008b | Largest expected file | 1 GB. Uploads are resumable and go from the browser straight to Drive; large videos play through "Open in Drive" rather than streaming through a Vercel function. |
| V-013 | Drive disconnected or unreachable | Fall back to the existing Supabase upload for files under the bucket's size limit. Larger files stay queued on the device with a "waiting for Drive" status and upload when Drive is reachable. |

## Phase 4A decisions (2026-11-21, in conversation)

Owner replied "approve 4A" to [PHASE_4_PLAN.md](PHASE_4_PLAN.md), accepting every recommendation.

| ID | Question | Answer |
| --- | --- | --- |
| V-014 | How public pages read published content | A separate `showcases` snapshot table; `anon` may SELECT only its public columns (no owner or project id). Private tables stay anon-denied. Writes only through `publish_showcase`/`unpublish_showcase`. |
| V-015 | Public images | Copied from Drive into a public `showcase` Storage bucket at publish (JPEG/PNG/WebP, 5 MB each, up to 8), removed on unpublish. Drive originals are never shared. |
| V-016 | The three hand-written case studies | Unchanged; published projects are listed alongside them. |
| V-017 | How fast unpublishing takes effect | Immediately: public project pages read the database on every request, and triggers drop the snapshot when a project leaves Completed + Published + active. |
| V-018 | Public address | `/projects/<slug>`, chosen in the editor; the three existing slugs are reserved. |

## Phase 4B decisions (2026-11-21, in conversation)

Owner replied "approve 4B" to [PHASE_4B_PLAN.md](PHASE_4B_PLAN.md), accepting every recommendation. Two were refined while building; see the plan's "As built" section.

| ID | Question | Answer |
| --- | --- | --- |
| V-019 | Storage shape | Private `profile_drafts`, one public `profile_published` row (anon may read `content` and `published_at` only), private append-only `profile_versions`. Writes to the public row and history only through `publish_profile(expected_version)`, security definer. **Added while building:** a `site_owner` table names the one account allowed to publish, filled by 014 when exactly one Auth account exists. Without it, any other signed-in account could have replaced the homepage through the API. |
| V-020 | How fresh is the homepage | `/` stays static (`'use cache'`, `cacheTag('profile')`, `cacheLife('max')`). **Changed while building:** the publish route calls `revalidateTag('profile', 'max')`, not `{ expire: 0 }`. The editor then requests `/` until it shows the new publish time, so the editor, not a visitor, absorbs the one stale view. It reports "shows it now" only when confirmed. |
| V-021 | Database unreadable | Build fails (live deployment unaffected). A failed rebuild keeps the last good page; never the seed after a publish. With `{ expire: 0 }` a failed rebuild served the build-time page instead (found by test), which is why V-020 changed. |
| V-022 | Validation | Plain text rendered as text; HTML-like tags refused; per-field length caps; links and certificate links `https:` only; email checked. Enforced in the app and again in `publish_profile`. No images. |
| V-023 | Email exposure | Accepted. Stored as user and domain halves, readable through the public API; the page still never shows it whole in its source. |
| V-024 | Case studies and Selected work | Unchanged. |
