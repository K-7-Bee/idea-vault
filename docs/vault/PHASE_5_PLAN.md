# Phase 5 plan: Gemini assistant (5A approved 2026-11-21; live switched off 2026-11-21 as 8627786; switching on awaits the owner)

## 5A as built (2026-11-21, local only)

Built as planned, with these differences:

- **No `/api/ai/status` route.** The project page and Settings read the switch and the month's usage on the server directly; no separate endpoint was needed.
- **The browser sends only record ids.** The route reads the ticked records again from the database with the owner's session and refuses any id that isn't in the chosen mode. A changed or deleted record is refused (409), never guessed.
- **Labels are stable.** They come from creation order within each table (`L1`, `T2`, `S5`; `P1` is the project overview), so a follow-up question uses the same labels. Scenes and shots carry their full path, for example "Episode 'Pilot' › Scene 'Market' › Shot 'Close-up'".
- **Follow-up questions include the conversation's last 6 turns**, as text only. The ticked records are sent again with each question.
- **Thinking is set to "low",** and thinking tokens are billed as output: the ledger counts them, and the worst-case check adds a 4,096-token allowance.
- **Question and answer timestamps use `clock_timestamp()`.** Both are inserted in one statement, and `now()` would give them the same time and an unreliable order; the SQL suite checks this.
- **AI Studio logs requests by default** in projects created on or after 26 Oct 2026, keeping them up to 55 days. They are private to the project and not used for training. Go-live setup turns logging off, or shortens it to 7 days.
- **Not covered by a browser test:** the switched-off state. The browser fixture runs with the assistant on, so the off state is covered by unit tests of `aiSettings()` and by the route returning `off`.

Files:
- **SQL:** `supabase/017_ai.sql`.
- **Library code:** `src/lib/ai/{limits,context,citations,gemini}.ts`.
- **Route:** `src/app/api/ai/ask/route.ts`.
- **Pages:** `src/app/vault/projects/[id]/assistant-panel.tsx`, `src/app/vault/settings/ai-settings.tsx`.
- **Changed:** the project page and workspace (Assistant tab when on), the Settings page, `.env.example`.
- **Tests:** `tests/sql/phase5a-behaviour.sql`, `tests/ai.test.mjs`, `tests/browser/assistant.spec.ts`; a fake Gemini and the 017 tables in `tests/browser/api-fixture.mjs`; assistant settings in `tests/browser/app-server.mjs` (fixture key only).

**Deploy order:**
1. Apply 017.
2. Deploy with `AI_ENABLED` unset (nothing visible changes).
3. The owner adds `GEMINI_API_KEY`.
4. Set `AI_ENABLED=1` and redeploy.

**Rollback:** unset `AI_ENABLED` and redeploy, or delete the key in Google Cloud.


Phase 4 (Portfolio Manager and publishing) is complete and live. Phase 5 is the master prompt's AI work:

> "AI: Gemini via secure server-side adapter, configurable quotas and fallback behavior. Contextual suggestions for engineering and storytelling; structured evidence and exact scene/shot references for story-memory answers; no silent edits. Every proposed mutation requires review and approval. Do not assume image generation is free; verify provider capabilities and costs before enabling."

The roadmap's Phase 5 row and the AI boundary in [SECURITY.md](SECURITY.md) add:
- Selected context only, with real citations.
- Caps and retention controls.
- Accept or reject for every change, and zero unapproved mutations.
- A kill switch.

Note: `IDEA_VAULT_3_CODEX_MASTER_GUIDE.md` is not in the working tree or in git. This plan follows the final master prompt, the roadmap and SECURITY.md, as earlier phases did.

## Recommended order

| Slice | What you get | Why this order |
| --- | --- | --- |
| **5A Ask (read-only)** | An Assistant tab on each project. You choose which of the project's records to include, ask a question, and get an answer that cites those records, such as "Shot 1.2.3" or "Lab entry: Torque lesson". Modes: Engineering review, Story memory, Planning. Nothing is ever changed. | Proves the adapter, costs, privacy and citations with zero risk to your data |
| **5B Proposals** | The assistant can propose tasks, milestones or continuity notes. Each proposal is shown as a list where you Accept or Reject item by item; accepted items are saved through the normal version-checked writes. | Needs 5A's adapter and trust in its output first |
| **5C File text (later, optional)** | Include the text of selected PDFs or Drive documents as context | Extraction is a separate risk (size, parsing, injection); the roadmap keeps it a separate approval |

**I'm asking for approval of 5A only**, plus the decisions below. 5B and 5C will be presented with exact files before any code.

## What Google offers today (checked 2026-11-21 on aistudio.google.com; prices change)

- **Data use (most important):**
  - On the **free tier**, Google "uses the content you submit … and any generated responses to provide, improve, and develop" its products, and "human reviewers may read, annotate, and process your API input and output."
  - On the **paid tier**, Google "doesn't use your prompts or responses to improve our products". It logs them "for a limited period of time" only to detect policy violations.
  - Your Vault holds private notes, so this decides the tier.
- **Prices per 1M tokens** (input / output):
  - Gemini 3.8 Flash: $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50.
  - Gemini 3.5 Flash-Lite: $0.30 / $2.50.
  - Larger models (Gemini 4 family): $1.50–$3.00 / $7.50–$15.00.
  - Gemini 2.5 Pro and 2.5 Flash are deprecated; their requests reroute on 1 Dec 2026.
- **Image generation** isn't available on the free tier at all, and is not part of Phase 5.
- **Terms:** the API requires users to be **18 or older**. South Korea and Bangladesh are both available regions.
- **Cost of a typical question:** about 8,000 tokens of context plus a 1,000-token answer costs roughly **$0.01** on 3.8 Flash today, and about $0.02 after its January price change.

## 5A scope

1. **Off by default.** The Assistant appears only when a server-side key is configured and `AI_ENABLED=1`. Removing either is the kill switch. Settings shows the status: Off, On, or Paused (monthly limit reached).
2. **Assistant tab on a project**, with modes:
   - **Engineering review:** reads the overview, Lab entries, components, tasks and milestones. Answers are framed as suggestions that need datasheet and safety checking.
   - **Story memory:** reads the Story Bible, characters, relationships, units (season, episode, scene, shot), timeline and continuity. Every claim cites its record.
   - **Planning:** reads tasks, milestones and Lab results.
3. **You choose the context.** A checklist of the project's records in that mode, all unticked by default, with "select all in section". Before sending, the tab shows the token estimate, the approximate cost, and what is being sent. Only text from the database is sent: no files, images, Drive content, other projects or ideas. Context is capped at about 30,000 tokens.
4. **Answers with checked citations.** Each record sent gets a label such as `[L3]` or `[S1.2.3]`, and the model is told to cite labels. The server checks every cited label was actually sent, shows each citation as a link to that record, and visibly flags any citation to something that wasn't sent. Answers are rendered as plain text, never HTML.
5. **No changes, ever, in 5A.** There are no tools and no function calling, and the route writes only to the conversation and usage tables.
6. **Conversations** are kept privately per project (question, the labels sent, answer, cost). You can delete one, or all of them. Records' full text isn't stored again, only their labels and ids.
7. **Limits enforced by the app:** a monthly spending ceiling and a daily request cap, checked before every request. Answers are capped at 2,048 tokens and requests time out after 60 seconds. Failures and timeouts are recorded as zero cost.

## Decisions needed

| ID | Question | Recommendation |
| --- | --- | --- |
| V-038 | Free or paid tier | **Paid tier** (a Google Cloud project with billing; the API key is created in AI Studio). On the free tier your private notes may be used for training and read by human reviewers. Spending is bounded by V-040. |
| V-039 | Model | **Gemini 3.8 Flash**, set in a server setting so it can change without code. The cheaper alternative is 3.5 Flash-Lite, at about 40% of the cost and weaker on reasoning. |
| V-040 | Limits | **$5 per calendar month and 40 requests per day**, enforced by the app from recorded token counts and the price table. Also set a Google Cloud budget alert at $5; Google alerts but does not stop spending, which is why the app enforces the cap. |
| V-041 | Context | Selected database text from one project only, capped at about 30k tokens, with the estimate shown before sending (as above). No files in 5A. |
| V-042 | Keep conversations | **Keep them, private and deletable**, with no automatic expiry. The alternative is not storing them at all, so each answer disappears when you leave the page. |
| V-043 | Read-only first | **Yes.** 5A never changes data; proposals with Accept and Reject arrive in 5B. |
| V-044 | Terms | Confirm you're 18 or older (Gemini API terms), and that you'll create the key yourself and add it to Vercel. The key must never be pasted into chat or committed. |

## Files (expected)

| Kind | Files |
| --- | --- |
| SQL (new) | `supabase/017_ai.sql`: `ai_conversations` and `ai_messages` (owner-only, deletable). `ai_usage` (owner can read; rows written only by a security-definer `record_ai_usage` function, so the cap can't be edited away from the browser). `ai_month_spend()`. |
| New | `src/lib/ai/gemini.ts` (REST adapter using `fetch`, no new dependency; timeout, token counts, error mapping), `src/lib/ai/context.ts` (labelled context from selected records, size estimate), `src/lib/ai/citations.ts` (extract and verify labels), `src/lib/ai/limits.ts` (price table, ceiling and daily cap), `src/app/api/ai/ask/route.ts`, `src/app/api/ai/status/route.ts`, `src/app/vault/projects/[id]/assistant-panel.tsx` |
| Changed | `src/app/vault/projects/[id]/project-workspace.tsx` (Assistant tab when enabled), `src/app/vault/settings/page.tsx` (AI status, month spend, delete-all), `.env.example` (`GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_ENABLED`, `AI_MONTHLY_USD`, `AI_DAILY_REQUESTS`) |
| Tests | `tests/sql/phase5a-behaviour.sql`, `tests/ai.test.mjs` (context labels, citation checks, cost maths, cap), `tests/browser/assistant.spec.ts` against a **fake Gemini** in the fixture. No real API calls in tests. |

## Risks

- **Private data leaving the Vault.** Only records you tick are sent, on the paid tier. Tests assert the request body holds exactly the selected records and nothing else (no other project, no file, no owner id or email).
- **Prompt injection.** A pasted note could say "ignore your instructions". Context is wrapped as quoted data, the model has no tools, and output is text the page renders as text. The worst outcome is a wrong answer, which citations make checkable.
- **Invented facts or citations.** Every citation is checked against what was sent; unknown ones are flagged. Engineering answers carry a note to verify against datasheets and safety rules.
- **Cost overrun.** The app checks the cap before each call and assumes the maximum answer size when doing so. The Google budget alert is a second line.
- **Key exposure.** The key is server-only (no `NEXT_PUBLIC_` prefix), never logged, and never sent to the browser. A test asserts the client bundle doesn't contain it.
- **Provider outage or rate limits.** A clear message and nothing recorded as spent. There is no automatic fallback to another provider, because that would send data somewhere you didn't approve.

## Acceptance tests

Mapped to master prompt §6 and the roadmap's Phase 5 row:
1. With no key or `AI_ENABLED` unset, no Assistant tab appears and the route returns "off". No request is made.
2. The request to (fake) Gemini contains exactly the ticked records, labelled, and nothing else.
3. Citations resolve to the right records; an invented label is flagged; HTML in an answer shows as text.
4. At the monthly ceiling or daily cap, requests are refused before any call to Gemini, and Settings shows Paused.
5. Anonymous visitors, other accounts and other sites can't use the routes or read conversations and usage (2).
6. No project, story or Lab table changes during any assistant use (zero mutations).
7. Deleting a conversation removes its messages; usage totals remain (they are the cap's record).
8. 017 applies twice in a disposable Postgres; all earlier suites, tsc, ESLint, unit and browser tests and the build pass.
9. After go-live, one real question with your key returns a cited answer, and the recorded cost matches Google's usage numbers.

## Go-live and rollback

- **Your setup, before go-live:**
  1. In Google Cloud, enable billing on a project.
  2. Create an API key restricted to the Generative Language API.
  3. Add a budget alert.
  4. Add `GEMINI_API_KEY` to Vercel (Production only, marked sensitive).

  I can walk you through it; you enter the key yourself.
- **Deploy order:** apply 017, then deploy with `AI_ENABLED` unset (the feature stays hidden). Then set `AI_ENABLED=1` and redeploy.
- **Rollback:** unset `AI_ENABLED` (instant kill switch on the next deploy), or delete the key in Google Cloud (immediate). The tables can stay; delete conversations from Settings if wanted.

## Not in 5A

Proposals and any data changes (5B), file or Drive text (5C), image generation, a public chatbot (excluded by the master prompt), background or scheduled AI, and automatic provider fallback.
