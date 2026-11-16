# Vault UI: dashboard shell and palette

2026-11-16. The owner said "proceed" after Phase B; this is the next step offered then, a UI-only redesign of the private Vault from the right half of `Futuristic Portfolio and Idea Vault UI.png`. No schema, data, auth, sync, outbox or service-worker change.

## Scope and files

- `src/lib/vault-stats.ts` (new): a function with no side effects that summarizes the idea index the page already loads. It counts the existing raw/exploring/building/done stages, keeps unknown statuses as "other" so totals reconcile, counts ideas in the last 7 days (same rolling window Capture uses) and buckets six calendar months in UTC.
- `src/app/vault/dashboard.tsx` (new, server component): four stat cards (Ideas, Exploring, Building, Done), monthly activity line chart (SVG, with a screen-reader caption listing the numbers), stage donut with counts/percentages and a "+ New idea" link to the composer.
- `src/app/vault/sidebar.tsx` (new): desktop (≥1280px) sidebar with "IDEA VAULT 3.0", Dashboard/Ideas links, the final prompt's other modules listed as **Planned** (not links), and the owner card with the existing Log out button. Below 1280px there's a top bar with the same links and Log out.
- `src/app/vault/page.tsx`: layout now uses sidebar + main. `VaultContent` renders `Dashboard` above the unchanged `Capture` (wrapped in `#ideas`). Auth/owner checks, read-failure handling and Capture props are unchanged.
- `src/app/globals.css`, `src/app/vault/layout.tsx`: Vault/login palette changed to Atomic Tangerine, Peach Glow, Beige, Steel Azure and Baltic Blue. Dark mode is the navy workspace; light mode is beige. Text on tangerine is dark, because white on #FF6B35 fails contrast.
- `tests/vault.test.mjs`: the success-path test now also asserts the dashboard receives complete stats, and a new test covers stage counts, unknown status, invalid date, 7-day window and UTC month boundaries.

## Not changed on purpose

Stages are not renamed to Exploring/Analyzing/Building/Completed; that needs a reviewed migration. There are no fake Engineering Lab/Story Studio/Portfolio Manager screens, no "Published" count (no publishing model exists) and no Google Drive or Gemini actions. Dashboard figures are a server snapshot taken at page load. Capture's own counters still update live.

## Verification (this session)

- `npm test`: 61/61 pass.
- `npx tsc --noEmit --incremental false` and `npx eslint src tests`: clean. `npm run build` passes.
- Visual: a temporary route rendered the real sidebar and dashboard with synthetic numbers under `next start`. Headless Chrome screenshots were taken in dark mode at 1440px and light mode at 800px, then the route was deleted. The authenticated `/vault` page itself was not opened (no login or production data used), so Capture inside the new shell, a real phone and keyboard/screen-reader use are still unchecked.

## Rollback

Revert `page.tsx` layout and the `:root:has(.vault)` tokens, delete `dashboard.tsx`, `sidebar.tsx` and `vault-stats.ts`, and restore the original success test assertion. No data is involved.

## Commit status

Left uncommitted: `src/app/vault/page.tsx` and `tests/vault.test.mjs` already held earlier uncommitted R2 work, so this slice can't be committed separately without bundling that work.
