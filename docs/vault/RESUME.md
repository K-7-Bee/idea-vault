# Resume checkpoint

Saved 2026-11-16 at the owner's request to wrap up, commit and push. No goal automation is active. Start by reading this file and checking `git status --short`; do not repeat initial setup or ask already answered questions.

## Verified work

- Branch: `vault-audit-and-planning-docs`; remote: `origin` (`K-7-Bee/idea-vault`).
- Encrypted logical production snapshot covers 44 captured tables; nine ideas, two file records, one Auth user, one bucket and two object metadata records. Snapshot/key are outside Git.
- All 44 captured tables have matching compared column attributes locally. 42 match every PostgreSQL row exactly. Storage migration history (81 IDs/names/hashes) and Realtime history (96 versions) match source identities; retain true local execution timestamps.
- 13 policies, 150 constraints, 151 indexes, 12 triggers, 44 table RLS settings and 999 table privilege/grant-option entries match the archive.
- Owner reads pass; anonymous/unrelated-user reads return no private rows. Owner CRUD/status/tag/text filtering and cross-owner mutation denial pass in a rolled-back transaction; no test records remain.
- Local refresh-token sequence was advanced above recovered IDs; both owned sequences are collision-safe for existing rows. Original production sequence positions were not captured.
- Latest checks: `npm.cmd test` 27 passed; targeted ESLint and Node syntax passed. No new whole-app build/browser/deployment claim.

## Existing private recovery target

Private root: `S:\Road to Storm K7\codex test\idea-vault-preservation`. Protected Windows ACLs; sensitive plaintext SQL, dumps, local-only credential environments and reports are retained here. Never copy them to Git, chat, public assets or shared logs.

Run: `run-20261116T002012Z`; archive `snapshot.encrypted.json`, 1,476,244 bytes; SHA-256 `cf582164dfbe187719edeeadcbd3edf4aefc4cf8484762d1628b40c7e7de70cd`. Sibling `run-20261116T002012Z.key.dpapi` wraps its key with Windows CurrentUser DPAPI. Keep both; this is not portable independent/off-disk recovery.

Container/volume: `supabase_db_idea-vault-restore-prep-20261116`; sole network `idea-vault-restore-prep-20261116` is internal, without active host ports. Use guarded Docker exec tooling, not a guessed localhost endpoint. Existing sentinel/image/container IDs are recorded privately. The database was left retained; verify current running state when resuming. No API/Auth/Storage/Realtime server stack was started. Migration-only helper containers exited and were retained.

Scripts: `logical-snapshot.mjs`, `capture-logical-snapshot.ps1`, `restore-logical-public.mjs`, `audit-service-recovery.mjs`. See [tool instructions](../../scripts/vault/README.md). Recovery mutations now refuse initialized/nonempty targets; do not reset them to rerun. Default audit is read-only. Its required key is unwrapped locally in memory and removed from the environment before child commands; never print it. Private-folder/Docker operations may require a sandbox escalation for this exact existing target.

## Decisions and blockers to preserve

The owner explicitly said **keep attachment downloads blocked** after automatic review rejected the broader service-role-key fallback. Do not retrieve that key, retry/bypass the blocked download, or ask the same approval again. Metadata is recovered; the two objects' 1,715,415 declared bytes are not backed up or playback-verified.

The owner confirmed all devices paused/unsaved work preserved for the completed capture, then could resume edits. That confirmation does not authorize a new capture under an assumed continuing freeze. Browser profiles were not independently exported/inspected; keep all outboxes, blobs, drafts and tombstones intact. Do not reload live tabs just to inspect them or clear browser data.

Full preservation remains incomplete because of file/device/portable-recovery and API/browser/configuration gaps. Do not migrate/reset production or mark the full product finished. Future Drive/Gemini integration needs real configuration/consent; do not invent credentials or factual portfolio content. Keep legacy idea statuses/IDs and existing public behavior until a concrete approved slice. No deployment/publishing is authorized by this checkpoint.

## Where to continue

Read [current recovery evidence](SERVICE_RECOVERY_STATUS.md), [completion gates](COMPLETION_REVIEW.md) and [implementation checklist](../implementation-checklist.md). The connected [audit](../portfolio-idea-vault-audit.md), [architecture/wireframes](../architecture-plan.md) and [execution plan](../phased-execution-plan.md) reconcile the two master prompts. Proposed modules are not implemented.

Respect any new user instruction before choosing another slice. With current restrictions, preserve the completed drill and resolve only independently available evidence/planning work. Do not silently relax the verified-backup requirement to start a production migration. Application repairs, deployment and public publication retain their review boundaries.

Pre-existing working-tree edits intentionally excluded from the recovery checkpoint commit: root `AGENTS.md`, `src/app/vault/page.tsx`, `tests/vault.test.mjs`, `Custom Browser Start Page.pdf` deletion and untouched `diet-token` files. They stay locally intact. `supabase/.temp/` is local CLI metadata and must not be committed. Check the actual working tree rather than assuming it is clean.
