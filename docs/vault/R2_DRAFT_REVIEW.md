# R2 owner-scoped drafts: implementation review

Approved by owner and implemented 2026-11-16. Capture uses `vault-draft:<verified owner ID>` and shows a generic preservation notice without inspecting the legacy key. The shared draft remains untouched and does not load automatically. View preference and the local-value hook are unchanged. Tests exercise Capture with the real hook and synthetic storage, two owner remounts, clearing only the saving owner's draft, zero legacy-key access and independent memory fallback when storage is blocked. Real browser/session/cache acceptance remains open; see PROGRESS.md for final check results. Rollback below remains applicable.

2026-11-16. Proposal only. Queue ownership was separately approved and implemented; this document does not expand that approval to localStorage or service-worker behavior.

## Evidence and scope

Capture currently calls useLocalValue("vault-draft", ""). The hook caches values by key in module memory and localStorage. Thus a newly mounted account can read a previous account's shared draft. Queue ownership guards do not protect this composer value. This is source evidence, not a verified live disclosure.

Propose changing only Capture's draft key to `vault-draft:<verified owner ID>`, using the existing request-verified ownerId. The same owner can resume drafts after remount; distinct owners use distinct memory/storage keys. Preserve the existing `vault-view` preference.

Never read/copy/assign/remove the old `vault-draft` value automatically. Display a short generic notice explaining that older shared drafts remain preserved on-device for separate ownership review. The notice must not expose draft text or claim that a legacy draft actually exists. New saves clear only the current owner's draft using the existing hook behavior. No logout deletion or legacy import/reconciliation UI in this slice.

Files: `src/app/vault/capture.tsx`, focused behavioral tests in `tests/vault.test.mjs`, this review and `docs/vault/PROGRESS.md`. Inspect the local Next.js guides before code edits. No schema, dependencies, worker, authentication-policy, deployment or original attachment changes.

## Risks and limits

The intentional compatibility change is that an old shared draft no longer appears automatically in the composer. It stays at its original key. Owner IDs are identifiers, not secrets or encryption keys. Namespacing prevents accidental cross-account draft loading; it does not protect against same-origin scripts, physical browser access or a still-mounted/cached old session. Session locking and cached private HTML require a separate reviewed slice. Existing old clients may still use the legacy key until retired through a reviewed rollout.

## Acceptance

- Use mocked storage/hooks to save distinct drafts for two synthetic owner IDs, remount each and verify the corresponding draft is loaded.
- Seed a legacy draft and verify it is neither read for composer content, copied, assigned, cleared nor overwritten.
- Save an offline idea and verify only the current owner's draft clears; the other owner's draft and legacy draft stay intact.
- Verify blocked localStorage still uses independent in-memory values per owner and view preference behavior is retained.
- Run tests, lint and TypeScript; build if implementation changes warrant it. Record mocked versus browser evidence separately.

The isolated two-user browser/backend acceptance for queue replay is still open. Current discovery found no connected document sessions and no locally resolvable Playwright/Puppeteer runner. Do not use live profiles, original outboxes or the retained recovery database as fixtures.

## Rollback and decision

Retain all draft keys and values. If the owner-scoped implementation fails, disable draft restoration/writes while preserving storage; do not automatically return to reading the shared legacy key or merge drafts. No browser storage reset.

Owner approval requested for this bounded change, including the intentional pause of automatic legacy-draft loading. It does not authorize legacy reconciliation, cache deletion, new backend services, dependency installation or deployment.
