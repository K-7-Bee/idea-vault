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

## Phase 4C decisions (2026-11-21, in conversation)

Owner replied "approve 4C" to [PHASE_4C_PLAN.md](PHASE_4C_PLAN.md), accepting every recommendation. Refinements made while building are in the plan's "As built" section.

| ID | Question | Answer |
| --- | --- | --- |
| V-025 | Split the slice | 4C: résumé, photo, files library and image metadata removal. Journal moves to 4D, which needs its own approval. |
| V-026 | Where files live before publishing | A private `library` bucket and an owner-only `library_files` table. At publish, a copy goes into a public `profile-files` bucket, named with a random id and no folder, so no owner id appears in the address. Only the site owner can add or remove copies there. Copies the published profile no longer uses are removed. |
| V-027 | Résumé address | `/resume` is read at request time and is never cached. It redirects (307) to the current public copy with the chosen download name, and answers 404 when no résumé is published. |
| V-028 | Profile photo | Optional, in the About section only, with a required description. Shown in a fixed 4:5 frame. |
| V-029 | Image metadata | Every public image, profile and showcase, is re-encoded with `sharp`: turned upright, at most 2400 px on the long edge, quality 85, same format, and stripped of EXIF (including GPS), XMP, IPTC and the ICC profile. The original in the library or Drive is not changed. PDFs are published as uploaded, with a warning in the editor. |
| V-030 | Upload path | Files go from the browser straight to the private bucket, with type and size checked there, by the bucket and by the table. The server checks the actual bytes again when publishing. Limits: 10 MB per file and at most 5 MB per re-encoded image. Uploading the same file again is matched by SHA-256 and reuses the stored copy. Import from Drive comes later. |

## Phase 4D decisions (2026-11-21, in conversation)

Owner replied "approve 4D" to [PHASE_4D_PLAN.md](PHASE_4D_PLAN.md), accepting every recommendation. Refinements made while building are in the plan's "As built" section.

| ID | Question | Answer |
| --- | --- | --- |
| V-031 | Storage shape | Private `journal_entries`. A public `journal_published` snapshot per entry, written only by the security-definer `publish_journal_entry` and `unpublish_journal_entry`, site owner only. Visitors read only through `journal_public()`, which returns public fields with no ids. The owner can read only status columns of the snapshot. |
| V-032 | History | None per entry. Republishing replaces the public copy. The Vault shows "Published, with unpublished changes" when the draft has moved on. |
| V-033 | Freshness | `/journal` and the entry pages read at request time. The homepage stays static, and its Journal link is refreshed by tag from the publish and unpublish routes (`'max'`); the editor confirms it through `data-journal`. A published entry can't be deleted until it is unpublished. |
| V-034 | Project links | Your own projects or the three case studies. A project is named only while its showcase is live; a case study always. Private project names and ids never reach the public. |
| V-035 | Images | Up to 4 images from the 4C library, each needing a description. Public copies have no metadata. Clean-up keeps any copy the profile or a published entry uses, and the database refuses deleting a library file that a journal draft uses. |
| V-036 | Start from a Lab entry | Included, as a one-time copy into the draft. Built inside the entry editor: once a project is chosen, its Lab entries are listed with "Copy into this entry". |
| V-037 | Addresses | `/journal/<slug>`, 3 to 60 lowercase letters, digits and single dashes, suggested from the title. The database refuses changing the address of a published entry; unpublish first. Two published entries can't share an address. |

## Phase 5A decisions (2026-11-21, in conversation)

Owner replied "approve 5A" to [PHASE_5_PLAN.md](PHASE_5_PLAN.md), accepting every recommendation. V-044's age confirmation (18 or older, per the Gemini API terms) was not stated explicitly; it is asked for before go-live. Refinements made while building are in the plan's "As built" section.

| ID | Question | Answer |
| --- | --- | --- |
| V-038 | Tier | Paid tier only: a billing-enabled Google Cloud project. On the free tier, Google uses prompts to improve products and human reviewers may read them. |
| V-039 | Model | `gemini-3.8-flash` (stable) by default, overridable with `GEMINI_MODEL`. A model with no known price is refused. |
| V-040 | Limits | $5 per UTC calendar month and 40 questions per UTC day, from the `ai_usage` ledger, which the owner can't edit. The worst case (estimated input plus the 2,048-token answer cap plus a 4,096-token thinking allowance) is checked before each call. A timed-out request counts at its worst case; other failures count as zero. Plus a Google Cloud budget alert, set by the owner. |
| V-041 | Context | Only records ticked in one project's Assistant tab. The server reads them again from the database, so the browser sends ids only. Records only: no files or Drive content. At most about 30k tokens. |
| V-042 | Conversations | Kept privately per project and deletable singly or all at once. Records are stored as labels and ids, not their text. Usage stays after deletion because it is the cap's record. |
| V-043 | Read-only | Yes. No tools or function calling; the route writes only the conversation and the ledger. |
| V-044 | Terms and key | The owner creates the key and adds it to Vercel; it is never pasted in chat or committed. The age confirmation is pending. |

## Phase 6A decisions (2026-11-21, in conversation)

Owner replied "approve 6A" to [PHASE_6_PLAN.md](PHASE_6_PLAN.md), accepting every recommendation.

| ID | Question | Answer |
| --- | --- | --- |
| V-045 | Backup scope | Every `public` table, found at run time. Also accounts (no secrets), the Storage settings and object list, the security catalog, and the bytes of every object in all four buckets. Google Drive files stay in Drive. |
| V-046 | Where and how | `scripts/vault/backup-live.mjs` runs on the owner's PC through the existing Supabase CLI login (read-only queries; `storage cp --experimental` for bytes, with credentials handled by the CLI and never seen by the tool). The archive is AES-256-GCM with a PBKDF2-SHA256 passphrase, written outside the repository and never overwritten. `restore-drill.mjs` proves it in a disposable offline Postgres. |
| V-047 | Frequency | Before every migration or go-live (now step 1 of each), and weekly by the owner's own reminder. |
| V-048 | Supabase plan | Not needed. The owner checks Billing to know whether Supabase also keeps its own daily backups. |
| V-049 | Download my data | Settings → Download my data: `GET /api/export`, owner-only, read-only, `no-store`, cross-site requests refused. A JSON of every table the account can read, with file names, sizes and paths but no bytes, and no Drive tokens. No import. |

## Phase 6B decisions (2026-11-21, in conversation)

Owner replied "approve 6B" to the 6B section of [PHASE_6_PLAN.md](PHASE_6_PLAN.md), accepting every recommendation.

| ID | Question | Answer |
| --- | --- | --- |
| V-050 | Headers enforced now | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (microphone for this site only; camera, location, payment, USB and topics off), `Cross-Origin-Opener-Policy: same-origin-allow-popups`. On every response, from `next.config.ts`. |
| V-051 | CSP strictness | Scripts allowed from `'self'` with `'unsafe-inline'` plus `https://apis.google.com`, without nonces, so pages stay static. Everything else is limited to this site, the Supabase project and Google's Picker and upload hosts. No framing, plugins or foreign form targets. |
| V-052 | Rollout | Report-only on the live site (`Content-Security-Policy-Report-Only`, reports to `/api/csp-report`, which logs only the directive and blocked origin). Enforced in the local browser build, where any violation fails the run. Enforce live with `CSP_ENFORCE=1` after about a week of clean reports. |
| V-053 | Sign-ups | The owner turns off "Allow new users to sign up" in the Supabase dashboard; confirmation pending. |
