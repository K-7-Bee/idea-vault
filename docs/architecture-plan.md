# Connected portfolio and Vault architecture proposal

2026-11-16. Design only; no application schema migration or integration is implemented by this document.

Reuse the existing Next App Router app, password login and Supabase database. Keep `/start` and the existing public routes working. Add server-side authorization to each new private read/mutation; Proxy remains a navigation guard. Follow installed Next documentation for cookie-bound reads, Cache Components, invalidation and route conventions before coding.

The private workspace holds original ideas, project execution, references and portfolio drafts. Public pages read a separate allowlisted published snapshot. Publishing requires a Completed project plus an explicit approved showcase; an incomplete project never becomes public through a flag alone. Public snapshots omit internal notes, original attachments, Drive links and AI conversations. Journal/teaser publication has separate explicit controls.

Use additive entities after preservation acceptance: project, idea-project link, task/milestone, journal/decision, provider-aware file reference, portfolio section draft/revision and approved public snapshot. Keep existing ideas/idea_files, ownership and UUIDs intact. Conversion creates a linked project transactionally and preserves the original idea. Use idempotency and revision checks for retries/concurrent edits. No inferred backfill of achievements, project completion or publication approval.

Publishing runs a server-authorized transaction producing the approved projection and recording its revision. Unpublish or a transition away from Completed revokes public access and invalidates relevant page/metadata/media caches. Preview uses the same rendering/projection logic with authenticated draft access. Test cache races and direct resource access before release.

Drive is the chosen future store for attachments/recordings, while Supabase retains structured data. Preserve legacy Supabase objects until independently verified recovery and selected copy verification. Use least-privilege OAuth with server-side encrypted tokens and consent; no broad indexing, silent move or delete. Gemini is an optional server-side adapter with selected context, evidence references, configured budgets and reviewed proposals. Both remain disabled until actual configuration and acceptance tests.

Proposed wireframes show destinations as a design, not working routes:

```text
Public, wide screen
Home | About | Experience | Projects | Journal | Contact
[Verified identity / engineering focus] [Projects] [Resume if provided]
[Selected approved projects]
[Real experience and education] [Contact]

Private, wide screen
Dashboard / Ideas | Search                    | Capture | Account
Engineering      | [Resume from saved activity]
Story Studio     | [Ideas / projects / actual next actions]
Library          |
Portfolio Manager| [Draft sections] [Ready to Showcase]
Settings         | [Save draft] [Preview] [Explicit Publish]

Private, narrow screen
[Menu] [Page title] [Capture]
[One-column content, visible status/errors]
[Accessible navigation drawer; focus return]
```

Empty/unavailable modules stay out of live navigation until functional. Story Studio starts with image-first library, story/character bibles and visual shot panels; no browser renderer or rigging suite. Engineering starts with saved goals/tasks/notes/evidence and later BOM/experiments. Resume content derives from stored user activity, never invented progress.

Main risks: private cache exposure, ownerless old outboxes, non-atomic DB/file operations, conflicting edits and public projection leaks. Preserve browser exports; lock/preserve rather than silently discard queues; use explicit operation states and recoverable transitions. Full preservation remains prerequisite to production migration. See [implementation checklist](implementation-checklist.md) and [migration runbook](vault/MIGRATION.md).
