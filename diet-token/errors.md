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
<!-- One line per resolved error. Check it is not already here before adding.
E1 | cause -> fix | how to avoid it
-->

### E2 (T3) - Local restore runtime unavailable
- Symptoms: Docker absent from checked PATH/default location; wsl --status reports WSL not installed. Preflight refuses readiness.
- Evidence: local-container-runtime check false; elevated destination/ACL/capacity/CLI checks true.
- Tried: Installed exact Supabase CLI 3.1.0 privately; version/help checks pass. No Windows feature install or reboot triggered. Earlier CIM inspection was access-denied; capacity obtained through DriveInfo instead.
- Next diagnostic step: Establish Windows Docker-compatible runtime and virtualization prerequisites; rerun read-only preflight. Secure export access and device preservation gates remain pending independently.

### E3 (T3) - Production export authentication unavailable
- Symptoms: Installed Supabase CLI projects-list check exits 1; sanitized output indicates authentication unavailable. No DB/export/Storage permissions verified.
- Evidence: No relevant credential environment variables, repo env configuration, project-ref or explicitly checked credential files present. No export attempted.
- Tried: Read-only CLI version/authentication and bounded file-presence checks; suppressed raw CLI response. No tokens/passwords exposed, production mutations or login automation.
- Next diagnostic step: Owner completes local CLI login and confirms production project reference; verify secure DB credentials and export permissions separately. Docker/WSL runtime remains unavailable; no install/admin changes authorized without separate approval.
