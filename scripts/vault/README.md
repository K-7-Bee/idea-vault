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

Restore the independently exported schema/rows, identities, policies, bucket settings and bytes into a separate non-production Supabase project. Verify every field/hash, access denial, photo/audio playback and baseline workflow; test queue/draft reconstruction in an isolated origin without replaying deletion markers live. Record evidence in `docs/vault/PROGRESS.md`. The local round-trip fixture tests only validate this tooling. No live restore tool is included because the isolated target and identity plan are not yet confirmed.
