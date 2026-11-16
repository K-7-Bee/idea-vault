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
