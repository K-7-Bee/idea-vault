# Phase 0 preservation tools

These are local tools, not application features. They do not connect to Supabase, replay browser queues, change schema or restore into a live database. Node built-ins only; no new dependencies. A successful archive check does **not** prove a complete production export or a successful database restore.

## Scope and limits

- `preservation.mjs`: validates records, relationships and attachment hashes; packages exact rows and object bytes; encrypts using AES-256-GCM with a random salt/IV and PBKDF2-SHA256 (600,000 iterations).
- `backup.mjs`: creates/verifies/compares encrypted archives and extracts a verified archive into a **new** local directory. Existing files/directories are never overwritten. Destinations must be outside this repository; choose a private location outside all web roots and sync shares.
- `export-device.js`: manually invoked offline, read-only IndexedDB/draft export with file bytes and deletion markers. Downloads an encrypted archive compatible with Node verification. No credentials, auth cookies or tokens are exported.
- Whole archives are processed in memory. Each disk input, total object bytes and final encrypted archive are limited to 256 MiB; base64/encryption expansion means the effective raw-byte limit is lower. Processing needs additional RAM. Larger inventories need a reviewed streaming method. Do not split arbitrarily and omit records.
- Filesystem modes are best effort; on Windows, configure a private NTFS folder/ACL yourself. Encryption passphrase is unrecoverable; store it separately in a password manager. Protect plaintext source/extracted exports too. Tools do not delete them.

## Before live export

Confirm production URL/project and every device/browser profile, arrange a write freeze, and designate private backup storage and a separate restore project. Avoid navigating to or reloading the live Vault: mounting it can replay uploads and permanent deletions. Preserve in-memory text/files first. Export each device before separately authorized sync/reconciliation. Do not clear browser data or service workers.

No Supabase credentials are available in this workspace. Obtain schema/policies and data using an authenticated administrator-controlled export process. It must include all pages, private bucket contents (including orphans), and a consistent write-freeze snapshot. A table CSV alone is insufficient. Auth identities, bucket settings, provider permissions, RLS and recovery configuration must be independently inventoried and restored/tested too.

## Device export

1. Use the already-open Vault-origin tab and set that browser offline before running the script (DevTools Network Offline or disconnect network); keep all other writer tabs/devices frozen. Do not reload. This script cannot stop other processes or transactions that already started.
2. Review `export-device.js`, then run its complete contents in that tab's DevTools console. Enter and repeat a strong backup passphrase when prompted. This explicit invocation is required; nothing is injected into the app.
3. Save the `.vaultbackup` download in the private backup folder, outside the repo. Verify it with the Node command below. Check device counts against DevTools inventory without modifying it.
4. Keep the browser data intact. This export excludes in-memory unsaved attachments/edit state/current recordings and Cache Storage; preserve unsaved work separately. A missing database aborts rather than creating a new one. If export fails, do not clear data or navigate away.

## Database export input contract

Prepare a private directory with:

- `ideas.json`: array of **all original complete** idea rows, with IDs, owner IDs, content, tags, status and dates; preserve additional fields.
- `idea_files.json`: array of **all original complete** attachment rows, including name, MIME, size, path, owner, dates and idea links.
- `schema.sql`: administrator-exported schema/policies, not the repository bootstrap scripts. Inspect separately to ensure completeness; this tool only checks that it is present and nonempty.
- `objects.json`: array of every exported bucket object, including unreferenced objects. Each entry has `path` (exact Supabase object key) and `local_file` (relative local filename holding the bytes), plus any provider metadata. Optional independent `size` and `sha256` are checked if provided. Do not use object keys as local paths; use generated filenames.
- Actual downloaded files referenced by `local_file`. Relative paths must resolve within the input directory; escapes and symlink escapes are rejected. Filenames/original object keys are never used to construct extraction destinations.

Example `objects.json` shape (illustrative only; never substitute fixture bytes for user files):

```json
[{"path":"<owner>/<idea>/<file>-photo.jpg","local_file":"object-0.bin"}]
```

Missing/corrupt referenced files, wrong owner links and duplicate identities fail validation. Orphan objects remain in the archive and are reported. Empty exports are allowed for genuinely empty accounts: reconcile actual counts against the expected nine ideas separately. This tool cannot detect records excluded from the supplied source inventory.

## Commands (PowerShell)

2026-11-16 device-export update: `export-device.js` also reads the separate `idea-vault-recovery` records, preserves queued recovery file bytes with hashes, and includes `vault-draft:<owner>` text drafts. It aborts creation of a missing recovery database and treats that absence as an empty inventory. Export is still offline/read-only and must never replay removals. Recovery records are device-local; retain/export them before clearing browser data. The verifier/comparison checks the new inventory while accepting older archives without it. There is no automatic device import; restoration of an archive into browser storage needs a reviewed isolated procedure.

Choose existing private parent folders. Read the passphrase without echo or command-line arguments, then clear the process environment when finished:

```powershell
$backupSecret = Read-Host 'Backup passphrase' -AsSecureString
$env:VAULT_BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new('', $backupSecret).Password
try {
  node scripts/vault/backup.mjs create 'C:\PrivateVault\export' 'C:\PrivateVault\snapshot.vaultbackup' 'production-project-reference'
  node scripts/vault/backup.mjs verify 'C:\PrivateVault\snapshot.vaultbackup'
  node scripts/vault/backup.mjs extract 'C:\PrivateVault\snapshot.vaultbackup' 'C:\PrivateVault\new-restore-files'
} finally {
  Remove-Item Env:VAULT_BACKUP_PASSPHRASE
  $backupSecret = $null
}
```

Verification prints only counts, not content, names or tokens. Use the same passphrase environment for device archives. `extract` writes plaintext only into a new destination, never into Supabase or browser storage. Database extraction writes original row arrays/schema, generated byte filenames, `objects.json`, and the exact `snapshot.json`. Device extraction writes the exact `snapshot.json`, including file bytes/metadata needed to recreate Files in an isolated browser later. No automatic browser import or tombstone replay exists.

`compare <before.vaultbackup> <after.vaultbackup>` checks exact database row fields, object bytes/metadata and schema (ignoring capture time/source labels and row ordering), or exact device queue/drafts. Both archives use the supplied passphrase. Capture the second archive from an independently restored/exported target for a real restore comparison. SQL dump ordering changes may require separately reviewed schema comparison; do not bypass differences automatically.

## Required next gate

Restore the independently exported schema/rows, identities, policies, bucket settings and bytes into a separate local PostgreSQL instance with compatible Supabase dependencies; see [local backup proposal](../../docs/vault/LOCAL_BACKUP_PLAN.md). No additional cloud project is required. Verify every field/hash, access denial, photo/audio playback and baseline workflow; test queue/draft reconstruction in an isolated origin without replaying deletion markers live. Record evidence in `docs/vault/PROGRESS.md`. The local round-trip fixture tests only validate this tooling. No live restore tool is included because the isolated target and identity plan are not yet confirmed.

## Approved local setup (2026-11-15)

### Actual database snapshot (2026-11-16)

`audit-service-recovery.mjs <private-run-path>` checks all captured table columns and rows using local read-only transactions. `--restore-compatible-auth` is the reviewed one-time mode for five allowlisted empty Auth targets; it refuses existing data and running companion services, inserts with active constraints in dependency order, then verifies exact rows. It never connects to production or downloads attachments. Supply the existing key through process-local DPAPI unwrapping, never arguments. See [service recovery status](../../docs/vault/SERVICE_RECOVERY_STATUS.md) for actual 31/44 column/row results and remaining service/sequence limits.

See [snapshot result](../../docs/vault/DATABASE_SNAPSHOT_RESULT.md) for the verified encrypted 44-table logical snapshot, exact artifact/hash, DPAPI key limitation, blocked attachment bytes and successful limited local database restore after official Auth migrations. Earlier no-artifact statements describe prior checks.

`capture-logical-snapshot.ps1 -DevicesPaused` performs database-only capture into a fresh protected run after checking the fixed private destination, ACL and capacity. The switch attests an actual owner-coordinated pause and preserved unsaved work; it must never substitute for that confirmation. It does not retrieve service-role keys or download attachments. Archive keys are Windows CurrentUser DPAPI-bound, not portable recovery keys. Do not delete sibling `.key.dpapi` files.

`restore-logical-public.mjs` accepts a verified private run and process-local `VAULT_SNAPSHOT_KEY` supplied through local DPAPI unwrapping; it never connects to production. It refuses wrong container/image/volume/network/sentinel, published ports, unexpected/nonempty destinations and incompatible Auth columns. The sole reviewed exception is the exact empty local migration-metadata artifact documented in the result. The initial incompatible attempt refused; after official Auth migrations, the limited restore passed exact-row and read-access checks. It targets only public tables plus their owner Auth rows, not all 44 service tables. `--verify-only` never loads rows; `--apply-source-grants` compares existing rows/policies first, then applies only archived public privileges to the local copy. Grant recovery uses archived `pg_class.relacl`, not visibility-filtered information-schema grants. Keep private staging SQL and diagnostics protected.

The owner approved the local backup plan. See [setup results](../../docs/vault/LOCAL_BACKUP_SETUP.md). The pinned CLI is installed outside the repo; `preflight.ps1` checks the approved destination without modifying it. A passing fixture test is not a backup. Docker/WSL setup, secure export access and device preservation remain prerequisites; no production export/restore has run.

## Latest local service recovery modes

`audit-service-recovery.mjs <private-run> --initialize-storage` initializes an empty local Storage schema using the reviewed official image digest and freezes at archived migration 80. It verifies prior recovered rows and retains a private pg_dump first. It requires the existing protected snapshot key in memory, verifies the exact isolated Docker identity, and never connects to production. It refuses existing Storage tables.

`audit-service-recovery.mjs <private-run> --restore-compatible-storage` restores only archived bucket/object metadata into compatible empty tables in one transaction. Constraints and triggers remain enabled; lifecycle controls must be null. It refuses the now nonempty recovered targets. Neither command downloads file bytes. Default mode remains read-only; reports retain differing managed migration history and separately compare migration identifiers/hashes. See [executed migration review](../../docs/vault/SERVICE_MIGRATION_REVIEW.md).

`--initialize-realtime` requires the empty verified local Realtime schema and exact equality of all 96 archived migration versions with the pinned official image. It saves a private pg_dump and runs tenant migrations through the official dynamic-repository API without starting the Realtime server. It refuses an initialized schema.

`--restore-local-definitions` restores only the three archived owner-scoped Storage object policies and four named Auth indexes. Existing differing definitions or widened policy roles are rejected. The full audit now compares captured policies, constraints, indexes, triggers, RLS flags, table grants/options, private read access and owned sequence collision readiness. It retains local migration execution timestamps rather than replacing them with production history.

`--repair-local-sequences` requires all data/catalog/grant/access and migration-provenance checks to pass, plus no running companion service. It records the old local sequence state and may advance only `auth.refresh_tokens_id_seq` above recovered IDs, with table locking and verification. It never changes original archive data or claims to recover unknown production sequence positions. No API/login workflow is started by any mode.

`--verify-local-workflows` checks owner idea creation/edit/status/tag/text filtering/deletion and cross-owner mutation denial inside one rolled-back transaction. It then confirms generated test IDs are absent. This tests database behavior, not browser, Auth/API or file-byte workflows. Default mode still uses read-only transactions and performs no test writes.
