# Performance report (2026-11-24)

All measurements are from the production build that the browser tests make (`next build` against the synthetic fixture, Chromium, 1280 × 900, this PC). They show relative change, not real-network timings. Live Core Web Vitals weren't measured, because there's no Vercel Analytics or field data.

## Public homepage (download budget test)

The 6C baseline and allowance (+10% per resource type) are in `tests/browser/performance.spec.ts`.

| Resource | Baseline (6C) | Tonight | Change | Budget (×1.1) |
| --- | --- | --- | --- | --- |
| Document | 9,910 B | 10,170 B | +260 B (6D "Privacy" link) | 10,901 B ✔ |
| Script | 145,052 B | 145,239 B | +187 B | 159,557 B ✔ |
| Stylesheet | 16,085 B | 17,078 B | +993 B | 17,693 B ✔ |
| Font | 136,516 B | 136,516 B | 0 | ✔ |
| Image | 135,634 B | 135,634 B | 0 | ✔ |

- **Stylesheet:** the growth comes from the new Vault screens. The site has one Tailwind stylesheet, so classes used only in the Vault also ship to the homepage.
  - It's within budget, but there's now **about 4% headroom left**.
  - If the next feature pushes it over, split the Vault styles or raise the baseline deliberately.
- **Homepage scripts:** none of tonight's code is loaded on public pages. The drawing editor, `perfect-freehand`, the board and the proposals UI are Vault-only.

## Vault pages (script bytes, measured tonight)

| Page | Script |
| --- | --- |
| Project (`/vault/projects/[id]`) | 327,312 B |
| Drawing editor (`…/drawings/[id]`) | 328,145 B (+833 B) |
| Board (`…/boards/[id]`) | 327,312 B |

- Next splits code per page, and `perfect-freehand` is a few KB. So the editor costs less than 1 KB over the project page.
- No "before" exists for the drawing and board pages, which are new.

## Design choices made for performance

- **Thumbnails are thinned on the server** (`previewOf`, tolerance about 1/400 of the width). A storyboard downloads small previews, not every full sketch.
- **Saving is debounced:** 2 s after the last change, plus a 250 ms local draft write. Not on every stroke.
- **Live strokes redraw at most once per animation frame** (`requestAnimationFrame`), using coalesced pointer events where the browser provides them.
- **Size limits:** 2 MB per drawing (enforced by the database), 6,000 points per stroke and 4,000 items per drawing (editor). A warning appears at 1.5 MB.
- **Indexes for the new tables:** `drawings (project_id, unit_id, position)`, `drawings (project_id, updated_at)`, the per-image unique index, `boards (project_id, position)`, `board_cards (board_id)` and `board_links (board_id)`.
- **Boards zoom with CSS transforms** (no re-layout). Connection lines are one SVG layer.

## Remaining opportunities (not done)

- **The project page loads every drawing's thinned data** for thumbnails, up to 1,000 drawings. A project with hundreds of large sketches would make that page heavier.
  - One option is to load previews per scene when the Structure tab opens.
  - Another is to store a separate small preview column.
- **One stylesheet** for the homepage and the Vault (above).
- **Vault pages load about 327 KB of script**, shared by all Vault screens. That's unchanged by tonight's work and not investigated further.
