# Local service recovery status

2026-11-16 (Asia/Seoul). Continues owner-authorized local preservation/recovery. Production and attachment access remain unchanged.

## Latest result: all captured tables present

Official Realtime 2.154.0 tenant migrations succeeded using a digest-pinned image and the official dynamic-repository migration API. Required exact equality with all 96 archived migration versions before applying them. Retained a private local pg_dump before initialization. Started Ecto/Postgrex for migration only; no Realtime server, replication workflow, Auth login or Storage API was started.

All 44 captured tables now have matching compared column attributes. **42 match every original row**. The other two are managed migration histories: all 81 Storage IDs/names/hashes and all 96 Realtime versions match, while actual local execution timestamps remain intact. This accounts for all table-row differences without overwriting local migration history.

Recovered three archived owner-scoped Storage object policies and four named Auth user indexes that official service migrations did not recreate. Final catalog comparison: 13 policies, 150 constraints, 151 indexes, 12 triggers and 44 table RLS settings match, with no missing, changed or additional entries in these captured-table categories. All 999 table privilege/grant-option entries match. Owner reads return nine ideas, two file records and two object metadata rows; anonymous and unrelated-user reads return zero for all three public tables and Storage objects.

The remaining full-preservation limitations are attachment bytes (explicitly blocked), independently checked browser exports, portable/off-disk archive/key recovery, full service configuration/function-body coverage, API login and end-to-end app/file workflows. Production sequence positions were not captured; local collision readiness is checked separately. The overall Phase 0 gate remains incomplete. See [completion reconciliation](COMPLETION_REVIEW.md).

Sequence readiness: found the local Auth refresh-token sequence behind recovered IDs, retained its old state privately, and advanced only that local sequence under a table lock after full data/catalog/access checks. Both owned sequences now produce a next value above existing IDs. This reconstructs safe local operation, not the unexported production sequence position.

Final database workflow passed in one rolled-back transaction: owner create/edit/status/tag/text filtering/delete, unrelated-user update/delete denial and cross-owner insert denial. Confirmed both generated test IDs absent afterward. No original records changed and no test records remain. This is direct database verification, not browser/PostgREST/Auth login or attachment-byte playback verification.

`npm.cmd test`: 27 passed, zero failed; targeted ESLint and syntax checks passed. Reports, local restore points, SQL and local-only credential environments remain private and retained. Earlier slice results below are historical.

## Earlier slice: Storage metadata recovered

Continued with the [managed-service migration review](SERVICE_MIGRATION_REVIEW.md). Official pinned Storage migrations succeeded locally after preserving a 160,471-byte pre-migration pg_dump in the protected backup workspace. The migration-only container exited zero; no Storage API was started.

All ten captured Storage table definitions now match the compared column attributes. Restored one bucket and two object metadata rows in one transaction into empty compatible targets with constraints and triggers enabled. Reviewed local insert triggers and required null archived lifecycle controls to prevent lifecycle-state creation. Existing recovered data remains equal to the archive.

**40 of 44 tables match columns and exact PostgreSQL row text.** Three Realtime tables are still absent. `storage.migrations` contains 81 actual local execution records and differs from the archive; it was deliberately retained, never replaced with production execution history. This is a schema/data comparison result, not complete service recovery or attachment recovery.

Final read-only provenance check: all 81 Storage migration IDs, names and hashes match the archive; execution timestamps account for the differing full row text. No mismatched migration identifiers/hashes were found.

Added initialization and metadata-restore modes to the guarded audit tool. Both refuse already initialized/nonempty targets. A new focused migration-history test separates execution timestamps from identifier/hash comparison and rejects duplicate migration IDs. `npm.cmd test`: 26 passed, zero failed; targeted ESLint passed. Earlier results below describe the preceding Auth-only slice.

## Executed slice

Scope: new `scripts/vault/audit-service-recovery.mjs`, focused tests, private audit reports and local-only Auth row recovery. Inspected the existing snapshot result and guarded restore implementation first. Presented scope, risks, comparison acceptance and retention-based rollback before work. No application source or dependencies changed.

The tool verifies the saved encrypted archive hash, decrypts with the existing Windows DPAPI-wrapped key, and requires the exact local Docker context/container/image/volume/sentinel and sole internal network with no active host ports. Audit SQL runs in read-only transactions; private rows stay out of console output. Reports use new filenames and do not overwrite earlier evidence.

Initial comparison across all 44 captured tables found:

- 26 tables with matching columns and exact PostgreSQL JSON row text.
- Five column-compatible empty local Auth tables with archived rows awaiting restore.
- 13 missing local Storage/Realtime tables.
- No column drift or differing nonempty tables in this audit.

Restored only the explicitly allowlisted five Auth tables: identities (1 row), MFA authentication-method claims (5), one-time tokens (1), refresh tokens (7), sessions (5). Required empty compatible targets and no other running containers on the network. Ordered inserts by archived foreign-key dependencies, used one fail-on-error transaction and left constraints enabled. No Auth server was started, tokens replayed, passwords changed, tables reset or existing rows overwritten. Private recovery SQL contains sensitive session data and must remain protected.

Post-restore exact comparison passed for all five tables. **31 of 44 tables now match columns and row text**. Matching empty tables do not prove service recovery. This supplements the prior public-table/owner recovery; it does not repeat or expand claims about full service behavior.

## Earlier Auth slice: remaining gates at that time

Missing local tables: `realtime.messages`, `realtime.schema_migrations`, `realtime.subscription`; Storage `bucket_lifecycle_states`, `buckets`, `buckets_analytics`, `buckets_vectors`, `lifecycle_abandoned_artifacts`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `vector_indexes`.

The next action at that time was official local Realtime tenant initialization. That initialization and catalog reconciliation are now complete as described at the top; this missing-table list is historical. Retain the recovered instance and all evidence. No source migration or cleanup is authorized by this result.

Auth login/session operation, sequence current values, complete service constraints/index/trigger comparison, encryption-key recovery, browser/device exports, application end-to-end behavior and attachment bytes/playback remain unverified. Do not start Auth issuance workflows assuming restored sequence values are ready. Production sequence positions were not exported. Attachment downloads remain blocked by the owner's explicit decision; this work used no production connection or broad service-role key.

## Verification and rollback

`npm.cmd test`: 25 passed, zero failed. Targeted ESLint and syntax check passed. Focused audit tests distinguish missing tables, schema drift, empty restore targets and differing nonempty targets, including a numeric value beyond JavaScript's safe integer range. Actual private audit reports live under the existing `run-20261116T002012Z` folder; the encrypted snapshot/key/hash are unchanged.

Rollback: stop only `supabase_db_idea-vault-restore-prep-20261116` if needed and retain its volume, keys, private SQL and reports. Do not delete recovered rows or reset the database to rerun the drill. Restore mode refuses these now nonempty Auth targets; default audit remains read-only.
