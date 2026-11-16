# Local managed-service migration review

2026-11-16. Owner-authorized preservation continuation. Application repairs, production migrations and attachment downloads remain outside this slice.

## Scope and reviewed sources

Reviewed the official [CLI 3.1.0 image manifest](https://github.com/supabase/cli/blob/v3.1.0/apps/cli/src/shared/services/Dockerfile), its [Storage environment builder](https://github.com/supabase/cli/blob/v3.1.0/apps/cli/src/commands/start/services/storage.service.ts), and Storage 1.90.1 [migration entry point](https://github.com/supabase/storage/blob/v1.90.1/src/scripts/migrate-call.ts), [migration runner](https://github.com/supabase/storage/blob/v1.90.1/src/internal/database/migrations/migrate.ts), configuration and Docker build. The image contains a standalone `node dist/scripts/migrate-call.js` entry point, separate from the API server.

CLI pins Storage `v1.90.1` and Realtime `v2.154.0`. Pulled the official Storage image, resolved digest `sha256:b2a04ca607b6cfdeafc47f5fa8cc22fc386d40cc25e7f11bbfda65954f3ae949`, and pinned execution to that digest. This downloads software, not Vault attachments.

Archived Storage history has 81 rows, including migration 80 `revoke-extra-lifecycle-postgres-grants`. Initialization freezes at that name. The runner disables role installation, hash refresh, queues, vector-store migrations and multitenancy. It uses the existing local `supabase_storage_admin` credential, never a production key. Private environment/log files are retained under the protected recovery workspace.

Reviewed Realtime [tenant migration sources](https://github.com/supabase/realtime/tree/v2.154.0/lib/realtime/tenants/repo/migrations), [release task](https://github.com/supabase/realtime/blob/v2.154.0/lib/realtime/release.ex) and [tenant migration example](https://github.com/supabase/realtime/blob/v2.154.0/dev/scripts/migrate_tenant_db.exs). The pinned source includes the archived latest tenant version `20261103130000`. The release task migrates service repositories; it is not by itself proof that tenant tables were initialized. No Realtime migration was run in this slice.

## Guards, acceptance and rollback

Tool changes are confined to `scripts/vault/audit-service-recovery.mjs`; reports and a pre-migration local pg_dump stay outside the repository. Require exact local Docker identity, sentinel, volume, image and sole internal network, no published ports or other running services, no existing Storage tables, and unchanged archived rows in all previously recovered non-Storage/Realtime tables.

The initial owner guard refused before changes: the PostgreSQL bootstrap assigns the empty Storage schema to `supabase_admin`, rather than `supabase_storage_admin`. Read-only inspection verified that owner and the Storage administrator's existing CREATE permission. The revised guard requires those exact observed facts; no permissions were broadened to satisfy it.

Acceptance requires successful migration exit followed by the existing full column/row audit. Managed migration timestamps should reflect the local execution; never overwrite that history to manufacture exact archive equality. Column compatibility alone does not establish policy, trigger, grant, sequence or API compatibility. Metadata restore and file-byte recovery are separate gates.

Risk: managed SQL may stop partway or differ from archived schema. Preserve partial state and logs on failure; do not reset or drop tables to retry. Rollback is to stop only the dedicated local database container while retaining its volume, the encrypted archive, key, private restore point and reports. No production rollback is needed because production is untouched.

## Executed result

Local pre-migration pg_dump saved: 160,471 bytes. Official migration-only container exited zero. Audit found all ten archived Storage tables present with matching compared column attributes; seven empty tables also matched exact rows. Two metadata tables were compatible and empty. Storage migration history held 81 local execution records with different row text.

Reviewed actual local bucket/object trigger definitions before inserts. The restore mode requires archived bucket lifecycle configuration and generation to be null so insert triggers do not synthesize lifecycle state. Restored one bucket then two objects, ordered by archived foreign keys, in one transaction with constraints/triggers active. Post-restore exact row comparison passed, retaining UUIDs, timestamps, owners and metadata. No object bytes were created or fetched.

Full comparison is now 40/44 matching tables, three absent Realtime tables, and one retained differing managed migration-history table. Auth/public data stayed equal. `npm.cmd test`: 26 passed, zero failed; targeted ESLint passed. Private environment, SQL, dump, migration log and audit reports remain under the protected preservation workspace. Migration and metadata restore modes refuse rerunning against their now initialized/nonempty targets.

Final read-only audit separately compared migration provenance: all 81 Storage IDs, names and hashes match the archive. Full migration-history row differences are execution timestamps, which remain truthful to the local initialization.

## Realtime and supplemental recovery continuation

Pulled official Realtime `v2.154.0`, resolved and pinned digest `sha256:c56af0fbfd06362a1d3bea30a6419cc616240852d2a50cb4c2f41aeef5ee7b00`. Before mutation, verified the empty bootstrap Realtime schema, sole running database on the internal network, prior recovered data and a retained private pg_dump. Used the official example's `Realtime.Repo.with_dynamic_repo` / `Ecto.Migrator.run` API through release `eval`, with only Ecto/Postgrex dependencies started. Required exact equality of all 96 source migration versions before applying them; migration container exited zero. No Realtime application/server, subscriptions, replication or janitor was started.

All 44 table schemas now match compared column attributes; 42 tables match full row text. Realtime and Storage migration histories retain their actual local execution times and match source migration identities. No production connection occurred.

Catalog audit identified three custom Storage ownership policies and four Auth user indexes absent from managed migrations. Added only those allowlisted archived definitions in one transaction, rejecting conflicting definitions, broadened policy roles and extra SQL. Result: exact 13 policies, 150 constraints, 151 indexes, 12 triggers and 44 RLS flags; all 999 table privileges/grant options also match. Read-only owner/anonymous/unrelated-user checks pass for the three public tables and Storage objects. Function bodies, external secrets, full Auth/API workflows and attachment bytes remain outside these claims.
