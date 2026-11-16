# Backup setup — plain-language checklist

Current result (2026-11-16): the encrypted logical database snapshot is verified and all 44 captured table schemas exist in the isolated local recovery database. 42 tables match every original row; two managed migration histories retain actual local execution timestamps with matching source migration identities. Nine ideas and two attachment metadata records are recovered. Production is unchanged. See [current recovery status](SERVICE_RECOVERY_STATUS.md).

**Full preservation remains incomplete:** attachment bytes are excluded under the owner's explicit download block, device browser exports are not independently verified, and portable/off-disk key recovery and API/application workflows remain unverified. Keep browser data and all private recovery artifacts intact. The setup checklist below is historical; Docker, secure snapshot access, destination protection and local database recovery have since been established.

Confirmed storage direction: Supabase keeps idea text, tags and status. Google Drive will store attachments and recordings. Existing Supabase attachment bytes stay intact until backup and any later approved transfer are verified.

Confirmed by the owner on 2026-11-14:

- **Production Vault:** https://kaushik-kamal.vercel.app/vault
- **Devices:** both phone and PC. Each browser profile used on either device needs its own pending-data check/export. Browser names/profiles and pending queue counts remain unknown.

Still needed:

1. **Secure Supabase/export access:** production project identity and authenticated exports of records, schema/policies and attachment bytes. The website URL alone does not grant database access. Do not send passwords or keys in chat.
2. **A private backup folder:** confirmed destination: `S:\Road to Storm K7\codex test` (exists; privacy/capacity not yet verified).
3. **A separate test system:** a separate local PostgreSQL instance with compatible Supabase dependencies. A second cloud project or paid plan is not required. See [local backup plan](LOCAL_BACKUP_PLAN.md); setup awaits approval.

An unauthenticated check of the supplied URL through the web tool was unsuccessful (tool reported the URL inaccessible). This is not evidence that the site is down or that its login protection passes/fails. No authenticated page was opened and no device queue was accessed or synced.

Do not paste passwords or API keys into chat. Keep existing browser data intact. Avoid clearing site data, reinstalling the app, changing the website address, or replaying pending deletion requests while we establish the backup.

After these details are known, the next step is to export the real records and files securely, check that all expected ideas and attachments are present, and test restoring them into a separate test system. Only then can database changes begin.

Technical instructions: [preservation tools](../../scripts/vault/README.md). Current results and limitations: [PROGRESS](PROGRESS.md).


Device matrix confirmed 2026-11-15: Windows Chrome and Opera; iPhone Safari; iPad Safari; Android Chrome optional. Pending/unsaved capture status per profile still needs confirmation. Earlier two-device notes are historical.
