# Phase 1 design review

2026-11-15. Owner approved preparing visual previews with "ok" after the audit/design plan. This approves Phase 1 review artifacts, not changes to application routes, data, authentication or publication.

Open [preview.html](preview.html) in a browser. Switch between Portfolio and Idea Vault using the top review navigation. Resize the browser to inspect layouts. The file is self-contained: no external fonts, images, network calls, storage, uploads or microphone access. Buttons that would mutate data instead explain their preview-only behavior. Typed text is temporary and is not saved.

## Direction and content

Reference: `Futuristic Portfolio and Idea Vault UI.png`, inspected alongside the latest user prompt. Retain its blue public identity, distinct warm-accented private identity, hero hierarchy, selected work, workspace sidebar and showcase queue. Avoid its fictional projects, personal portrait, unverified dates, statistics and progress bars.

Public: Alice Blue page, confident navy typography, aquamarine actions, restrained geometric decoration and roomy case-study cards. Existing public source text supplies the concept. Numbered typographic panels are deliberate placeholders for missing approved images, not fabricated project photography. The mock shows two existing cases to evaluate the composition; it does not delete the third case from the app or establish publication eligibility. Journal, resume and Current Focus remain absent until approved content exists.

Private: deep navy base, quieter blue panels, orange primary action, beige text and peach secondary accents. Quick capture remains the main working concept. Show unavailable counts as unavailable, not zero. Planned modules are labelled for this review only; they must not ship as misleading live destinations. Existing idea stages remain separate from the required project lifecycle.

## Exact palette and semantic tokens

| CSS variable in preview | Value | Semantic role |
| --- | --- | --- |
| `--petal` | #ECCBD9 | Public decorative/card accent |
| `--alice` | #E1EFF6 | Public background |
| `--sky` | #97D2FB | Public section/media accent |
| `--baby` | #83BCFF | Timeline/selection accent |
| `--aqua` | #80FFE8 | Public primary action surface |
| `--orange` | #FF6B35 | Vault primary action/selected navigation |
| `--peach` | #F7C59F | Vault secondary emphasis |
| `--beige` | #EFEFD0 | Vault foreground/light surfaces |
| `--steel` | #004E89 | Structural blue, public accent text, private selected filter |
| `--baltic` | #1A659E | Reserved navigation/information accent |
| `--navy` | #102A43 | Public text and text on bright action fills |
| `--deep` | #091C2B | Vault background |
| `--panel` | #102D43 | Vault panel |
| `--muted` | #476078 | Public secondary text |
| private secondary text | #B9D0DD | Vault supporting copy |
| `--line` | #667F92 | Public control boundary |

Supplied palette values are unchanged. Supporting neutrals are proposed additions. Not every palette colour must fill a card. Use semantic states plus labels/icons; do not rely on orange/blue alone to convey status or errors.

Calculated sRGB contrast for intended opaque text pairs:

| Text / background | Ratio |
| --- | --- |
| Navy / Alice Blue | 12.47:1 |
| Public muted / Alice Blue | 5.57:1 |
| Navy / Aquamarine | 12.12:1 |
| Navy / Atomic Tangerine | 5.16:1 |
| Beige / Steel Azure | 7.31:1 |
| Private secondary / panel | 8.88:1 |
| Peach / panel | 9.09:1 |
| Beige / Baltic Blue | 5.27:1 |

These calculations do not certify every state, translucent boundary or focus indicator. Validate actual rendered styles and focus contrast during implementation. Avoid white text on orange/pastel fills.

## Shared foundations

- Intended app typography: existing Inter for body, Manrope for headings/nav and Geist Mono for technical values. The offline HTML uses local font fallbacks; exact installed Next font appearance awaits app integration. Do not add a font package. Keep existing font consumers on `/start` intact.
- Body 16px, supporting text 13–14px, headings 18/26/32px, fluid public hero 42–88px. Tiny badges are review metadata, not critical actions.
- Spacing scale: 4/8/12/16/20/24/32/48/64px. Controls at least 44px tall. Panels 12px radius; public cards 16px; controls 8–9px.
- Public content max width 1160px; workspace max preview width 1440px. Desktop sidebar 232px. Intermediate-width sidebar 190px; collapse under 760px. Existing project's final breakpoints will be reconciled rather than introducing a second layout framework.
- Tablet portrait/mobile: menu disclosure, stacked cards, single-column workspace, full-width search. Desktop/landscape: inline public nav and sidebar where room permits. Use actual available width, not user-agent detection.
- Named fields, real buttons/links, visible focus, meaningful heading order, preview announcements, text labels and keyboard disclosure. No autoplay decoration. Finger/Pencil controls and drag alternatives belong to the later approved shared drawing component.

## Integration map after review

| Existing files | Future change |
| --- | --- |
| `src/app/globals.css` | Map existing public/Vault tokens to scoped themes; shared spacing/control rules; avoid global style leakage into `/start` or 404. |
| `src/app/portfolio/fonts.ts`, `src/app/layout.tsx` | Reuse available font variables; change loading only if measured need. |
| `src/app/page.tsx`, `portfolio/hero.tsx`, `mobile-menu.tsx` | Adopt approved public hierarchy and responsive navigation; retain genuine content. |
| `src/app/projects/page.tsx`, `[slug]/page.tsx`, `layout.tsx` | Apply approved card/case-study styles; update removed Lab links. |
| `src/app/portfolio/companion.tsx`, `motor-explorer.tsx`, `ohm-lab.tsx` | Archive before approved removal; repair dependent tips/commands/anchors, then reconsider three.js usage. |
| `src/app/vault/page.tsx`, `layout.tsx`, `capture.tsx`, existing icons | Wrap/restyle existing capture with the approved hierarchy while preserving all behavior. No new parallel capture controller. |

The master guide and Pencil addendum are present again; earlier missing-file statements in the audit are historical. Story Studio/Engineering Lab, Portfolio Manager, project schema and publishing still do not exist in this checkout. The preview is not proof of their implementation.

## Gates and rollback

Phase 1: review public/private composition, palette, typography and responsive intent. Then Phase 2 public application changes require approval of this concrete result. Later private/dashboard, Portfolio Manager and project-publication phases stop separately for review.

Before schema/data changes: secure live inventory, both device queues, actual backups and isolated restore. Preserve all existing IDs/statuses/files. Before publication: Completed AND Published, approved fields/media only, and removal from pages/metadata/media/caches on status reversal or unpublish. Existing static entries require explicit eligibility confirmation.

Rollback for this phase: remove only these new design artifacts; app and data are unaffected. Later visual rollback reverts scoped styles/components while retaining all data. Never roll back new records by dropping tables.

## Verification and remaining review

Update: the subsequent [design review](DESIGN_REVIEW.md) resolved the restricted-environment Chrome startup failure and captured both designs at five viewport sizes. It supersedes the earlier inability to verify rendering recorded below. See that report for current findings and remaining actual-device limitations.

- Inspected source palette/routes/content and reference image. No app source, tests, dependencies, schema or live records changed.
- Calculated the eight contrast pairs above using the sRGB relative-luminance formula.
- Preview source has no external resource fetches or persistent storage calls; interactions provide preview messages rather than fake successful mutations.
- Attempted headless Chrome screenshots at desktop and phone sizes; the environment produced no image artifacts. Therefore rendered appearance, overflow, focus order and visual browser behavior are **not verified**. No screenshots are claimed or supplied.
- Review in a normal browser at 390px, 768px, 1024px and 1440px before accepting. Verify tablet portrait/landscape, mobile menus, theme switching, focus and no horizontal overflow. Actual iPad Safari/Pencil testing remains a later feature gate.
- Existing 13-test/lint/typecheck/build success is from the preceding audit, not rerun as validation of HTML design artifacts. Application build is unnecessary for this standalone file.
