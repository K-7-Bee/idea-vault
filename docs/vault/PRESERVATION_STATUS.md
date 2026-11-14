# Backup setup — plain-language checklist

The app and your saved ideas/files have not been changed. Backup tools are prepared, but **your real data has not been backed up or restored yet**.

Confirmed storage direction: Supabase keeps idea text, tags and status. Google Drive will store attachments and recordings. Existing Supabase attachment bytes stay intact until backup and any later approved transfer are verified.

Confirmed by the owner on 2026-11-14:

- **Production Vault:** https://kaushik-kamal.vercel.app/vault
- **Devices:** both phone and PC. Each browser profile used on either device needs its own pending-data check/export. Browser names/profiles and pending queue counts remain unknown.

Still needed:

1. **Secure Supabase/export access:** production project identity and authenticated exports of records, schema/policies and attachment bytes. The website URL alone does not grant database access. Do not send passwords or keys in chat.
2. **A private backup folder:** a folder outside this project where encrypted backup files can be saved.
3. **A separate test system:** an isolated Supabase project for proving the backup can be restored safely.

An unauthenticated check of the supplied URL through the web tool was unsuccessful (tool reported the URL inaccessible). This is not evidence that the site is down or that its login protection passes/fails. No authenticated page was opened and no device queue was accessed or synced.

Do not paste passwords or API keys into chat. Keep existing browser data intact. Avoid clearing site data, reinstalling the app, changing the website address, or replaying pending deletion requests while we establish the backup.

After these details are known, the next step is to export the real records and files securely, check that all expected ideas and attachments are present, and test restoring them into a separate test system. Only then can database changes begin.

Technical instructions: [preservation tools](../../scripts/vault/README.md). Current results and limitations: [PROGRESS](PROGRESS.md).
