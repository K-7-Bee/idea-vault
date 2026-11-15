# Local preservation setup results

2026-11-15. Owner approved LOCAL_BACKUP_PLAN. L0 setup/preflight started; no production connection or export, SQL restore, Storage download, device replay or retention purge performed.

## Installed and checked

- Existing destination retained: `S:\Road to Storm K7\codex test`. It contains unrelated files; none were moved, overwritten or deleted.
- Created only `idea-vault-preservation` beneath it, with protected ACL allowing the executing user, SYSTEM and Administrators; verified by the elevated read-only preflight. Ordinary sandbox access to this private folder is restricted; restricted-mode failures must not be treated as missing installation.
- Installed official npm package `supabase@3.1.0` with exact version and lockfile under `idea-vault-preservation\tools`; application dependencies unchanged. Version and `db dump --help` checked locally. CLI v3 uses `--remote`; older `--db-url` examples must not be copied without review.
- Observed available disk space: 68,295,856,128 bytes at inspection, above the preliminary 10 GiB preflight threshold. Actual required space depends on live SQL/Storage inventory and restore image sizes; this is not a capacity guarantee.
- `scripts/vault/preflight.ps1` performs read-only path/ancestor, workspace ACL, disk, pinned CLI and local Docker checks. It never reads credentials or connects to production. It rejects remote Docker environment overrides and non-local contexts. It reports device/export/restore prerequisites as pending, not verified by machine inspection.

## Current blocking prerequisites

- Docker executable/service not found in checked locations. WSL status reports not installed. No Windows features, hypervisor settings or reboot were triggered.
- Local Supabase PostgreSQL therefore cannot start yet. No compatible auth/storage schemas or restore sentinel exist. A generic PostgreSQL database is not silently substituted.
- Secure production export access and credentials have not been configured or requested in chat. Per-profile pending captures/unsaved work on Windows Chrome/Opera, iPhone Safari and iPad Safari are still unknown; Android Chrome optional.

## Next setup step

Install/configure a Docker-compatible local runtime supported on this Windows machine, with WSL2/virtualization prerequisites if required. This may require an administrator and restart; do it at a time that preserves unsaved work. No reboot is automated by this tooling. Follow the [official local setup documentation](https://supabase.com/docs/guides/local-development/cli/getting-started). No additional Supabase cloud project is required.

Then rerun from the repository, in a shell with access to the private workspace:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/vault/preflight.ps1
```

The process-scoped invocation does not change machine execution policy. Exit 2 means prerequisites remain; no private values appear in the JSON report. This inventory is not a production-backup readiness certificate. Do not run `supabase start` until binding, outbound services, database version/dependencies and dedicated volume identity have been reviewed. Its startup output can contain local credentials; keep it out of shared logs.

## Verification and limitations

Initial `npm.cmd test`: 19/19 passed including three new preflight rejection checks and existing preservation/read-error tests. Read-only preflight verified destination/ACL/capacity/CLI; runtime/device/export/restore gates failed as expected. Ordinary sandbox preflight could not inspect private ACL/CLI; elevated preflight confirmed them. No real records or byte counts obtained. L0 remains partial until the local runtime and isolated database can be verified. Export, restore and retention tools from L1–L3 are not implemented yet.
