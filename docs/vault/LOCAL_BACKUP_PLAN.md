# Manual backup and local restore proposal

2026-11-15. Proposed architecture only; owner approval is required before setup, production export or restore execution. This replaces the earlier requirement for another cloud restore project. No paid Supabase subscription or additional cloud project is needed.

## Inspected architecture and current evidence

- Next.js app uses Supabase PostgreSQL `public.ideas` and `public.idea_files`; IDs, owner links, tags, status and timestamps must remain exact. Live schema may differ from repository SQL.
- Source defines a private Supabase Storage `attachments` bucket with a 25 MiB per-file limit. Database backups alone do not include file bytes.
- Browser outboxes contain files and deletion markers; drafts and in-memory recordings may exist independently of server data. Mounting Vault can replay queued writes/deletions.
- Existing `scripts/vault/` tools validate/encrypt/compare exported JSON and bytes. They do not perform CLI SQL exports or PostgreSQL restoration; the existing archive has a 256 MiB whole-memory limit and is not a general SQL-backup container.
- The requested destination `S:\Road to Storm K7\codex test` exists. Its permissions, available capacity, encryption and backup coverage have not been verified. No files were written there during this planning pass.
- Supabase CLI, Docker, psql and pg_dump were not found on PATH in this inspection. This is not proof they are uninstalled elsewhere. No tools installed or production connection attempted.

## Approved direction and isolation

Production remains unchanged: no migrations, password resets, policy edits, bucket changes, linking-based deployment, writes, restores or cleanup. After separate approval, production operations are limited to authenticated read-only inventory, CLI dumps and Storage downloads during an owner-coordinated write pause across devices.

Restore into a fresh, separate local PostgreSQL instance. Prefer the PostgreSQL service of an isolated local Supabase stack, with a pinned compatible PostgreSQL major version and required extensions/auth/storage base schemas. It is local, does not consume a cloud-project slot, and supports the app's Supabase-specific dependencies.

A generic PostgreSQL container is an alternative only after inventorying and recreating compatible roles, extensions, `auth.users`, `auth.uid()` and storage schema dependencies locally. Do not strip constraints or fake auth functions to make a restore pass. Plain PostgreSQL alone cannot prove login, signed-download or Storage API behavior. If the initial drill restores only the database and verifies file bytes locally, report service/browser checks as not performed.

Bind database ports to loopback only, use a dedicated fresh volume and database, and keep restore configuration separate from production credentials. Disable local email delivery, outbound hooks, scheduled jobs and external integrations before loading real data. A local app used for QA must point exclusively at local services and use a separate browser origin/profile.

## Manual workflow, before any automation

1. **Preflight.** Confirm production project identity, live table/schema inventory, Postgres/extension versions, storage buckets, backup folder capacity/ACLs, encryption method and CLI/container availability. Pin tool versions and inspect installed `supabase db dump --help`; current CLI documentation may differ from older flags. Install tools only after approval. Do not add credentials to the app repo.
2. **Device preservation.** Required profiles: Windows Chrome and Opera, iPhone Safari, iPad Safari; Android Chrome optional. Confirm which profiles actually captured ideas, including installed PWA origins. Keep all writers paused. Preserve unsaved in-memory work first, then export outboxes/drafts offline using the existing read-only tool where supported. Safari/iOS export usability must be verified; never clear site data or reload to simplify export. Compatibility testing and capture-device inventory are distinct obligations.
3. **Secure CLI export.** Use the Supabase CLI for separate roles, schema and data dumps (`db dump`, `--role-only`, `--data-only`, `--use-copy` as supported by the pinned release). Review the CLI's actual included/excluded schemas; explicitly inventory required auth/storage metadata, custom policies and extension definitions. Never assume a default schema dump is a complete Supabase backup. Use direct or session-pooler TLS connectivity supported by the network; no database-password reset is part of this plan.
4. **Credentials.** Obtain secrets through a local masked prompt or protected credential store, pass via supported non-command-line credential mechanisms, and clear process secrets afterward. Keep passwords out of URLs/arguments, shell history, transcripts, raw error output and diagnostic modes. Verify that CLI child commands do not expose them. Stop if secure injection is unsupported. Roles/auth dumps may themselves contain sensitive data: restrict and encrypt them too. Repository reports contain counts/status/error categories only; detailed SQL/identities stay private.
5. **Consistent source inventory.** Coordinate a write pause across app devices and any dashboard/other writers. Record before/after exact table counts, IDs and canonical row digests; use deterministic serialization of all columns, not timestamp/string approximations. Separate CLI dumps and Storage downloads are not one atomic snapshot. If data changes or the pause cannot be established, mark the set incomplete and reconcile/repeat; do not label it consistent.
6. **Storage export.** Enumerate every bucket and all object pages/prefixes with authorized read access. Download bytes without changing permissions or creating public links. Record bucket settings, object identity/path, size, MIME/metadata and SHA-256; use generated local filenames, retaining original keys in the encrypted manifest. Preserve unreferenced objects and report missing referenced files. Never use mirror/sync deletion. Inventory failures, denied objects and pagination gaps fail completeness.
7. **Package and verify.** Create a new timestamped run under the destination; never overwrite an older run. Store restricted staging, encrypted SQL and Storage archives, per-file SHA-256/byte counts, tool versions and encrypted manifests. Choose a reviewed streaming authenticated-encryption format for large SQL/files before implementation; do not silently exceed the existing 256 MiB tool limit. Verify decryption and every hash; a hash alone does not encrypt private data. Restrict plaintext staging until separately approved cleanup.
8. **Local restore.** Restore only to the fresh local target. Restore roles/schema/data in a dependency-compatible order after reviewing Supabase-managed conflicts and required auth rows. Capture every command exit code; use psql fail-on-error (`ON_ERROR_STOP`) and transactions where compatible. No blanket error ignoring, constraint disabling or bootstrap SQL reruns. Any necessary compatibility transformation is documented, kept separately, and checked for preserved source data; incompatible extensions/version differences stop the drill.
9. **Verify and report.** Compare all intended restored tables/counts against the frozen source manifest; compare every original row field/ID, constraints, indexes, sequences, functions and policies. Check idea-to-file and owner foreign keys, all object sizes/hashes and orphan inventories. Report actual idea count against the historical expectation of nine without forcing it. Record table-level expected/actual/pass/fail and sanitized SQLSTATE/error categories. With local Auth/Storage available, additionally verify owner access, anonymous/second-user denial, file upload/download, photo/audio playback and isolated queue reconstruction. Preserve production tombstones without replaying them live.
10. **Declare success manually.** A run is `restore-verified` only after all declared restore checks pass. Distinguish byte integrity, PostgreSQL restore and full application recovery. Retain failures for diagnosis; no automatic backups until the first manual real-data drill is reviewed.

## Restore safeguards to implement after approval

- Separate export and restore entrypoints/configurations; restore has no production secret input or remote-target option.
- Allow only an explicitly pinned loopback endpoint and dedicated local container/volume identity. Verify server version, database identity and a local sentinel before loading SQL. A hostname check alone is insufficient (a local tunnel could reach production).
- Refuse remote URLs, production project identifiers, ambiguous tunnels and a nonempty/unknown destination. No DROP DATABASE, TRUNCATE, db reset, db push or --remote restore path. Use a new local database/instance for each drill.
- Resolve every backup/extraction/retention path and reject junction/symlink escapes outside the designated root. Never interpret object keys as filesystem paths. No recursive deletion of computed paths.
- SQL data may contain hooks or executable definitions; review restore content and suppress external execution routes locally. Treat export payloads as untrusted private data.

## Retention and recovery policy proposal

Manual runs initially: before any migration/release and after significant captures; agree regular cadence after observing duration/size. Proposed retention: latest seven successful backup runs plus one verified monthly run for three months; keep the initial verified baseline and latest two independently restore-verified sets regardless of age. Keep failed/incomplete sets until reviewed. Apply no retention deletion before a successful real restore.

Implement retention as an explicit dry-run report selecting only whole completed run directories beneath the verified destination. Mark protected baselines and verification status in authenticated manifests; modification time alone does not establish eligibility. Owner reviews deletion candidates before any purge. Storage pressure stops new work with an error rather than deleting the last known-good backup. Protect plaintext staging separately; do not claim retention removed it unless verified.

This same-disk folder does not protect against disk failure/ransomware. After the first drill, propose an encrypted copy to an owner-chosen independent disk/location; no cloud subscription is required. Report the lack of an independent copy until one is verified.

## Implementation slices for approval

| Slice | Planned files and scope | Acceptance and main risks | Rollback |
| --- | --- | --- | --- |
| L0 local setup/preflight | New `scripts/vault/preflight.ps1`; private standalone local restore workspace outside repo | Versions, disk/ACL checks, loopback isolation and required schemas verified; tool installation/volume resource requirements reviewed | Stop only the dedicated local services; retain backup files and volumes |
| L1 manual export/integrity | New export/storage/manifest scripts and focused tests; extend tool README | CLI roles/schema/data, paginated Storage, hashes and encrypted packaging; interruption, tampering and no-overwrite tests; production read-only | Stop export and retain partial artifacts labelled incomplete; no production rollback needed |
| L2 local restore/verification | New local-only restore and compare scripts, tests, report template | Reject remote/nonempty targets; fail on SQL errors; actual restored table counts and exact rows/files compared; sensitive output redacted | Abandon the dedicated test instance, preserve evidence; never restore production |
| L3 manual retention/browser QA | Retention dry-run tool, tests and device matrix documentation | Protect known-good sets; reject path escapes; owner-reviewed candidates; Chrome/Opera/iPhone/iPad compatibility checks, Android optional | Keep all retained copies; no purge without separate review |

No application source, production schema, dependencies or backups are changed by this proposal. Approval would cover these local tooling slices and read-only production export only; it would never authorize restoring or deleting production data. Exact commands and credential transport must be reviewed against installed tool versions before execution.

## Sources and verification limits

- [Supabase CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): separate roles/schema/data exports and restore considerations.
- [Supabase local CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started): local stack and container setup.
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups): Free-plan export recommendation and separate Storage object backup requirement.

Only repository inspection, destination existence and documentation review performed here. No setup, exports, restores, retention purge, credential checks or real record counts verified. The existing passing fixture tests are not evidence of production recoverability.
