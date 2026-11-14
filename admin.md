# Admin Questions and Decisions

## Purpose

This file is the decision log between the project owner (admin), Codex, and Claude Code. Use it when work needs clarification or approval. Routine work already authorized by the admin does not need another approval.

See [shared-file.md](shared-file.md) for the current handoff and change history.

## Current status

Current audit is complete; application repairs await owner approval. See ADMIN-AUDIT-001 below and [the repair plan](docs/REPAIR_PLAN.md). Prior planning/preservation decisions in `docs/vault/DECISIONS.md` remain recorded separately.

## How to use this file

1. The agent appends a question with a unique ID, its name, the date, the reason a decision is needed, and a concrete proposal.
2. Explain the affected files or behavior, relevant tradeoffs, and any work that must wait. Reference a reviewable diff or handoff entry when available.
3. Leave the **Admin answer** field blank for the owner to complete. Never fill it in on the owner's behalf or interpret silence as approval.
4. The owner can also answer directly in conversation. The agent may record that answer here, clearly attributing it to the conversation and preserving its scope.
5. Continue work that does not depend on the answer. Proceed with dependent work only after a clear answer authorizes it.
6. After responding to the decision, update the question's status and record the outcome. Preserve the question and answer as history.

## Question template

Copy this template below when a real question arises. Replace the ID and placeholders; leave the answer blank.

```markdown
### ADMIN-001 — Short decision title

- Date: YYYY-MM-DD
- Question from: Codex / Claude Code
- Status: Pending / Answered / Resolved / Withdrawn
- Question:
- Why a decision is needed:
- Proposed action and affected files:
- Recommendation and tradeoffs:
- Work awaiting this answer:
- Related handoff or diff:

**Admin answer →**

**Answer source:** Direct entry in this file, or the admin's conversation message.

**Agent follow-up:** Action taken and validation results, after the decision.
```

## Questions and decision history

### ADMIN-AUDIT-001 — Review audit and authorize the first repair slice

- Date: 2026-11-15
- Question from: Codex
- Status: Pending
- Question: Review the audit and approve the next bounded slice: R0 source/data preservation, followed by a separately reviewed R1 initial-read error repair. Confirm whether project workflow exists outside this checkout and the completion/publication eligibility of the three existing public case studies before any publishing changes.
- Why a decision is needed: Current assignment explicitly requires stopping after audit. Source has raw/exploring/building/done ideas and a static public catalog, not the requested private project lifecycle and Completed+Published bridge. The original 3.0 guide file is absent now.
- Proposed action and affected files: [REPAIR_PLAN](docs/REPAIR_PLAN.md) lists exact existing files, staged scope, risks, tests, rollback and unresolved content. No app edits in the audit. Recommended first source repair would handle initial errors in `src/app/vault/page.tsx` with focused tests; no schema change.
- Recommendation and tradeoffs: Preserve the existing app/rows/files; verify live/device backup and isolated restore before data/schema changes. Do not start the full new-feature roadmap or silently rename statuses.
- Work awaiting this answer: Application repairs, publishing changes, source deletion and migration. Secure source/export access and restore target are also needed for actual preservation.
- Related handoff or diff: 2026-11-15 audit entry in `shared-file.md`; four new `docs/` audit files. No redesign or deployment performed.

**Admin answer →**

**Answer source:** Pending owner response; no approval inferred.

**Agent follow-up:** Audit complete; application code unchanged. Await review.
