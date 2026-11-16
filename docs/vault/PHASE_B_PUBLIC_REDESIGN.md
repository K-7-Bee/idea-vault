# Phase B: public cleanup and redesign

2026-11-16. Owner asked to finish the remaining work using `Futuristic Portfolio and Idea Vault UI.png` (design demo) and `Anime Cherry Blossom Lakeside Panorama.png` (hero background), with `PORTFOLIO_IDEA_VAULT_FINAL_MASTER_PROMPT.md` as the final specification. Phase A deliverables already exist (`docs/portfolio-idea-vault-audit.md`, `architecture-plan.md`, `implementation-checklist.md`, `phased-execution-plan.md`). The final prompt says to stop after each phase, so this slice is Phase B only.

## Decision recorded

The final prompt's text asks for a dark charcoal theme with a subtle cyan accent. The owner's later design demo shows a light, cherry-blossom sky portfolio using Petal Frost #ECCBD9, Alice Blue #E1EFF6, Sky Blue #97D2FB, Baby Blue Ice #83BCFF and Aquamarine #80FFE8. The demo is followed because it is the newer, explicit owner input. Pale swatches are used as fills only; text uses deeper shades of the same hues for contrast. The Idea Vault palette (tangerine, peach, beige, steel azure, Baltic blue) is not applied yet; it belongs with the Vault UI phase.

## Scope and files

- `src/app/page.tsx`: new homepage. The hero uses the supplied background, navigation is Home | About | Experience | Projects | Contact, then highlights, about, selected work, a combined experience and education timeline, current focus and contact.
- `src/app/portfolio/hero-bg.png`: copy of the supplied background (statically imported, optimized and blur-placeholdered by `next/image`).
- `src/app/portfolio/_archive/`: retired hero/falling screws, companion terminal, Three.js motor explorer and Ohm's law lab, moved and not deleted, with a README. Nothing else imported them.
- `src/app/globals.css`: `--pf-*` tokens switched to the light palette, plus hero scrim, corner brackets, cards and contact panel styles. Old `.pf-*` animation rules are left in place, unused.
- `src/app/projects/*`: follow the new tokens. Headings and cards are restyled, and the broken `/#lab` link is replaced by `/#experience`.
- `src/lib/projects.ts`: corrected the Idea Vault case study, which still said the service worker caches the vault page. That stopped being true after the approved R2 cache change.
- `tests/portfolio.test.mjs`: four regression tests (retired demos not imported and archived; nav anchors resolve; no Journal or résumé link; no `#lab` links; no outdated cache claim).

## Content rules applied

Only facts already published on the previous portfolio are used: JBNU bachelor (expected 2028), CCN diploma (2023), Altech Aluminum internship (2022), transformer factory internship (2020), innovation fair first prize, three existing projects and existing links. The demo's sample text is not copied: B.Eng. 2024 start, "Embedded systems", résumé button, verified-organization labels, AI assistance and animation focus. Journal is hidden while it has no published entries. Project covers are drawn gradients, not invented photos. Internship roles, tools and responsibilities still need owner-verified content.

## Verification (this session)

- `npm test`: 60/60 pass (56 existing + 4 new).
- `npx tsc --noEmit --incremental false` and `npx eslint src tests`: clean.
- `npm run build`: passes (13 pages; `/` static).
- Headless Chrome screenshots of `next start`: desktop at 1440px matches the demo layout, and phone layout at 520px fits with the menu button shown. Headless Chrome cannot render narrower than about 500px, so a real 360–390px phone check is still outstanding. The project detail page was also checked.

Not checked: real devices, screen reader/keyboard walk-through, Lighthouse, deployed site. Nothing was deployed and no data or schema was touched.

## Rollback

Restore `src/app/page.tsx`, `globals.css`, `projects/*` and `lib/projects.ts` from git, move the four files out of `_archive/` back to `src/app/portfolio/`, and remove `hero-bg.png` and `tests/portfolio.test.mjs`.

## Next gate (needs owner approval)

Phases C–E (Portfolio Manager, Completed+Published bridge, Engineering Lab, Story Studio, Gemini, Drive) need additive schema migrations. Root instructions forbid migrating before the preservation gate passes, and that gate still lacks the blocked attachment bytes, per-device outbox exports and an independent off-disk recovery copy. The Vault dashboard redesign from the demo's right half can be done as a UI-only slice on existing data (counts by the current raw/exploring/building/done stages). It must not rename stages to Exploring/Analyzing/Building/Completed without a reviewed migration.
