# Bug fix report (2026-11-24)

Bugs found tonight while building and testing 7A, 7B, 7C and 5B, and during the audit. Each was reproduced by a failing test or a probe first, fixed at the root, then re-tested. Problems in the *tests* (not the app) are listed separately at the end so the two aren't confused.

## Application bugs fixed

| # | Bug | Root cause | Fix | Files | Regression test |
| --- | --- | --- | --- | --- | --- |
| B-1 | Text typed into the **login** form before the page finished loading was ignored. Logging in failed silently on WebKit, and could on a slow iPad. | React's state for controlled inputs is empty until hydration, and the submit sent that empty state. | Read the fields' current values at submit. The inputs still have no `name`, so a pre-hydration submit can't leak the password into the URL. | `src/app/login/page.tsx` | WebKit sketch, annotate and board specs (log in through retries); all Chromium specs |
| B-2 | A straight Pencil stroke lost its **pressure** shape (thick and thin parts) once saved. | Point thinning considered position only, so a straight line kept just its two end points. | Thinning also keeps points where pressure departs from the straight-line estimate by more than 6%. | `src/lib/drawing/format.ts` | `tests/drawing.test.mjs` ("keeps the pressure shape of a straight Pencil stroke"); `sketch.spec.ts` pressure range |
| B-3 | A sketch was treated as an **annotation** (no Background or Shape controls; annotation wording on conflicts) when `base_file_id` was absent rather than `null`. | A strict `!== null` check. | `Boolean(initial.base_file_id)` | `drawings/[drawingId]/editor.tsx` | `sketch.spec.ts` (background and conflict tests) |
| B-4 | Dragging a **board card** quickly could leave it short of where it was dropped (WebKit: 100 px instead of 300). | The release handler read the card position from the last render; WebKit delivers the release before the final move renders. | The live drag position is kept in a ref and used on release. | `boards/[boardId]/board-editor.tsx` | `board.spec.ts` in WebKit (repeated) and Chromium |
| B-5 | A **board title** typed before the page finished loading was ignored, and "New board" stayed disabled. | Same as B-1. | Read the field at submit; the button no longer depends on React state. | `boards/boards-panel.tsx` | `board.spec.ts` (WebKit) |
| B-6 | **Upload image** and **Export PNG** in the drawing editor failed with "couldn't be made or saved" when Drive uploads are switched off. | The editor ignored the `driveUploads` switch that the upload route enforces. | Upload is hidden and Export is disabled with an explanation while uploads are off. | `drawings/[drawingId]/editor.tsx` | Fixture runs with uploads on (Export is tested); the off state was checked by reading the code. **No browser test for the off state.** |
| B-7 | `/api/csp-report` read an unbounded body before its size check. | Order of operations. | Check `Content-Length` first. | `src/app/api/csp-report/route.ts` | Not separately tested (one-line guard). |
| B-8 | Text selection started when **dragging a shot** with a mouse, instead of the drag. | Chromium doesn't stop text selection when `pointerdown` is cancelled. | `onMouseDown` cancel on the handle, plus `select-none` on cards during a drag. | `record-section.tsx` | `sketch.spec.ts` storyboard drag |
| B-9 | **Precaution, not a confirmed bug:** export used `HTMLImageElement.decode()`, which I suspected fails for SVG in Safari. | Not confirmed: the WebKit failure turned out to be the test's request blocking (see T-4). | Images now load through `onload`, which works in every browser. | `editor.tsx`, `drawings/annotate.tsx` | `annotate.spec.ts` export in WebKit |

## Test-infrastructure problems fixed (not app bugs)

| # | Problem | Fix |
| --- | --- | --- |
| T-1 | WebKit clicks can land before the page finishes loading (login, project tabs, List view) | The new specs retry until the action takes effect (`expect(...).toPass`), and the retry stops once it has worked |
| T-2 | The Settings page tidies `?drive=connected` out of the address before WebKit's URL check saw it | Wait for the navigation itself (`waitForURL` together with the click) |
| T-3 | A shot's drag handle was off-screen, so the mouse never reached it | Scroll the handle and target into view first |
| T-4 | WebKit routes `blob:` URLs through the tests' "block everything outside" rule, so export images were blocked | Allow `blob:` and `data:` in the drawing and board specs |
| T-5 | The contrast check measured text clipped by a scrolling area (the board) against pixels outside the clip; ratio 1.05 in dark mode | Skip text that isn't fully inside every clipping ancestor; it is measured when scrolled into view. The canary still proves detection. |
| T-6 | The fixture didn't know the new tables | Added rules that mirror migrations 018 and 019 |

## Known limitations (not fixed)

- **The hydration race exists in other Vault forms.** B-1 and B-5 fixed the two places that block the first step (login, new board). Other forms (adding records and so on) behave the same if someone types before the page finishes loading: the text shows but isn't used until they type again. No data is lost or sent wrongly. A general fix would be a shared input hook; that's left for a later change.
- **Firefox stall:** Firefox occasionally never fires `load` on a rendered page in the local and CI runs. Retries handle it; it isn't reproduced in a 108-navigation probe (6E).
- **Pre-existing lint warning:** `tests/browser/vault-journal.spec.ts:62`, an unused `page` (test file only).
