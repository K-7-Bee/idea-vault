# R2 private HTML cache: implementation review

Approved and implemented 2026-11-16. The updated worker uses network-only/no-store for private navigation and never reads/writes private HTML caches. Activation retains caches and claims clients; static caching keeps its existing name/behavior. Offline private navigation returns generic 503 text. All 44 tests, full lint, TypeScript no-emit, worker syntax and production build pass. Tests execute the actual worker in a mocked environment with synthetic requests/responses and cache stores. No real service-worker installation, browser/device access, cache purge or deployment occurred. The historical proposal and rollback below record the approved scope; broader privacy gates remain open.

2026-11-16. Proposal only; owner review required before changing offline behavior.

## Finding and recommendation

`public/sw.js` stores successful `/vault` navigation responses in the shared `vault-pages-v1` cache and serves them when fetch fails. These responses may contain private idea text and the previously verified owner ID. Queue/draft namespacing does not authenticate a cached page. Logout currently deletes caches before sign-out, but a pending page request can finish afterward and write private HTML back. This is source evidence; no live browser disclosure or race reproduction is claimed.

Recommend a bounded first fix: stop storing and serving private navigation HTML in the updated worker. For `/vault` and `/vault/*` navigation, use a network request with `cache: "no-store"`; when unreachable, return a generic 503 text response containing no saved records or cached body. Do not treat an HTTP auth redirect/error as offline success. Preserve public behavior and static asset caching.

Tradeoff: an already-open Vault can continue saving captures offline through its existing outbox, but a fresh offline navigation/reload will no longer reopen the cached private workspace. Owner-scoped offline boot/unlock would require a separate design; a cached user ID is not fresh authentication.

## Files and preservation

Change `public/sw.js`, add focused worker tests in `tests/vault.test.mjs`, and update this review and `docs/vault/PROGRESS.md`. Read relevant installed Next.js PWA guidance before edits.

Remove the worker's private-page cache read/write paths. Replace its broad activation cache deletion with non-destructive activation that claims clients without deleting caches. Keep static asset cache naming unchanged for this slice. Existing private cache bytes remain untouched and unused by the updated worker; this is access prevention, not secure erasure. Leave logout's existing cleanup unchanged, and do not add purge commands, migrations, IndexedDB/localStorage access, service installation, dependencies or deployment.

## Acceptance

Use synthetic Request/Response objects and a mocked worker environment to exercise the actual script:

- Successful private navigation returns the network response and uses no-store; zero private cache reads/writes.
- Seed a cache with synthetic private HTML, reject network fetch and verify a generic 503 with no leaked text, zero cache reads/writes and no cache deletion.
- Test `/vault`, trailing slash, nested private routes and query strings; `/vault-other` remains outside the private path matcher.
- Login redirects and HTTP failures are returned without private caching.
- Delayed private responses cannot repopulate a cache after simulated logout cleanup because the updated handler never writes them.
- Activation retains all caches and claims clients; same-origin static assets retain cache-first behavior. Public navigation behavior stays equivalent and non-GET/cross-origin traffic is not intercepted.
- Run tests, lint, worker syntax check, TypeScript and production build. Record mocked versus real-browser evidence separately.

Real updated-worker installation/takeover, old in-flight worker lifetime, multi-tab logout, back/forward cache, Next client router/RSC caches, memory retained by mounted pages and expired-session UI remain unverified/separate concerns. Browser acceptance still needs a disposable isolated fixture, not live profiles or the retained recovery database. Do not claim complete offline privacy from this slice.

## Rollback and decision

Keep cache bytes and device records intact. If the new worker fails, use a compatibility worker that preserves the prohibition on private cache reads/writes; do not restore the old private fallback as an automatic rollback. Stop rollout and inspect synthetic acceptance failures before deployment.

Approve stopping private HTML cache storage/fallback, including loss of fresh offline Vault opening, while retaining already-open offline capture and all stored drafts/outboxes? Approval covers this worker/test slice only, not deployment, cache purging, session-lock implementation or original attachment downloads.
