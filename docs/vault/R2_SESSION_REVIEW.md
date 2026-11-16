# R2 mounted-session protection: owner review

Owner authorized this presented slice with “next” on 2026-11-16. Implemented mounted-session locking, generation guards, retained in-memory files/edits and recording finalization. The original proposal below remains the scope record. The implementation also adds an optional active-operation guard to `src/lib/sync.ts`, announced before that edit, to stop multi-request replay between mutations.

Local verification: 56 tests, full ESLint, TypeScript no-emit (incremental disabled) and production build pass. The first restricted-network build failed fetching the six existing Google Fonts; the same build succeeded with approved network access. Tests execute real hooks/components/helpers with synthetic services, DOM objects and storage, not a real browser or authenticated API.

Known limits: actual multi-tab signaling, accessibility/focus, media timing, browser history/router caches and backend authorization still require isolated browser acceptance. Already-sent mutations may finish after locking; interrupted upload bytes are retained in the composer with a warning that some files may already be saved. No automatic retry/reassignment/cleanup of those uploads was added. Closing/reloading still loses memory-only files/edits. The existing explicit Log out button still navigates to login on success and can therefore unmount memory-only work; this slice changes no logout/page behavior. Save work before using that existing action. Full logout preservation needs a separately reviewed integration. No deployment, original attachment retrieval or live-device inspection occurred.

## Evidence and scope

Queue replay verifies ownership, drafts use owner-specific keys and the updated worker avoids private HTML caches. Capture has no auth-change subscription, however. Existing idea text, signed links and unsaved edits can remain mounted after another tab signs out or changes accounts. Search, signing and direct edit/upload handlers are separate from replay guards. Server authentication on navigation does not itself lock an already-mounted component. This is source evidence, not a reproduced browser disclosure.

Propose an owner-bound session gate. Subscribe to auth changes and verify identity on reconnect, return to visibility and persisted-page restoration. Sign-out, missing identity or another owner locks the workspace. Verification failures pause remote operations and offer generic retry. Schedule verification outside the auth callback. Only the original verified owner may unlock; another account requires fresh server-authorized navigation.

Preserve offline capture in an already-open, previously verified workspace when no explicit sign-out/account-change signal has occurred. Offline status must never unlock an explicitly locked workspace or authorize remote replay. This preserves existing offline use but cannot detect remote revocation immediately during an outage.

Keep Capture mounted behind a hidden, inaccessible, noninteractive boundary while locked, retaining pending File objects and unsaved edit text in memory. Hide content, counts, previews and signed links; pause playback. Stop recording into the original owner's retained pending files, preserving completed chunks rather than calling the recorder's destructive cancel/unmount path. Late microphone permission must release tracks without starting a recording. Do not automatically navigate, remount, clear storage or reassign work.

Use synchronous guards and operation generations across search/pagination, signing/refresh, queue display/replay, saves, direct edits, status changes, deletion and uploads. After locking, stale completions must not update UI, remove queue records or launch the next mutation. Already-sent requests cannot be recalled; RLS and replay owner checks remain necessary.

Expected files: `src/app/vault/capture.tsx`, a small session-gate hook/component beside it, `src/app/vault/use-recorder.ts`, focused `tests/vault.test.mjs` coverage and progress/review documentation. Read installed Next.js guidance and inspect installed Supabase auth behavior before implementation. Review any necessary expansion to logout/page integration before edits.

No SQL, dependencies, legacy reconciliation, storage purge, worker changes, deployment or original attachment downloads. Preserve previous repairs and public routes.

## Risks and acceptance

- Exercise sign-out, another owner, same-owner refresh, rejected/missing identity, reconnect and visibility/page restoration. Ignore stale verification and unsubscribe cleanly.
- Verify hidden content cannot receive focus or appear in the accessibility tree; media stops. Actual browser checks must supplement mocked-hook tests.
- Defer requests then lock: no stale UI completion, next mutation or queue removal. Include direct edits/uploads and signing, not only replay.
- Retain both owners' drafts, legacy drafts, queue blobs/tombstones, pending files and edit buffers; locking itself must not mutate persistent records.
- Preserve completed recording chunks for the original owner; late microphone permission must not start recording after locking.
- Preserve the stated open-workspace offline capture policy; explicitly locked sessions cannot unlock offline.
- Run tests, lint, TypeScript and build. Full acceptance requires a disposable two-user browser/backend fixture. Never use live profiles, original outboxes or the retained recovery database.

Hidden DOM/memory is not encryption. Browser history/router caches, old clients and previously issued signed URLs require separate real-browser assessment. Reload/closing can still lose memory-only work; this gate must not trigger either automatically. Client verification cannot make account switching atomic.

## Current follow-up

2026-11-16: owner-authorized repairs extend the existing boundary to the dashboard and recovery panel, and coordinate explicit logout without navigation. See [repair evidence and limits](RELIABILITY_REPAIRS_2026-11-16.md). Earlier exclusions/approval questions below are historical; real-browser acceptance remains outstanding.

## Rollback and decision

Stop rollout if the gate fails; keep affected sessions locked with their memory intact while fixing the guard. Do not auto-reload, discard recordings or restore unconditional replay. Revert only this slice in development while retaining earlier ownership/cache fixes and all device records.

Root AGENTS.md and repair-plan R2 require owner review for this new session/offline behavior. Approve this lock-and-preserve policy, including continued capture in a previously verified open offline workspace until an explicit session-change signal? This does not authorize deployment or claim immediate offline revocation detection.
