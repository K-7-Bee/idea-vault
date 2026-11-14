# Portfolio hero approval preview

2026-11-15. This is a standalone browser preview, not an application change. The latest instruction narrows the active review to the public hero with the supplied illustration. Phase 2 is not approved.

Open **http://127.0.0.1:4173/hero-preview.html** on this PC. If needed, run this from the repository root and keep the terminal open:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory docs/design
```

Alternatively, open `docs/design/hero-preview.html` directly in a browser. All assets are local; no external font or image service is needed. The localhost address is not a public link and is not reachable from a separate phone or iPad.

## Proposed hero

- Uses the exact user-supplied `Anime Cherry Blossom Lakeside Panorama.png`, with no generative modification. The original is preserved.
- Full-width artwork, character on the right, HTML headline/introduction/actions on the left, and a directional translucent navy gradient for readability.
- Reuses existing headline wording, introduction, logo, About/Work/Lab/Journey/Contact destinations and terminal entry point. Adds the requested secondary About action. Navigation and terminal controls give explicit review feedback because this file contains only the hero.
- Keeps the supplied five-color portfolio palette. The anime character remains decorative, not a verified personal portrait.
- Desktop uses `object-fit: cover`. iPad portrait uses a rightward focal position to keep the face inside the frame. Mobile deliberately puts copy in an extended sky area above a full-width image region; the character's head stays visible without placing text across the face. A soft CSS mask blends the image into the sky. The tall mobile hero requires scrolling to see all of the artwork.
- No text is baked into the image. CSS supports reduced motion, visible keyboard focus and touch controls at least 44 px tall.

## Image optimization

Original: 1,672 × 941 PNG, **2,164,110 bytes**. Derived locally with the installed Sharp encoder at WebP quality 88, effort 6; no artwork alterations or aspect-ratio distortion:

| Asset | Dimensions | Size | Reduction from original |
| --- | --- | --- | --- |
| `assets/portfolio-hero-1672.webp` | 1672 × 941 | 223,692 bytes | 89.7% |
| `assets/portfolio-hero-960.webp` | 960 × 540 | 104,702 bytes | 95.2% |

The `<picture>` selects the smaller version at widths up to 700 px. The hero image loads eagerly with high fetch priority, includes intrinsic dimensions, and uses async decoding. Browser captures were inspected for visible quality problems; none stood out at the tested sizes. Very large/high-density displays may benefit from a higher-resolution original, which is not supplied.

## Browser evidence

Successful local Chrome captures and DOM checks using `verify-hero.mjs`:

| Layout | Viewport | Screenshot |
| --- | --- | --- |
| Desktop | 1440 × 1000 | [Desktop](verification/hero/desktop.png) |
| iPad landscape size | 1180 × 820 | [Landscape](verification/hero/ipad-landscape.png) |
| iPad portrait size | 820 × 1180 | [Portrait](verification/hero/ipad-portrait.png) |
| Mobile | 390 × 844 | [Mobile](verification/hero/mobile.png) |
| Small mobile | 320 × 740 | [Small mobile](verification/hero/small-mobile.png) |

All five widths: no horizontal page overflow, both images loaded, no detected JavaScript exceptions, and no visible control below 44 px in height. Mobile menu opens; Escape closes it and returns focus. Keyboard Tab produces a visible 3 px outline. Reduced-motion mode removes button transitions. Section buttons explain the isolated preview. No external requests or local/session-storage writes were observed. Raw results: [results.json](verification/hero/results.json).

The earlier browser capture failure was a sandbox browser/GPU child-process launch problem, also occurring on a blank page. This review uses the already-running isolated Chrome session with a separate profile; captures now work. It does not use the owner's signed-in browser profile.

These are Chromium viewport/touch emulations, not tests on physical iPad/iPhone Safari. Screen-reader behavior, browser zoom, every intermediate width and formal WCAG conformance have not been exhaustively audited. Text and focus were visually inspected; there is no claim of a full accessibility certification.

## Approval boundary

No edits to `src/`, `public/`, package manifests, authentication, database, project data or deployment. Existing uncommitted application-independent work is preserved. The original combined preview was restored byte-for-byte after the user narrowed this request; the unfinished wider fidelity revision is retained separately in `fidelity-draft.html` and is **not verified or proposed for approval here**. Existing Vault preview and screenshots are unchanged.

Approval requested for this hero composition and mobile treatment only. Applying it to `src/app/portfolio/hero.tsx` remains a separate step after approval; the actual application integration must preserve existing section anchors and terminal behavior and be tested in context. No Phase 2 work has started.
