# R2 explicit logout preservation: owner review

Update 2026-11-16: the owner explicitly authorized this repair. It is now implemented together with the dashboard privacy boundary; see [repair evidence and limits](RELIABILITY_REPAIRS_2026-11-16.md). The proposal below is retained as historical scope, not a new approval request.

2026-11-16. Concrete proposal only. Earlier session-lock authorization did not cover changing the existing explicit logout navigation. Root AGENTS.md and the repair plan require review before this new application behavior.

## Evidence and proposed behavior

`logout-button.tsx` calls `router.replace("/login")` after sign-out succeeds. Capture is a sibling below the server page's Suspense boundary. Navigation unmounts its pending File objects, unsaved edit text and recorder; recorder cleanup discards chunks after unmount. The new session gate preserves this memory only while Capture remains mounted. These are source findings, not a browser reproduction.

Change successful explicit logout to keep the current Vault route mounted and locked. Lock before asynchronous cache cleanup or sign-out begins, pause playback, finalize recording into the original owner's pending files, and invalidate active work through the existing generation guard. Do not send captures or edits automatically as part of logout.

Coordinate logout start/completion with the session gate through a small in-memory, same-window signal module. No credentials, content or owner identifiers need to be carried in signals. While logout is pending, auth events or outstanding verifications must not unlock the workspace. Completion must invalidate outstanding verification again, release the pending state and leave the workspace locked. It must not pretend a failed sign-out succeeded. Existing Supabase events remain responsible for actual cross-tab account changes; the local coordination signal is not an authentication authority.

On success, announce sign-out without navigating or refreshing. Offer a login link with `target="_blank"` and `rel="noopener noreferrer"`, explaining that this tab must stay open to retain unsaved files and edits. Clear stale success messaging when a later auth event reports a new session. Return controls to a usable state so a subsequently verified session can log out again. Keep repeated clicks blocked while the current logout attempt is pending.

On returned/thrown sign-out failure, retain the generic error and retry behavior. Keep the workspace locked until the owner explicitly retries verification or a later auth event prompts successful same-owner verification. A retry during a pending logout cannot unlock. A signed-out or different owner cannot unlock this original workspace. Sign-in in another tab may restore access only after the existing gate independently verifies the original owner.

Do not add an automatic same-tab login link, router refresh, unmount, persistence reset or legacy-work reconciliation. Closing/reloading/navigating away can still lose memory-only work; this slice preserves the explicit logout flow and cannot make browser memory durable. No new login method or in-page credential form.

## Files

- `src/app/vault/logout-button.tsx`: replace successful automatic navigation with retained-tab status/recovery; coordinate logout start/completion and preserve failure/duplicate-request handling.
- `src/app/vault/use-session-gate.ts`: honor the pending-logout lock and cancel stale verification across start/completion.
- A small `src/app/vault/logout-coordination.ts` module for ephemeral same-window signals. Avoid introducing a global persisted owner/session cache.
- Focused `tests/vault.test.mjs` coverage and updates to this review, `PROGRESS.md`, session review and the historical R1 acceptance checklist.

No page/provider restructuring is expected. Read relevant installed Next.js guidance before implementation. Preserve the existing cache-cleanup behavior in this slice; its broad deletion policy remains separately reviewable. No SQL, dependencies, service-worker changes, backend setup, deployment, original attachment downloads or live-profile access.

## Risks, acceptance and rollback

The intentional compatibility change is that successful logout stays at `/vault` with private content hidden. Signing out must still clear the real Auth session. A locked route is not proof of revocation; browser/backend checks remain required. Same-origin scripts can dispatch local signals, but no signal may authorize unlock. Already-sent requests cannot be recalled. Retention in hidden mounted memory is not encryption or secure erasure.

Automated acceptance:

1. Logout locks before delayed cache cleanup/sign-out; duplicates cause one attempt. Token refresh, sign-in events and stale `getUser` completion cannot unlock during the attempt.
2. Success performs zero router navigation/refresh and announces recovery. Test login link target/rel and stale-success clearing after new auth. A second logout after a new verified session remains usable.
3. Returned/rejected sign-out errors preserve generic retry, do not announce success and do not navigate. Cache API absence/rejection still permits sign-out, as before.
4. Retry verification cannot unlock during pending logout. After completion, missing/foreign/rejected identity remains locked; only independently verified original-owner identity unlocks. Ignore old completion signals and clean up listeners/subscriptions.
5. Through the integrated button/gate flow, retain draft, pending Files, interrupted upload inputs, edit buffer and finalized recording bytes. No queue removal, replay, automatic save, storage reset or legacy-key access caused by logout coordination.
6. Run tests, lint, TypeScript, build and diff checks. Preserve previous passing tests, updating the old navigation expectation to the intentionally approved behavior rather than deleting logout error coverage.

Full acceptance additionally requires a disposable browser profile and synthetic two-user backend: actual session revocation, new-tab recovery, same/cross-tab account switching, focus/accessibility, recording timing and retained file bytes. Discovery this checkpoint found no connected document sessions and no resolvable Playwright, Playwright Core, Playwright Test, Puppeteer or Puppeteer Core. No dependencies or backend services were installed/started. Never use live profiles, original outboxes or the retained recovery database as fixtures.

Rollback: stop rollout and retain the locked mounted workspace and its memory while repairing. Do not restore automatic navigation as an emergency action on a tab holding unsaved work. Revert only this development slice, retaining earlier ownership/cache/session guards and all device data. No deployment is authorized by review approval.

## Owner decision

Approve changing explicit logout to sign out and keep this Vault tab locked, with login recovery in a separate tab and all existing device work preserved? This is the concrete behavior change requiring owner approval under AGENTS.md.
