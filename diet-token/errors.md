# Errors

Next ID: E4

## Open

<!-- Unresolved errors only. Raise "Next ID" when you add one.

### E1 (task ID) - short title
- Symptoms: what happens, and where (file:line or command)
- Evidence: the exact error line, or what was observed
- Tried: each attempt and its result
- Next diagnostic step: what to check next
-->

## Lessons

E1 | Restricted network blocked Google Fonts -> production build passed with network access; preserve fonts and check connectivity before changing source.
E2 | No Docker/WSL runtime -> owner set up Docker Desktop on WSL 2 (Docker 29.9.3, verified 2026-11-17) | rerun `docker version` before assuming no local Postgres.
E3 | Supabase CLI not logged in -> owner logged in; CLI 3.1.0 lists the production project and ran read-only checks and Phase 1/2 migrations (2026-11-17) | check `projects list` before asking for credentials.
<!-- One line per resolved error. Check it is not already here before adding.
E1 | cause -> fix | how to avoid it
-->
