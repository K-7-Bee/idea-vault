# Production backup prerequisite report

**Current update, 2026-11-16:** a verified encrypted 44-table logical database snapshot exists. All 44 captured table schemas are now present locally; 42 tables match every original row. Two managed migration histories retain truthful local execution timestamps with matching source migration identities. Catalog definitions and all 999 table privilege/grant-option entries match; owner, anonymous and unrelated-user read checks pass for public tables and Storage objects. Attachment bytes are excluded by owner decision. See [actual snapshot result](DATABASE_SNAPSHOT_RESULT.md) and [current recovery status](SERVICE_RECOVERY_STATUS.md). The no-backup/absent-runtime statements below describe the historical prerequisite inspection; they do not describe current Docker or artifact status. Full file/device/platform recovery remains unverified.

2026-11-15 (Asia/Seoul). Requested work: real read-only production backup, integrity verification, then local environment/restore checks. This report records actual checks; it is not a backup artifact.

## Backup result

**No production backup created.** Credentials prerequisite failed before any database export was attempted. Supabase CLI 3.1.0 exists and its version was checked. `supabase projects list --output json` exited 1; captured output classified it as authentication unavailable. Raw response and project identities were suppressed. No project linked, login performed, password reset, data query, export or production mutation occurred.

No relevant Supabase/PostgreSQL/backup credential environment variables, repository `.env`/`.env.local`/`.env.production`, linked project reference, or credential files at the explicitly checked standard/local-workspace paths were found. These are bounded checks, not a search of all personal files or credential stores. Database role privileges, complete row visibility, schema/auth visibility and Storage read permissions therefore remain unverified. A working CLI binary is not authenticated production access.

| Requested report item | Current evidence |
| --- | --- |
| Destination | `S:\Road to Storm K7\codex test\idea-vault-preservation` reserved privately; parent user files preserved |
| Backup filename and size | Not applicable: no backup file produced |
| Database schema | Not exported |
| Database rows and counts | Not exported or queried |
| Roles | Not exported |
| Supabase Storage metadata and objects | Not exported; separate bytes backup still required |
| SHA-256/encryption/decryption | Not run on real backup; no integrity claim |
| Local restored table/row comparison | Not performed; prerequisites absent |

## Read-only PC findings

| Requirement | Observation |
| --- | --- |
| Windows | CIM identifies Windows 11 Home, 64-bit, build 26200; display version 25H2. Registry legacy ProductName says Windows 10 Home; report actual CIM/build rather than that stale product label. |
| Installed RAM | 8,589,934,592 bytes (8 GiB) from physical-memory inventory. OS-visible RAM is about 7.9 GiB. Meets the published 8 GB minimum by installed capacity, with little headroom for a full local stack plus development tools. |
| CPU | 64-bit; SLAT and VM monitor mode extensions reported true. Firmware virtualization reported enabled. |
| Server service | LanmanServer running, startup Automatic. |
| Docker | Not on PATH; no executable at the checked standard all-user and per-user locations; Docker service not found. Not an exhaustive disk search. |
| WSL | `wsl.exe` exists but `--status` exited 50 and list exited 1; WSL2 is not operational/verified. Prior status reported WSL not installed. No distro/kernel/version verified. |
| Windows feature state | Read-only feature query requires elevation. No admin/UAC escalation, feature changes or retry as administrator performed. |
| Local PostgreSQL | psql/pg_dump not on PATH; no dedicated restore instance exists. |

Reference: [Docker Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) specify 64-bit CPU/SLAT, 8 GB RAM, firmware virtualization, operational WSL2 and WSL version 2.1.5 or later for the WSL backend. Hardware checks do not establish complete runtime readiness. Windows Home supports Linux containers, which is the relevant container type here. [Microsoft WSL setup](https://learn.microsoft.com/en-us/windows/wsl/setup/environment) describes Windows prerequisites.

No software installed in this pass, no Windows features enabled, no reboot, and no administrator-level changes. Ordinary out-of-sandbox read access was used for private CLI/CIM inspection; it is not Windows administrator elevation. Source documentation still describes Supabase CLI dump/container dependencies: without a suitable runtime, CLI export may also remain blocked after authentication. Do not silently install Docker to bypass that gate.

## Secure next actions

1. Owner signs into the CLI locally, keeping the authentication token in the local CLI credential mechanism, never chat/source/arguments. In a private PowerShell session:

   ```powershell
   & 'S:\Road to Storm K7\codex test\idea-vault-preservation\tools\node_modules\.bin\supabase.cmd' login
   ```

   Do not paste the login output or authentication link/token into chat. Supply only the non-secret production project reference and confirmation that local sign-in completed. If login itself requires a browser interaction, complete it locally.
2. Independently verify database connection and least-privilege export permissions through a secure local prompt/credential mechanism supported by CLI 3.1.0; API login alone does not prove DB or Storage access. Confirm the write pause and pending-device preservation before a consistent real export. Do not put passwords into command-line URLs or shared logs.
3. With owner's separate approval, establish missing Windows/container prerequisites. No installation, Windows feature change or reboot is authorized by the current instruction. If CLI export needs Docker, report that blocker rather than attempting another export mechanism without review.
4. Only then create a new protected run, export roles/schema/data plus all Storage bytes, verify encryption/hashes and report exact artifacts/counts. Restore only into the isolated local instance after target identity/dependencies are verified. No command may restore to production.

Remaining implementation: streaming packaging, authenticated CLI export, paginated Storage exporter, local restore verifier and retention dry-run are planned, not implemented. Existing fixture/preservation tools cannot substitute for these real-data checks. No new application tests were necessary for this report; documentation diff checks only.
