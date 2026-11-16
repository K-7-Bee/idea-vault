# R1 acceptance checkpoint

2026-11-16. Covers initial read failures, logout errors and unavailable attachment links. No live-device tabs, browser profiles, production data or attachment bytes were accessed for this checkpoint.

## Automated evidence

Fresh production build passed in this checkpoint. Local loopback HTTP checks returned 200 for home, project index, three project details, start, manifest and the 192px icon. Unknown project returned the documented streamed 200 with verified not-found content and robots noindex. Temporary servers were stopped. These are HTTP checks without a browser, not interaction tests.

Current suite: 32 passing tests, full ESLint and TypeScript checks passed in the preceding repair slice. Tests cover rejected/returned initial reads, partial index failures, successful empty/populated reads, logout errors/retry/duplicate requests/cache failure, signing failures/partial results/metadata preservation/recovery. React hooks and network services are mocked; these are not browser tests.

## Isolated browser procedure (not yet executed)

Use a fresh disposable browser profile and a separate local fixture backend with synthetic owners/ideas/files. Never use a live profile or restore original outboxes to a connected production origin. The retained recovery database is not an application-ready fixture backend: no Auth/API/Storage server was started. Do not expose it or modify its managed configuration merely to run this checklist. Test backend configuration must be verified before navigation.

1. Initial reads: inject first-page DB failure, later index-page failure and network rejection. Confirm the generic load alert, no misleading empty workspace/partial counts, and successful recovery when fixture reads succeed.
2. Signing: make the signing request return a batch error, reject the request, then return mixed per-file success/error results. All original idea text, tags, counts, filenames and sizes remain. Successful fixture links render; unavailable files are non-clickable text with a status message and retry button. Backend error details stay hidden.
3. Retry: hold the signing response pending. Confirm retry controls disable and repeated clicks do not duplicate requests. Restore successful responses and confirm links recover without losing edited idea state. Delete a synthetic file/idea while the request is pending; response must not resurrect it. Repeat failure and confirm another retry is available.
4. Logout: inject returned and rejected sign-out failures. Confirm no navigation, generic alert and enabled retry. Success navigates once; duplicate pending clicks do not repeat sign-out. Repeat with unavailable/rejecting Cache API. Verify disposable IndexedDB outbox blobs and localStorage drafts remain unchanged.
5. Accessibility: keyboard-focus and activate retry/logout, inspect accessible names and announcement of errors/status, test 390px and 1280px widths and light/dark themes. Use only synthetic image/audio bytes for preview/playback.

Record actual browser/version, fixture identity, observed requests, each pass/failure and any fixes in PROGRESS.md. Avoid credentials, signed URLs, original records and tokens in shared screenshots/logs.

## Remaining boundaries

Real browser/session/API operation, service-worker races, expired-link refresh and full offline account isolation are not established. The existing automatic refresh retains older links on failed renewal; manual retry addresses missing links only. Original attachment downloads remain blocked. Phase 0 and release acceptance remain incomplete.

Rollback: revert only the R1 component/helper/test changes if acceptance fails; retain all source data, drafts, outboxes and recovery artifacts. No deployment or schema changes are part of this checkpoint.
