# Security and privacy plan

Repository audit, 2026-11-14. Findings describe source-defined controls, not a live penetration test. Changes below are proposed only.

## Current controls and gaps

Supabase password auth and `getUser()` owner-email proxy protect Vault navigation. SQL enables row ownership RLS; Storage policies require the caller's UID path prefix in the private attachments bucket. Signed links are bearer links lasting one hour. Publishable keys are intentionally browser-visible; no service role key is defined in `.env.example`.

The email allowlist is only in the route proxy. Database policies allow any authenticated account its own records; direct Supabase requests bypass the email check. Account/signup settings and deployed policies need verification. There is no server data-access owner check in `VaultContent` itself, and no future API protection exists automatically from the `/vault` matcher.

`idea_files` insert policy checks row user_id, but does not explicitly enforce parent idea ownership or path correspondence. Confirm cross-owner foreign-key/reference behavior with two test users. Signed-link errors and initial read failures are not robustly surfaced. Client size checks plus bucket limit exist; no explicit MIME allowlist, scanning pipeline, CSP or application rate limit found. Provider-level controls remain unknown.

The service worker caches private HTML in an origin-wide cache without account keying. Offline access bypasses a fresh server auth check. Logout clears all origin caches but leaves IndexedDB and draft/view keys; failed logout/cache races and account switching need tests. Queue records lack owner identity and can be replayed under the current session. Do not solve this by silently deleting unsynced records.

## Threat model and required controls

| Threat / boundary | Required design and verification |
| --- | --- |
| Unauthenticated or other-user DB/API access | Validate trusted session and permitted owner near every query/mutation; RLS plus owner-consistent foreign keys. Deny by default. Test direct SDK/API, forged IDs, search, export, signed links and conversion, not just hidden UI. Decide single-user enforcement at DB/API level. |
| Cached/private device disclosure | Owner-bound/versioned caches and queues, explicit trusted-device policy, logout locks private content; preserve/export pending data before any approved cleanup. Test offline logout/relogin, session expiry, cross-account replay and cache write races in production mode. |
| OAuth token theft | Google authorization code with secure state, PKCE as appropriate, exact callback allowlist, secure cookies; tokens encrypted server-side with separately managed keys and restricted tables. Redact logs, rotate keys, serialize refresh, revoke and disconnect safely. No tokens in browser storage/bundles. |
| CSRF and unsafe mutations | SameSite/secure cookie policy, validated origins and CSRF defenses appropriate to handlers/actions; session revalidation per mutation. OAuth state one-time, expiring and session-bound. |
| Malicious upload/XSS | Server/provider size and type checks, safe filenames, untrusted MIME handling, safe download disposition, sandbox/isolate previews; reject executable inline previews. React text rendering remains escaped; sanitize any future rich text. Define type policy and scanning needs before wider uploads. |
| File disclosure or destructive mismatch | Private sharing by default, authorize every download/preview, short-lived links; stable IDs, parent-owner/path validation, operation journal and reconciliation. Never expose private URLs in portfolio metadata. |
| Prompt injection/data exfiltration | AI disabled until configured. User selects context; file content is untrusted data. Bound extraction/context sizes, redact secrets, cite actual processed sources, enforce provider retention settings, caps/rate limits. Model output cannot grant permissions or silently mutate DB/Drive. |
| Abuse/secrets/backups | Login/upload/search/AI rate limits; managed secrets and key rotation; audit actor/target/outcome without secrets or raw private payloads; encrypted restricted backups and tested restoration. Review CSP/security headers without breaking existing 3D/font/PWA functions. |

## Google Drive boundary (Phase 3 proposal)

Prefer `drive.file`; it does not grant arbitrary access to every pre-existing Drive file. Use explicit picker/import for existing files. Broader scopes require separate rationale and approval. Create designated app root and `00_Inbox`, `01_Projects/Engineering`, `01_Projects/Animation`, `02_Research`, `03_Reusable_Assets`, `04_Archive` only after authorization and as needed; persist folder IDs, do not recreate per load.

Handle pagination, resumable upload, bounded retry/backoff, quotas, stale/expired credentials, revoked permissions, moved/deleted files and duplicate names. Disconnect disables app access, clears/revokes credentials as appropriate, retains metadata and never deletes user Drive content automatically. Backups of database metadata and provider file bytes remain separate obligations.

## AI boundary (Phase 5 proposal)

Read-only answers, draft proposals, and explicitly approved mutations are separate permission tiers. No background agent. Modes: Engineering Review, Animation Workflow, Research Summary, Project Planner. Retrieve selected structured data first, then supported selected document text; show unavailable/unprocessed sources honestly. Review changes with Accept/Reject and recheck ownership/revision before applying. Model/provider/monthly budget/retention must be chosen first. Secrets stay server-side; engineering suggestions need datasheet and safety review. No assumption that `.blend` files can be read or rendered by the app/model.

Deletion/export controls, retention and audit visibility require owner decisions. Security acceptance is defined in TEST_PLAN; unresolved live-policy verification blocks release.
