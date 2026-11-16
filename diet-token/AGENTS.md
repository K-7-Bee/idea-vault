# AGENTS.md

Project memory lives in `diet-token/`. Goal: a correct, verified result at the lowest total cost. Each memory file's header comment defines its format; follow it when you write there.

Auto-commit: on (the user may set this to off)

## 1. What to read, and when

Read nothing from `diet-token/` unless a row applies. Read a file at most once per session.

| Situation | Read |
|---|---|
| LIGHT task (section 2) | Nothing |
| User says "continue" or "resume" | Only the Checkpoint block at the top of `task-todo.md` |
| New STANDARD or HARD task | `task-todo.md`; add the task with the next ID before starting |
| Task touches existing code, or you need a run or test command | `previous-work.md` |
| Task is a bug fix, or you hit an error | `errors.md`, before investigating |
| Task may repeat or depend on finished work | `grep` a keyword in `task-complete.md`; do not read it whole |
| The files above do not explain old work | `grep` in `archive.md`; never read it whole |

If `previous-work.md` is empty and the project has code, fill it once from a directory listing, not by opening every file.

## 2. Model suggestion (advisory)

You cannot switch models; the user does, with `/model`. At the start of a task print one line and keep working:

`MODEL: STANDARD -> Codex gpt-6.1-terra, medium effort | Claude Code Sonnet`

Pause for the user's `go` only when the task is HARD and their message does not already contain `go`.

| Tier | Use it for | Codex | Claude Code |
|---|---|---|---|
| LIGHT | Typos, renames, comments, formatting, docs, config values, one-line fixes, quick lookups | `gpt-6-luna`, low effort | Haiku |
| STANDARD | A feature in 1-3 files, a bug with a clear error message, writing tests, small refactors, explaining code | `gpt-6.1-terra`, medium effort | Sonnet |
| HARD | Features across many files, bugs with no clear cause, planning and architecture, refactors across modules, timing, interrupt or concurrency problems | `gpt-6.1-sol`, medium effort (high for planning) | Opus |
| LAST RESORT | The HARD model failed twice on the same task | GPT-6 Astra (choose in `/model`) | Fable |

- Model names last checked: 2026-11-15. The user keeps this table up to date.
- Pick the lowest tier that fits. Suggest the next tier only after two failed attempts on the same task.
- Name only models from this table. If one is missing from `/model`, suggest the nearest tier that is listed there.
- HARD tasks: write numbered plan steps under the task in `task-todo.md` before the pause.

## 3. Task states: evidence required

- **implemented**: code changed, nothing run.
- **tested**: a test, build or run command was executed in this session and passed. Record the command and its result.
- **verified**: every acceptance criterion was checked against evidence: command output, observed behaviour, or the user's confirmation. For changes with no runtime effect (docs, comments), a re-read of the diff counts.

Never write "tested" or "verified" without evidence recorded from this session. If a check could not be run, the state is "implemented" and you say why. A failed check is reported, never left out.

## 4. Working rules

- Before editing, run `git status --short`. Never revert, overwrite, reformat or stage changes you did not make.
- Ask before acting when: an action is destructive or cannot be undone, your edit would overwrite changes you did not make, the requirements are unclear in a way that changes the result, or the change contradicts a decision in `previous-work.md`. Otherwise proceed without asking.
- Leave behaviour outside the task unchanged. Other ideas go in one line at the end.
- Find code with `rg` / `grep` and the file map. Read only the lines you need. Do not re-read an unchanged file.
- Edit with small patches, not whole-file rewrites.
- Not opened by default: `node_modules/`, `.git/`, build and dist folders, virtual environments, lock files, logs, data and media files. When the task needs one, inspect it with search, `tail` or a line range, never whole.
- Limit command output where it starts: quiet flags, or pipe to `tail -n 30`.
- Prefer one targeted command over several exploratory ones. Do not re-run a build or test when nothing relevant changed.
- After a failed fix, find the likely cause before trying again; never repeat the same attempt. After a second failed fix, stop editing, record what was tried in `errors.md`, and continue only if new evidence points to a different cause. After a third, stop and report the blocker.

## 5. Checkpoints and resume

Rewrite the Checkpoint block in `task-todo.md` after each plan step and before any pause or stop with work unfinished.

To resume: read the Checkpoint only, run `git status --short` to confirm the files match it, then continue from "Next action". Read the task's own entry only if the Checkpoint lacks something you need. If the files do not match the Checkpoint, say so before doing anything.

## 6. Finishing a task

1. Check the acceptance criteria. If the change can affect behaviour, run the verified test command from `previous-work.md`. Set the state by section 3.
2. `task-todo.md`: a task leaves only when it is verified or the user accepts it as is; then reset the Checkpoint to "Task: none". Otherwise keep it, with its status and a "Next action" that says what is still to check.
3. `task-complete.md`: for a task that left `task-todo.md`, and for a LIGHT task that changed behaviour or configuration, append one line without reading the file: `ID | date | state | what was done | evidence | commit` (ID is `L` for a LIGHT task).
4. `errors.md`: add or update unresolved errors. For a fixed one, move its entry unchanged to `archive.md` and leave one line under "Lessons".
5. `previous-work.md`: update only if the architecture, file map, decisions or commands changed.
6. If Auto-commit is off, commit only when the user asks. If it is on, commit only if all are true: the state is tested or verified, no merge or rebase is in progress, and you can stage this task's files alone (`git add <paths>`, never `-A`). Message: `T3: summary`. Never push. Otherwise leave the work uncommitted and say so.
7. Reply in 6 lines or fewer by default; use more for a failure, a blocker, or when the user asks. Always include: state with its evidence, what changed, what was not checked, open errors, commit hash or "uncommitted". If the next task is unrelated, suggest a new session.

## 7. Memory upkeep

- Nothing is deleted: lines move to `archive.md` unchanged.
- `task-complete.md` over 30 lines (check with `wc -l` after appending): move the oldest 20 to `archive.md`.
- "Lessons" in `errors.md` over 15 lines: move the oldest to `archive.md`.
- `previous-work.md` over 60 lines: move the oldest "History" lines to `archive.md`. Remove a decision or command only when the user says it changed.
