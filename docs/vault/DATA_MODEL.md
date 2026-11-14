# Data model: observed and proposed

Status: design only; no SQL executed. Source SQL is not a live-schema attestation.

## Existing records

- `ideas`: UUID `id`, `user_id` default auth UID (FK auth.users, delete cascade), required `content`, checked `status` default raw, `created_at`; migration 002 adds `tags text[]`. Indexes `(user_id, created_at desc)` and GIN tags.
- `idea_files`: UUID `id`, `idea_id` (delete cascade), `user_id` (delete cascade from auth user), `path`, `name`, nullable `mime_type`, bigint `size`, `created_at`; index idea_id. Private object bytes are separate from these rows.
- Browser outbox: fixed idea/file IDs, content, tags, creation date, File blobs, optional deletion flag. It has neither persisted owner nor schema migration mechanism beyond version 1. Draft/view keys are also not owner-scoped.

No seed/export of the nine ideas is present. Preserve IDs exactly; do not normalize original text/tags/dates during backfill. Keep an explicit legacy mapping if any later entity requires a different identity. Current files have no checksum or provider field.

## Proposed entity groups

All new recoverable content uses UUID, owner_id, created_at, updated_at, deleted_at and revision where edits can conflict. Parent links must enforce matching ownership at DB and application layers. Do not retrofit every entity into Phase 1.

| Phase | Entities | Main fields/relationships |
| --- | --- | --- |
| 1 | User/profile (auth.users remains identity), Idea extensions | Add optional title/summary/type, original_capture snapshot, updated_at, deleted_at, revision. Preserve `content`, `status`, `tags`, IDs and created_at; new fields initially nullable/backfilled deterministically. Do not invent historical edit times. |
| 1 | Project, IdeaProjectLink | Project owner, name, category engineering/animation/other, active/paused/complete status, next_action. Link original idea and project transactionally; conversion never deletes original. Unique link/idempotency key prevents repeated conversion. |
| Later, if justified | IdeaTag, ProjectMember | Initially retain legacy tag array as canonical; normalize through a compatibility plan only if needed. Membership deferred for single-user product. |
| 2 | Task, Milestone | Project links, title, status, due date, ordering, completion date; explicit task/milestone association. |
| 2 | JournalEntry, DecisionRecord, ActivityEvent | Project, body, event/decision type, actor, source record, timestamp; decisions include rationale/options. Activity from committed changes; versioned content history separate from security logs. |
| 3 | DriveConnection | Owner, provider account ID, encrypted access/refresh token material, scopes, expiry, revocation/disconnection state, key version; server-only access. |
| 3 | FileReference, ProjectFileLink | Provider (supabase/drive), stable provider file ID or Supabase bucket+path, legacy idea_files ID, original name, MIME, bytes, checksum+algorithm when available, provider modified_at, sync_state, verification/error timestamps. Link files to ideas/projects without duplicating bytes. |
| 4 | Component, BOMLine, Experiment | Component part number/manufacturer/vendor, quantity/unit/cost/currency/voltage/current limits, datasheet reference. BOM project+revision+component+quantity; unknown prices remain unknown, currencies not summed blindly. Experiments store objective/setup/firmware commit/measurements+units/outcome/issues/corrective action/files. |
| 4 | AnimationAsset, CharacterProfile, Shot | Asset kind/source/license/ownership/format/version/thumbnail/file; character references/proportions/clothing/rig compatibility/expressions/checklist; scene+shot+duration/status/storyboard/asset links/Blender and render references. |
| 4 | ResearchSource | Owner/project or library, title/URL/source attribution/retrieved_at/notes, file links; preserve source identity. |
| 5 | AIConversation, AIMessage | Owner/project, provider/model, selected source IDs+versions, role/content, usage/cost if supported, proposed mutation+review outcome. Separate accepted changes from generated text. |
| Foundation onward | AuditEvent; operation/idempotency records | Actor, owner, action, target ID, result and time; no raw secrets/content. File operations track pending/succeeded/failed/reconciliation state. |

## Constraints and query plan

Index owner plus common status/category/deleted_at/updated_at filters, project foreign keys and activity timestamps. Start full-text search with PostgreSQL indexes and owner predicates; metadata only for unprocessed files. File extraction state must be explicit, with size/type caps. Tags keep GIN until normalization is justified.

Soft-delete normal user content; defer purge/retention choice to owner. Keep original captures and version history when editing ships. No cascade from idea conversion to project deletion. Shared file links require reference checks before any later physical purge. Use schema versioning and recorded migration checksums; migrations must be re-runnable or explicitly refuse a second run without side effects.
