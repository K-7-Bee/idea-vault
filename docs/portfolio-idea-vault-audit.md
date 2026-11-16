# Connected portfolio and Vault audit

2026-11-16. Reconciles the original guide, later final master prompt, source inspection and actual local database recovery. This document proposes no production change.

| Area | Observed | Still required |
| --- | --- | --- |
| Stack | Next 16.4.3 / React 19.3, Tailwind 4, Supabase SSR/client; existing public and private routes | Retain stack; consult installed Next guides before application edits |
| Public portfolio | Homepage plus static project listing/case studies in `src/lib/projects.ts`; `/start` remains separate | Curated publication projection and Portfolio Manager; verified factual content |
| Private workspace | `/vault` capture, tags, status, search, recording, files, offline outbox, list/grid | Projects, task/journal execution, Story Studio, portfolio editing |
| Authentication | Existing Supabase password login, Vault proxy allowlist, table RLS | Direct API/media/cache tests across logout, expired sessions and account switches |
| Initial load errors | Current working-tree `src/app/vault/page.tsx` renders a load error and avoids mounting Capture when initial reads fail; tests exist | Deployment/browser behavior not verified; do not overwrite these pre-existing edits |
| Persistence | Snapshot contains nine ideas, two file metadata rows, one Auth user and two Storage objects | Object bytes and independently inspected device exports |
| Recovery | All 44 captured table schemas present locally; 42 exact row matches; two truthful local migration histories with matching source identities | Full service configuration, portable/off-disk recovery, API/login and browser/file workflows |
| Authorization evidence | Captured policies, constraints, indexes, triggers, RLS flags and all 999 table privilege/options match locally; private read denial passes | Full application/media cache and publication transition tests |
| Integrations | No app Drive/Gemini adapter/OAuth flow found | Explicit provider configuration, consent, limits and error recovery |

Production was not migrated, reset or deployed by recovery work. The owner's attachment download block remains in force. A connected CLI session does not establish an app integration. An archived bucket/object row does not contain the file.

Existing idea statuses are `raw`, `exploring`, `building`, `done`. The later prompt's Exploring/Analyzing/Building/Completed is a proposed project lifecycle. Preserve idea statuses and IDs; do not silently remap them. Existing static case studies are not evidence of a new Completed + Published approval.

The original guide prioritizes foundation/project execution and an orange Vault palette. The later prompt adds Portfolio Manager, curated publication, Story Studio and Gemini, and requests subdued public styling. Proposed reconciliation: preserve public styling until its own reviewed cleanup; keep private/public style scopes separate; use a separate project lifecycle and explicit publish controls. No palette change or source component deletion is performed here.

Inventory/archive dependencies before retiring the falling screws, Ohm demo or decorative motor. Their navigation anchors, terminal commands, CSS and three.js usage are documented in [repository map](REPOSITORY_MAP.md). Retain all source and assets until that slice is concrete and approved.

Unknown factual content: precise internship organizations/dates/responsibilities, certificate metadata/media, resume, approved photos/contact links and publication decisions. Do not fabricate these or show public placeholders. Existing source wording is not independent factual verification.

Evidence and boundaries: [recovery status](vault/SERVICE_RECOVERY_STATUS.md), [original audit](IDEA_VAULT_ARCHITECTURE.md), [findings](EXISTING_FEATURES.md), [repair plan](REPAIR_PLAN.md). Earlier missing-guide/no-backup assertions in those historical audits are superseded by current evidence.
