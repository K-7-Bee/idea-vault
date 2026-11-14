# Phase 1 previews

**Latest review: portfolio hero only.** Open [hero-preview.html](hero-preview.html), or [the running local preview](http://127.0.0.1:4173/hero-preview.html). Read [HERO_REVIEW.md](HERO_REVIEW.md) for the supplied illustration, optimized files, screenshots and verification. Main application changes await approval. `fidelity-draft.html` preserves an unfinished broader correction from before the request was narrowed; it is not the current approval target.

Open [preview.html](preview.html) in your browser. Use the top **Portfolio / Idea Vault** links to switch concepts, then resize the window for mobile/tablet layouts.

The preview uses your exact palettes and existing public text. It does not load your private ideas, save text, upload files or connect to Supabase/Drive. Planned features are explicitly labelled.

See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for token values, contrast calculations, component reuse, integration steps and verification limitations. Review approval is required before applying this design to the existing website.

## Verified local preview

- [Portfolio](http://127.0.0.1:4173/preview.html#portfolio)
- [Idea Vault](http://127.0.0.1:4173/preview.html#vault)

If the server is not running, from the repository root use `python -m http.server 4173 --bind 127.0.0.1 --directory docs/design`. Keep that terminal open. These are PC-local addresses, not public/iPad URLs.

Read [DESIGN_REVIEW.md](DESIGN_REVIEW.md) for successful browser captures, desktop/iPad-size/mobile results, remaining design issues and reference comparison. The earlier failed-capture limitation has been investigated; screenshots are now available under `verification/`. Actual iPad Safari has not been tested.
