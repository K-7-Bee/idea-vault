# Final handover: overnight run, 2026-11-24

**Read this first.** Everything below happened on the branch `vault-audit-and-planning-docs`.

**Nothing was deployed.** `main` and the live site are unchanged since 6E (`bc48972`). No live database change was made, and no credential was touched.

## Executive summary

- **All planned work that didn't need you is now built and tested:**
  - **Phase 7 (iPad and Pencil):**
    - **7A:** sketching on storyboard shots;
    - **7B:** annotating images;
    - **7C:** visual boards.
  - **Phase 5B:** assistant proposals that you accept or reject one by one.
- **A security audit and a bug audit** found no critical or high issues. They found and fixed **9 app bugs**, five of them reachable on a real iPad or slow device:
  - text typed into the login form before the page finished loading was ignored;
  - straight Pencil strokes lost their pressure shape;
  - fast board-card drags landed short;
  - a board title typed before the page finished loading was ignored;
  - export failed with a misleading message when Drive uploads are off.
- **Checks passing:** SQL 13/13 suites (432 checks), unit tests 229/229, all new browser specs in Chromium and the drawing and board specs in WebKit, accessibility and contrast with the new pages, and the homepage budget. CI was green on 7A and 7B; see "CI" below for the last commit.
- **Your call before going live:** applying migrations **018** and **019** to the live database, then the go-live.
- **Still blocked on you:** 5C, the domain, Drive Production, CSP enforcement (date), and checking that sign-ups are off.

## Completion status

| Phase | Status | Evidence |
| --- | --- | --- |
| 0–6E | Live (before tonight) | PROGRESS.md |
| **7A** sketching | **Built, not live** | `564c58d`, CI green; sketch spec (Chromium 7/7, WebKit 3/3) |
| **7B** annotation | **Built, not live** | `94a11ba`, CI green; annotate spec (Chromium 2/2, WebKit 1/1) |
| **7C** boards | **Built, not live** | `0261fa4`; board spec (Chromium 3/3, WebKit 1/1); SQL 24 checks |
| **5B** proposals | **Built, not live** (and 5A is off in production) | `a185e7c`; 6 unit and 3 browser tests |
| **5C** file text to AI | **Not built: blocked** | It contradicts your approved privacy page (V-077) |
| Domain, Drive Production | Blocked: you | Steps were given 2026-11-23 |
| CSP enforcement | Blocked: on or after 2026-11-30 | RUNBOOK, Switches |

## What you can do now (once live)

- **Sketch on a shot or scene:**
  1. Story or hybrid project → **Structure** tab → **+ Sketch** on a scene or shot.
  2. Draw with the Pencil: pressure shapes the line, and once the Pencil is used, finger touches are ignored. You also get an eraser, arrows, labels, undo and redo, and clear (which can be undone).
  3. It saves automatically ("Saved"). Unsaved work survives a reload or going offline. Editing on two devices makes a copy instead of overwriting.
  4. **Export PNG to Drive** makes a new file on the shot.
- **Reorder shots** by dragging the **⠿ Drag** handle (pen, finger or mouse); the ↑/↓ buttons still work.
- **Annotate an image:** **Annotate** on a character, shot or Files-tab image. The original is never changed. An **Annotated / Original** toggle shows your marks over the thumbnail. Export makes "(annotated).png".
- **Boards:**
  1. Project **Overview** → **Boards** → **New board**.
  2. Add notes, or cards showing images, sketches, scenes or shots, characters or lab entries.
  3. Drag cards by the ⠿ handle, or use the arrow keys on it. Connect cards with labels. Zoom buttons; a **List** view.
- **Assistant proposals:** Assistant tab → tick records → **Suggest items** → **Accept** or **Reject** each one. Nothing is saved until you accept.

## Bugs fixed and security findings

- **Bugs:** [BUG_FIX_REPORT.md](BUG_FIX_REPORT.md), with B-1 to B-9 (app) and T-1 to T-6 (test tooling).
- **Security:** [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
  - **Fixed:** S-1 (editor ignored the uploads switch) and S-2 (CSP report size check order).
  - **Accepted:** S-3 (host-derived site address on Vercel) and S-5 (session cookie readable by scripts, which the library requires).
  - **Open:** S-4 (sign-in rate limits: check Supabase), S-6 (dev-only advisories) and S-7 (5C policy).
- **No secrets** were found in the git history or in browser bundles. Production dependencies have 0 vulnerabilities.

## Performance

[PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).
- The homepage is within budget. Script +187 B; stylesheet +993 B, leaving about 4% headroom.
- The drawing editor adds less than 1 KB of script over the project page. None of the new code loads on public pages.

## Database migration requirements (you approve, then I or you apply)

| Migration | Adds | Destructive? |
| --- | --- | --- |
| `supabase/018_drawings.sql` | `drawings` table, its indexes, a unique key on `project_files (project_id, id)`, a trigger, owner-only RLS | No: additive and re-runnable |
| `supabase/019_boards.sql` | `boards`, `board_cards`, `board_links`, a unique key on `drawings (project_id, id)`, triggers, owner-only RLS | No: additive and re-runnable |

**Go-live order** (RUNBOOK, Go-live):
1. **Back up** with your passphrase. The weekly task isn't registered yet; see 6E.
2. **Read-only pre-check:** `select count(*) from project_files` etc.
3. **Apply 018, then 019:** `supabase db query --remote=<ref> --yes --file supabase/018_drawings.sql`, then the same for 019.
4. **Read-only post-check:** RLS on for the four tables, no anon grants, counts unchanged.
5. **Deploy:** fast-forward `main` to the branch head (after CI is green).
6. **Check:** `npm run check:live`, then do the iPad checklist below.

**Rollback:** promote the previous Vercel deployment. The new tables are additive; the old app ignores them, and the data stays.

## Manual actions for you

1. **Decide on go-live** for 7A–7C and 5B: say "go live" and I'll do steps 1–6. Step 1 needs your backup passphrase.
2. **iPad checklist (after go-live):**
   1. In a story project, add a sketch on a shot. Draw with the Pencil, pressing harder and lighter, and check the line gets thicker and thinner.
   2. Rest your palm on the screen while drawing; it shouldn't draw.
   3. Erase, undo, redo; wait for "Saved"; close the tab and reopen.
   4. Turn on airplane mode, draw, reload: "Restore unsaved changes" should appear. Reconnect and it saves.
   5. Drag a shot to reorder it. Annotate a character image. On a board, drag a card with your finger.
3. **Supabase:** confirm sign-ups are off and check Auth rate limits (S-4). Optionally enable CAPTCHA.
4. **Dependabot security updates:** turn them on in the repository settings (6E).
5. **Weekly backup:** run `backup-scheduled.ps1 -Action Setup`, then `-Action Register` (6E).
6. **Decide on 5C**, keeping or changing the privacy promise.
7. **Domain → Drive Production; CSP enforcement** on or after 30 Nov.

## Git

- **Branch:** `vault-audit-and-planning-docs`, pushed to GitHub. Not merged into `main`.
- **Checkpoint before tonight:** tag `overnight-start-2026-11-24` (`bc2dc8a`), local only.
- **Tonight's commits:**
  - `e02570a` 7A: drawings table (migration 018) and its SQL suite
  - `564c58d` 7A: Pencil sketching on storyboard shots
  - `94a11ba` 7B: annotation
  - `0261fa4` 7C: boards
  - `a185e7c` 5B: proposals
  - `127115c` audit fixes
  - documentation commits after these
- **Undo tonight's work entirely** (branch only, nothing live to roll back): `git reset --hard overnight-start-2026-11-24`, then `git push --force-with-lease`. Only do this if you really want it gone. The tag stays as a reference either way.

## CI

- 7A `564c58d`: **green** (run 45313627530).
- 7B `94a11ba`: **green** (45315498831).
- 7C and 5B runs were cancelled by the next push, which is how the CI is set up.
- Audit-fix commit `127115c`: run 45319328121. The result is recorded at the end of this file.

## Verified vs assumed

- **Verified** (tests that ran and passed): everything in [TEST_REPORT.md](TEST_REPORT.md).
- **Assumed or not verified:**
  - real iPad behaviour;
  - live Supabase with 018 and 019;
  - real Google Drive export;
  - real Gemini following the JSON format;
  - the editor's uploads-off state in a browser;
  - the Firefox full suite.

## Recommended next steps

1. Review the handover and the reports.
2. Go live with 7A–7C and 5B, after the backup and the two migrations.
3. Do the iPad checklist.
4. Enforce the CSP on or after 30 Nov.
5. Connect the domain, then Drive Production.
6. Later: a shared "read typed value" input hook for all Vault forms (B-1 class); per-scene loading of sketch previews for very large storyboards.
