# Next-step review

Approved and implemented 2026-11-16: logout error repair. All 30 tests, full ESLint and TypeScript checks pass. See PROGRESS.md for verification details and remaining manual checks. The approval applied to this slice only.

2026-11-16 (Asia/Seoul). Owner requested checking progress and proceeding to the next step. Reviewed master guide, architecture, progress, completion review, resume checkpoint and ordered repair plan. Working tree was clean at entry; the checkpoint's list of uncommitted application files is historical. Initial read-error handling and its regression tests are already present in the current checkout.

## Current gate

The recorded database drill covers all 44 captured tables, with exact original rows in 42 and reviewed migration identities in two. This review did not rerun private recovery or access production. Attachment downloads remain blocked by owner decision. Device exports, independent portable/off-disk recovery and authenticated browser/API workflows remain unverified. Phase 0 is incomplete; no production migration is appropriate.

## Proposed next application slice: R1 logout errors

Scope: handle returned and rejected sign-out errors without presenting logout as successful; restore the button for retry and announce a generic accessible error. Navigate to login only on successful sign-out. Preserve IndexedDB outboxes, file blobs and drafts. Keep the existing cache cleanup behavior in this slice; account/cache isolation requires its own R2 review.

Files: `src/app/vault/logout-button.tsx` and focused behavioral tests in `tests/vault.test.mjs`; record actual outcomes in `docs/vault/PROGRESS.md` after implementation.

Risk: browser cache cleanup already precedes sign-out and can occur even when sign-out fails. This slice does not establish complete offline privacy or cache-race protection. Avoid exposing backend error details or changing authentication policies.

Acceptance: returned error and rejected promise show a generic alert, allow retry and do not navigate; success navigates exactly once; pending state disables repeated clicks; unsupported cache API does not prevent sign-out; no outbox/localStorage deletion. Run focused tests, full existing tests, lint and typecheck. Real-browser authentication remains a separate manual check.

Rollback: revert only this slice's component/test changes. No schema, dependency, provider, production-data or deployment changes are proposed. Root AGENTS.md and the repair plan require owner review before application repair; this document prepares that concrete boundary.
