# Vault backup and preservation tools

## Backing up today's Vault (Phase 6A)

Use these two commands for the live site. The older "Phase 0" sections further down describe the tools used before the 16 Nov 2026 reset; those tools only know the original ideas tables.

**What a backup holds:** every table in `public`, found at run time, so new tables are included automatically. Also the account list (ids, emails and timestamps; no password hashes or tokens), Storage bucket settings and the object list, the security catalog (RLS, policies, grants, functions, triggers), and the bytes of every Storage object with a SHA-256. Files in your Google Drive are not copied; they stay in Drive. Drive OAuth tokens are inside the database rows, still encrypted with `DRIVE_TOKEN_KEY`; that key is not in the backup, so keep it in your password manager too.

**When:** before every migration or go-live, and weekly otherwise. Avoid editing in the Vault while a backup runs, because each table is read separately.

**How (PowerShell, from the repository folder).** The CLI is the Supabase CLI install that is already logged in, and the folder must be outside this repository:

```powershell
$secret = Read-Host 'Backup passphrase (16+ characters, from your password manager)' -AsSecureString
$env:VAULT_BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new('', $secret).Password
try {
  node scripts/vault/backup-live.mjs --cli 'S:\Road to Storm K7\codex test\idea-vault-preservation\tools\node_modules\supabase\dist\supabase.js' `
    --ref kpeyjktueihyxtsfnsyr --out 'D:\PrivateVaultBackups'
  # Prove the backup restores: a throwaway offline database in Docker, removed afterwards.
  node scripts/vault/restore-drill.mjs 'D:\PrivateVaultBackups\vault-live-<ref>-<time>.vaultlive' 'D:\PrivateVaultBackups\drills'
} finally {
  Remove-Item Env:VAULT_BACKUP_PASSPHRASE; $secret = $null
}
```

**What you get:**
- `vault-live-<ref>-<time>.vaultlive`: encrypted (AES-256-GCM; key from your passphrase with PBKDF2-SHA256, 600,000 iterations). Without the passphrase it is unreadable, so it's safe to copy to a USB drive or cloud folder. Losing the passphrase loses the backup.
- `<same>.manifest.json`: counts and SHA-256 fingerprints only, no content, so you can see what a backup holds without opening it.
- The drill writes a report (JSON) saying, per table, whether the restored rows are identical to production. It also checks file hashes and lists any security-catalog differences.

**Limits:**
- Each table is read whole: up to 20,000 rows per table and 256 MiB per archive. Beyond that the tool stops and says so.
- The drill proves rows, permissions and file bytes. It does not prove Supabase Auth logins, the Storage API, Vercel or the running app.
- Restoring into production is a separate, deliberate procedure that needs its own approval. These tools never write to production.

**First run (2026-11-21):** 30 tables, 1 account, 0 stored files. The drill restored all 30 tables identical to production. The catalog matched apart from the legacy `timevault_state` table (not created by any migration) and a production-only `rls_auto_enable()` function.

## Weekly backup on this PC (Phase 6E)

`backup-scheduled.ps1` runs the two commands above for you every week through Windows Task Scheduler:
- the backup;
- keeping the newest 8 archives. Only files named `vault-live-<ref>-<time>.vaultlive` and their manifests are ever removed, and only from this folder;
- a restore drill when the last passing one is over 28 days old.

**Setup, once (PowerShell, from the repository folder):**

```powershell
# 1. Seal the passphrase for this Windows account (asked twice, never shown or stored in plain text).
powershell -ExecutionPolicy Bypass -File scripts\vault\backup-scheduled.ps1 -Action Setup
# 2. Create the task: Sundays 11:00, or at your next sign-in if the PC was off.
powershell -ExecutionPolicy Bypass -File scripts\vault\backup-scheduled.ps1 -Action Register
# 3. Try it now (about 3 minutes; Docker Desktop running for the drill).
Start-ScheduledTask -TaskName 'Idea Vault weekly backup'
npm run check:backup
```

**The folder** defaults to `S:\Road to Storm K7\codex test\idea-vault-preservation\live-backups`, next to the pre-reset snapshot and with the same restricted permissions. Pass `-Folder '<path>'` to both commands to use another one; it must be outside the repository. Set `VAULT_BACKUP_DIR` to the same path for `npm run check:backup`.

**What the sealing means:** the passphrase is encrypted with Windows DPAPI for your Windows account. That account on this PC can unseal it, so anyone signed in as you could open the backups (the same protection as the pre-reset snapshot key). Nobody else can, not even an administrator, and a copy of the folder on another PC can't be opened without the passphrase itself. Keep the passphrase in your password manager as well: the sealed copy is lost if Windows is reinstalled.

**Other actions:**
- `-Action Run`: back up now. Add `-Drill` to force a restore drill.
- `-Action Status`: the same report as `npm run check:backup`.
- `-Action Unregister`: remove the task. Archives and the sealed passphrase stay; delete `backup-passphrase.dpapi` yourself to remove the passphrase.

**When something goes wrong** you get a Windows notification. Each run writes `last-run.json` and a log in `logs\`, and the newest 30 logs are kept. The task only runs while you're signed in, because that's what lets DPAPI unseal without storing your Windows password.

**Tested (2026-11-23)** with a throwaway passphrase in a scratch folder:
- by hand: backup, then restore drill (30 of 30 tables identical), about 3 minutes;
- from Task Scheduler: the same result, after one fix (below);
- the failure path: a wrong CLI path is recorded and gives a non-zero result;
- pruning, with dummy archives and a decoy snapshot-key file;
- no file contained the passphrase.

The test archives were then deleted.

**Fixed along the way:** the Supabase CLI prints query results as a plain list in a normal terminal or a scheduled task, but wraps them in an envelope inside an AI agent's shell. `backup-live.mjs` only understood the envelope, so a backup run from your own PowerShell would have failed with "Supabase CLI returned no rows array". It now reads both (`parseCliRows`, unit-tested).

---

## Phase 0 preservation tools (historical)

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
