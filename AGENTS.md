<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Vault planning and preservation

Read [the master guide](IDEA_VAULT_3_CODEX_MASTER_GUIDE.md) and [architecture](docs/vault/ARCHITECTURE.md) first. Planning and starting Phase 0 preservation are authorized; feature implementation awaits owner approval. Preserve public portfolio behavior and all ideas, attachments, and browser outboxes. Never reset live data; require a verified backup and isolated restore before migration.

Planning references: [data model](docs/vault/DATA_MODEL.md), [migration](docs/vault/MIGRATION.md), [security](docs/vault/SECURITY.md), [roadmap](docs/vault/ROADMAP.md), [decisions](docs/vault/DECISIONS.md), [tests](docs/vault/TEST_PLAN.md), [progress](docs/vault/PROGRESS.md). Present scope, files, risks, acceptance tests, and rollback before each implementation phase. Record actual verification and unresolved limitations; do not claim live data or integrations are verified from source inspection.

Current audit (2026-11-15): [repository map](docs/REPOSITORY_MAP.md), [actual architecture](docs/IDEA_VAULT_ARCHITECTURE.md), [feature findings](docs/EXISTING_FEATURES.md), [repair plan](docs/REPAIR_PLAN.md). Stop for owner approval before application repairs. The original master-guide file linked above is currently absent; earlier plans are proposals, not proof of existing project stages or publishing. Reconcile them with the current audit and `PORTFOLIO_IDEA_VAULT_FINAL_MASTER_PROMPT.md` before future development.
