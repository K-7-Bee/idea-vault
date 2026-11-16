# Local restore preparation

2026-11-16 (Asia/Seoul). Owner authorized proceeding with approved L0 local setup. No production connection or application changes.

## Result and evidence

- Fresh private workspace: `S:\Road to Storm K7\codex test\idea-vault-preservation\restore-prep-20261116`. Initialized with pinned CLI 3.1.0 beneath the previously ACL-verified parent. Repository configuration and dependencies unchanged.
- Dedicated container and fresh volume: `supabase_db_idea-vault-restore-prep-20261116`. Image: `public.ecr.aws/supabase/postgres:17.11.0.018`; SQL reports PostgreSQL 17.11. Container health is healthy.
- Dedicated network: `idea-vault-restore-prep-20261116`, internal=true, IPv6 disabled, default host binding 127.0.0.1. Actual Docker inspection and `docker port` show no active host port publication. Configured port 55432 is not a usable endpoint verified by this work; inspection uses local `docker exec`.
- Disabled API, migration/seed execution, Auth service, Storage service, Studio, realtime, SMTP, edge runtime and analytics in the separate generated config. No production configuration was copied.
- Fail-on-error SQL confirmed `auth`, `storage`, `public` schemas, `auth.uid()`, zero public tables and zero Auth users before adding a separate `preservation_local` identity sentinel. Exact container/image IDs and generated sentinel are recorded in protected `target-identity.private.json` outside the repository. Startup output stays in `startup.private.log` there.
- CLI startup remained waiting while container health and direct SQL succeeded on the internal network. Stopped only the command-line-matched CLI startup process; container remained healthy. This is not a successful CLI startup exit or complete Supabase service startup.

## Unresolved gates

PostgreSQL 17 is the generated local default, not a verified production match. No real data may be loaded until production version/extensions and restore content/guards are reviewed. If incompatible, preserve this preparation instance and create a compatible fresh target.

`storage.objects` is absent. The combined query stopped on that SQL error, so the subsequent extension-list query was not verified. Database-only initialization does not prove Storage/Auth API recovery. No real backup, restore, browser QA, device preservation, write pause or secure production export access is verified. No production records or browser queues were accessed.

Network/identity evidence does not implement restore guards. A future restore tool must verify exact target identity and reject unexpected data, explicitly accounting for the known sentinel and reviewed Supabase base objects.

## Acceptance, risks and rollback

Setup acceptance met: healthy empty database, dedicated volume/network, no active host publication, local sentinel and private evidence. Production compatibility and complete isolated recovery acceptance remain pending. Risks include resource use, incompatible extensions, executable restored SQL and incomplete service schemas.

Rollback: `docker stop supabase_db_idea-vault-restore-prep-20261116`. Retain volume, network, private files and logs; no reset or deletion performed. Existing working-tree edits were preserved. No application tests required for this local infrastructure slice.

References reviewed: [Supabase local config](https://supabase.com/docs/guides/local-development/cli/config), [CLI reference](https://supabase.com/docs/reference/cli/supabase-start), [Docker bridge options](https://docs.docker.com/engine/network/drivers/bridge/). Installed CLI help and actual inspection support the results above.
