# Database snapshot and recovery check

2026-11-16 (Asia/Seoul). Owner authorized backup assistance, confirmed all devices paused and unsaved work preserved, and subsequently chose to keep attachment downloads blocked.

**Current result:** encrypted 44-table logical database snapshot verified; three public tables plus their owner Auth row restored locally with exact row comparison and owner/anonymous/second-user read checks. Attachment bytes and full Auth/Storage service recovery remain outside the verified result.

**Latest local continuation:** all 44 captured tables are now present with matching column attributes. 42 match every original row; the two managed migration histories retain actual local execution timestamps with matching source migration identities. Recovered Storage bucket/object metadata and supplemental policies/indexes. All 13 policies, 150 constraints, 151 indexes, 12 triggers and table RLS flags match the archive. See [service recovery status](SERVICE_RECOVERY_STATUS.md). Earlier limited-restore descriptions below are historical; attachment bytes and full API/application recovery remain unverified.

## Verified artifact

Private run: `S:\Road to Storm K7\codex test\idea-vault-preservation\run-20261116T002012Z`.

- File: `snapshot.encrypted.json`, 1,476,244 bytes.
- SHA-256: `cf582164dfbe187719edeeadcbd3edf4aefc4cf8484762d1628b40c7e7de70cd`. Independently recomputed from disk and matched the saved verification report.
- Encrypted logical rows for 44 tables in the selected `public`, `auth`, `storage`, `vault`, `supabase_functions`, `supabase_migrations` and `realtime` namespaces, plus catalog definitions. This is **not a pg_dump SQL backup** or a complete platform configuration export.
- Exact public inventory: nine `ideas`, two `idea_files`, zero `timevault_state` rows. One Auth user is included. Storage metadata inventories one bucket and two objects, totaling 1,715,415 declared bytes. **Object bytes are not included.**
- Capture used explicit CLI `db query --read-only` and verified `transaction_read_only=on`. Entire selected-table inventories and every original row matched before/after. Original PostgreSQL JSON row text is retained to avoid JavaScript integer rounding. Catalog definitions were captured once; catalog/schema stability was not independently compared twice. No cross-query atomic snapshot is claimed.
- AES-256-GCM authenticated encryption; saved archive decrypted and compared with the original in-memory payload. SHA-256 verified independently afterward. The randomly generated key is wrapped with Windows CurrentUser DPAPI in sibling `run-20261116T002012Z.key.dpapi`. It was not printed or stored in plaintext and is cleared from the process environment before child commands.

## Recovery limits

The key requires the originating Windows user's DPAPI recovery material. Archive plus wrapped key on this disk is **not a portable independent recovery copy**. Do not delete the key or assume recovery after Windows/account loss. There is no verified off-disk copy. The reviewed implementation is bounded to 64 MiB JSON payloads and buffers CLI output; it is not a general streaming SQL backup tool.

Role metadata excludes role passwords. External service/configuration secrets, application environment, external encryption keys, database settings, sequence current values and all possible provider-managed schemas are not completely exported. Browser outboxes/attachments/drafts were not independently exported or inspected: unsaved-work preservation and write pause are owner confirmations. No live Vault tab was mounted/reloaded by this work.

## Attachment outcome and approval decision

CLI Storage download attempts failed before producing files: first required its experimental flag; retry returned `StorageUnsupportedOperationError` for remote-to-local copy. Failed runs `run-20261116T001530Z` and `run-20261116T001645Z` are retained. The latter contains an encrypted partial database artifact and private diagnostics, not a completed backup.

An alternative using an existing service-role key only in memory was rejected by automatic approval review because the credential also grants write access beyond the approved read-only scope. Owner then explicitly selected **Keep attachment downloads blocked**. That alternative and its credential-reveal command were never executed. Removed its credential lookup/download path from the final snapshot tool. No public links were created and no Storage objects were changed.

## Initial local restore refusal

The new recovery checker verified local Docker named-pipe context, exact container/image/volume identity, sole internal network, no active published ports, local sentinel and empty destination before attempting recovery. It then rejected incompatible Auth user columns **before generating or executing restore SQL**:

- Production `auth.users`: 35 columns.
- Local image bootstrap `auth.users`: 21 columns; source includes a generated `confirmed_at` and later Auth migrations absent locally.

Matching PostgreSQL 17.11 and installed extension versions did not establish managed-schema compatibility. The initial attempt stopped without loading rows. Independent post-failure SQL confirmed zero public tables, zero Auth users and the unchanged single local sentinel. No schema was stripped, auth function faked, managed table replaced, constraint disabled or bootstrap script rerun.

## Compatible local preparation and successful limited restore

Inspected the pinned CLI service versions and reviewed the tagged official Auth Dockerfile/migration command. Downloaded `public.ecr.aws/supabase/gotrue:v2.197.0`, digest `sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`. Used its official `auth migrate` command on the same empty, outbound-isolated local database before loading real data.

The first local migration attempt used the local `postgres` role and failed with schema permission denial. It left an empty `public.schema_migrations` metadata table. Retained it: the restore guard explicitly checked owner `postgres`, sole `version character varying(14) NOT NULL` column and zero rows before allowing this reviewed bootstrap artifact. A second migration container used the existing local `supabase_auth_admin` role and local development password; exited zero with migrations-success evidence. No passwords were changed or privileges broadened to make migration succeed. Auth user columns then matched production, including generated-column behavior.

The public-data/owner-row restore transaction committed successfully. Source JSON rows were inserted with full field preservation and generated Auth fields computed normally; source public constraints, indexes, defaults and ten policies were recreated. The first visibility check exposed incomplete privileges from the information-schema grants view. Corrected the local restore using original `pg_class.relacl` entries already captured in the encrypted snapshot, resolved through PostgreSQL's ACL parser. No new production query or credential was needed. The correction is local-only and restores archived source privileges.

Verified exact row text for `public.ideas` (9), `public.idea_files` (2), `public.timevault_state` (0) and `auth.users` (1), all ten public policies, owner read visibility, anonymous denial and unrelated-user denial. The local empty bootstrap metadata table is retained in addition to those source public tables. Private verification reports and fail-on-error SQL/diagnostics remain in the run folder. That staging SQL contains private rows and must remain protected even though the archive itself is encrypted.

This is a **limited database recovery test**, not a full 44-table service restore. Auth service login/session recovery, remaining service-table restoration, Storage metadata/service initialization, attachment bytes/playback, browser outbox reconstruction and application end-to-end workflows remain unverified. The migration-only containers exited; no email delivery or public-facing Auth service was started. Production data, permissions, credentials and attachment access remain unchanged.

## Files, checks and next gate

Added `scripts/vault/capture-logical-snapshot.ps1`, `logical-snapshot.mjs`, `restore-logical-public.mjs` and focused encryption/completeness/restore-refusal/ACL tests. `npm.cmd test`: 24 passed, zero failed; targeted ESLint passed. Application files/dependencies/public routes were not changed. Existing user working-tree changes were retained.

Next gate: complete service-table and Auth/Storage application recovery checks and independent browser/device preservation evidence. A reviewed read-only attachment access method is separately needed if the owner later changes the download decision. Keep the current recovered instance and every artifact. Phase 0 preservation remains incomplete; no application migration or repair is authorized by this result. Production reads for this snapshot have finished; Vault edits can resume, with subsequent writes outside this snapshot.

Rollback: stop only `supabase_db_idea-vault-restore-prep-20261116` if desired; retain its volume and every snapshot/key/failed-run file. No automatic cleanup, retention deletion, database reset or production rollback is needed or performed.
