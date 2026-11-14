# Preservation and migration runbook

Status: local preservation tooling started after the owner's "start" instruction. No live backup, restore, schema change, Drive copy or data mutation performed. Phase 0 preservation gate remains open. Do not rerun the bootstrap SQL: it creates existing objects and `002_tags.sql` rewrites tags.

Tool instructions: [scripts/vault/README.md](../../scripts/vault/README.md). Local tools can package/verify independently exported rows/schema/object bytes, encrypt a read-only device export, and extract/compare archives locally. They do not attest live completeness or restore Supabase/browser data automatically. Production inventory and isolated restore still need confirmed access and targets.

## Data locations and hazards

| Location | What must be preserved | Risk |
| --- | --- | --- |
| Supabase PostgreSQL | Complete schema/policies plus every ideas/idea_files row, IDs, owner links, content, tags, status, dates | Source files do not contain the nine live records; auth user deletion cascades; app deletion is permanent. |
| Supabase Storage | Every object in attachments, original bucket/path, metadata and bytes, including orphans | DB backup does not back up object bytes. Metadata and object deletion/upload are separate operations. |
| Each browser profile/device/origin | IndexedDB outbox including File bytes and deletion markers; localStorage draft/view; inspect cached Vault HTML privately | Unsynced content may exist only here; storage eviction, site-data clearing or origin changes lose it. Queue auto-replays on mount/visibility/network/timer. |
| In-memory composer/edit/recording | Pending files, unsaved edit text, current recording | Reload/close before saving/export loses them. |

Existing delete removes objects before rows. If row deletion fails, metadata may survive with missing bytes. Existing saved-idea upload compensates metadata failure by removing its uploaded object; queue uploads keep failures for retry but can leave orphan objects. Duplicate-ID acceptance does not prove equal bytes/content. Never remove apparent duplicates or orphans during preservation.

## Phase 0 backup and isolated restore

1. Confirm actual production origin, Supabase project reference/region, owner UID, host/deployment, applied schema/policies, current recovery settings, and every device/profile used for capture. Use secure access; do not put credentials or private exports in Git/docs/chat.
2. Agree a short write freeze across devices. Before opening the live Vault (which can sync/delete automatically), inspect and export browser storage from the existing origin. Preserve unsaved text/files first. Export outbox records with all blobs and tombstones, not JSON metadata alone. Take a second snapshot after any separately authorized reconciliation. Do not clear/unregister the service worker or outbox.
3. Produce an encrypted, access-restricted schema/data export and a separate complete paginated Storage export with object bytes. Include ownership mapping and restoration needs for auth identities without logging passwords/tokens. Record backup time, source, tool versions and Git baseline commit. Keep backup outside public assets and version control.
4. Create a manifest: table counts and sorted IDs; exact content/status/tags/dates/owner comparisons; attachment IDs, idea links, original names, MIME, sizes, paths, SHA-256 of downloaded bytes. Inventory orphan objects, missing objects, duplicate paths and pending queue state without cleanup. Compare expected nine ideas with actual server plus device inventory; stop and investigate any discrepancy rather than forcing a count of nine.
5. Restore into a separate non-production Supabase project and isolated browser profile/origin. Re-create tested policies/bucket settings and identity mapping; never point restore tooling at live. Verify row-by-row equality and all object hashes/downloads, including voice/photo playback. Test draft/outbox blob restoration and safe idempotent replay in isolation. Deletion markers are preserved evidence, not permission to replay them live.
6. Run unauthorized-access checks and baseline capture/edit/filter/status/download flows on the restored copy. Record exact counts/hashes, artifacts' secure locations, tester/date, failures and fixes in PROGRESS. A file named backup is not evidence of restoration. Establish owner-approved backup frequency/retention and recovery objectives.
7. Only after successful restore, owner approval of the phase scope, and a fresh consistency snapshot may implementation/migration touch live data. Reconcile any writes since snapshot through an explicit delta plan; retain device exports.

## Additive migration sequence (future)

1. Rehearse on restored data. Use reviewed versioned migrations for optional columns/new tables/indexes/RLS; keep old clients working. No rename/drop/reset/re-tagging. Preserve legacy IDs and dates.
2. Backfill in bounded, checkpointed batches with row-level comparisons and rerun safety. Add constraints after validation. `original_capture` copies actual existing content; unknown history remains unknown.
3. Deploy new UI behind a reversible rollout flag after baseline and migration gates. Preserve old queue format/readers until all supported devices are accounted for. Owner-bind queues through an approved recovery flow; never silently assign old content to the next login.
4. Convert ideas by transaction: create project, link original, write activity/idempotency result. Retry returns same project. Original idea and files remain.
5. Drive in Phase 3: keep Supabase references readable. Copy only explicitly selected files after OAuth approval; checksum/size verify and record provider mapping before switching a reference. Failed/interrupted copies leave source intact. No automatic source deletion; broad Drive indexing excluded.
6. Verify live IDs, fields, counts and hashes against manifest; inspect old and new UI, public routes and queue sync. Keep legacy storage and compatible schema through the rollback window. Destructive cleanup is a separate future approval.

## Rollback and stop conditions

Stop on missing ideas/files, hash mismatch, wrong owner, unreadable backup, untested restore, unauthorized access, queue corruption or unexplained counts. Disable new UI/writes and retain logs/operation evidence. Redeploy last known compatible app; additive schema remains. Do not reverse migrations by dropping tables containing new writes.

For corruption, restore to another isolated target first, compare post-backup changes and recover only verified missing/corrupt records with an approved reconciliation plan. Never overwrite production wholesale with an old snapshot. Drive rollback restores legacy reference selection; copied Drive bytes and source bytes stay intact pending review.
