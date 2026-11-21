import type { NextRequest } from "next/server";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { PROJECT_COLUMNS, type Project, type Row, type TableName } from "@/lib/workspace";
import { CONTEXT_TOKEN_LIMIT, HISTORY_TURNS, MAX_QUESTION, MAX_SOURCES, aiSettings, capCheck, costUsd, worstCase } from "@/lib/ai/limits";
import { MODES, OVERVIEW, buildContext, estimateTokens, modesFor, systemInstruction, userPrompt, type AiMode, type Records, type SourceTable } from "@/lib/ai/context";
import { checkCitations } from "@/lib/ai/citations";
import { generate, type Turn } from "@/lib/ai/gemini";

// Phase 5A: one question to the read-only assistant.
//
// The browser sends only ids of the records the owner ticked; this route reads those records again
// from the database with the owner's session (row security), so nothing else can be slipped in.
// The monthly ceiling and daily cap are checked against the usage ledger before calling Gemini.
// Every provider request is recorded in the ledger (record_ai_usage), including failures.
// The route writes nothing except the conversation and the ledger: no project data is changed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Body = { projectId?: unknown; mode?: unknown; question?: unknown; selected?: unknown; conversationId?: unknown };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const settings = aiSettings();
  if (!settings.enabled) return json({ error: "off", message: "The assistant is switched off." }, 503);

  const body = await request.json().catch(() => null) as Body | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const mode = body?.mode as AiMode;
  const selected = Array.isArray(body?.selected) ? body.selected as { table?: unknown; id?: unknown }[] : [];
  if (!body || typeof body.projectId !== "string" || !UUID.test(body.projectId) || !(mode in MODES)
    || !question || question.length > MAX_QUESTION || selected.length === 0 || selected.length > MAX_SOURCES
    || (body.conversationId !== undefined && body.conversationId !== null && (typeof body.conversationId !== "string" || !UUID.test(body.conversationId)))) {
    return json({ error: "invalid", message: "Choose at least one record and ask a question (up to 2,000 characters)." }, 400);
  }
  const allowed = new Set<SourceTable>([OVERVIEW, ...MODES[mode].tables]);
  const picks = selected.map((s) => ({ table: s.table as SourceTable, id: s.id as string }));
  if (picks.some((p) => !allowed.has(p.table) || typeof p.id !== "string" || !UUID.test(p.id))) {
    return json({ error: "invalid", message: "Some chosen records don't belong to this mode." }, 400);
  }
  const { supabase, owner } = session;

  const project = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", body.projectId).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
  if (!project || project.error) return json({ error: "unavailable", message: "Couldn't load the project. Try again." }, 503);
  if (!project.data) return json({ error: "not_found", message: "Project not found." }, 404);
  const p = project.data as Project;
  if (!modesFor(p.project_type).includes(mode)) return json({ error: "invalid", message: "That mode doesn't fit this project's type." }, 400);

  // Every record of the mode's tables, so labels and references match what the page shows.
  const tables = MODES[mode].tables.includes("story_relationships") && !MODES[mode].tables.includes("story_characters")
    ? [...MODES[mode].tables, "story_characters" as TableName] : MODES[mode].tables;
  const lists = await Promise.all(tables.map((t) => supabase.from(t).select("*").eq("project_id", p.id).eq("user_id", owner.id).limit(1000).then((r) => r, () => null)));
  if (lists.some((r) => !r || r.error || !Array.isArray(r.data))) return json({ error: "unavailable", message: "Couldn't load the project's records. Try again." }, 503);
  const records: Records = Object.fromEntries(tables.map((t, i) => [t, lists[i]!.data as Row[]]));
  // References from milestones to tasks etc. resolve within the loaded tables only.
  const context = buildContext(p, mode, records, picks);
  if (context.missing > 0) return json({ error: "changed", message: "Some chosen records were changed or deleted. Reload the page and choose again." }, 409);

  // Earlier turns of this conversation (question and answer text only).
  let history: Turn[] = [];
  if (typeof body.conversationId === "string") {
    const convo = await supabase.from("ai_conversations").select("id, project_id, mode").eq("id", body.conversationId).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
    if (!convo || convo.error || !convo.data || convo.data.project_id !== p.id) return json({ error: "changed", message: "That conversation is gone. Start a new one." }, 409);
    const past = await supabase.from("ai_messages").select("role, text").eq("conversation_id", body.conversationId).eq("user_id", owner.id)
      .order("created_at", { ascending: false }).limit(HISTORY_TURNS * 2).then((r) => r, () => null);
    if (!past || past.error || !Array.isArray(past.data)) return json({ error: "unavailable", message: "Couldn't load the conversation. Try again." }, 503);
    history = (past.data as { role: string; text: string }[]).reverse().map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }));
  }

  const system = systemInstruction(mode);
  const prompt = userPrompt(context.text, question);
  const estimate = estimateTokens(system + prompt + history.map((t) => t.text).join(""));
  if (estimateTokens(context.text) > CONTEXT_TOKEN_LIMIT) {
    return json({ error: "too_large", message: `That's about ${estimateTokens(context.text).toLocaleString("en")} tokens of records; the limit is ${CONTEXT_TOKEN_LIMIT.toLocaleString("en")}. Untick some.` }, 413);
  }
  const usage = await supabase.rpc("ai_usage_now").then((r) => r, () => null);
  const now = Array.isArray(usage?.data) ? usage.data[0] as { month_usd: number | string; today_requests: number } | undefined : undefined;
  if (!usage || usage.error || !now) return json({ error: "unavailable", message: "Couldn't check this month's AI spending. Nothing was sent." }, 503);
  const cap = capCheck(settings, Number(now.month_usd), now.today_requests, worstCase(settings.model, estimate)!);
  if (!cap.ok) return json({ error: cap.kind === "day" ? "daily_limit" : "monthly_limit", message: `${cap.message} Nothing was sent.` }, 429);

  const result = await generate({ key: process.env.GEMINI_API_KEY!, model: settings.model, system, turns: [...history, { role: "user", text: prompt }] });
  if (!result.ok) {
    // A timed-out request may still have been processed and billed, so it counts at its worst case.
    const spent = result.kind === "timeout" ? worstCase(settings.model, estimate)! : 0;
    await supabase.rpc("record_ai_usage", { p_model: settings.model, p_input: result.kind === "timeout" ? estimate : 0, p_output: 0, p_cost: spent, p_outcome: "error" }).then(() => null, () => null);
    return json({ error: result.kind, message: result.message }, result.kind === "rate" ? 429 : 502);
  }
  const cost = costUsd(settings.model, result.inputTokens, result.outputTokens)!;
  const recorded = await supabase.rpc("record_ai_usage", { p_model: settings.model, p_input: result.inputTokens, p_output: result.outputTokens, p_cost: cost, p_outcome: "ok" }).then((r) => !r.error, () => false);
  const { unknown } = checkCitations(result.text, context.sources.map((s) => s.label));

  // Keep the conversation (question, labels sent, answer). A failure here doesn't lose the answer.
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  let saved = false;
  try {
    if (!conversationId) {
      const made = await supabase.from("ai_conversations").insert({ user_id: owner.id, project_id: p.id, mode, title: question.slice(0, 120) }).select("id").single();
      conversationId = made.error ? null : (made.data as { id: string }).id;
    }
    if (conversationId) {
      const sources = context.sources.map(({ label, table, id, title }) => ({ label, table, id, title: title.slice(0, 300) }));
      const inserted = await supabase.from("ai_messages").insert([
        { conversation_id: conversationId, user_id: owner.id, role: "user", text: question, sources },
        { conversation_id: conversationId, user_id: owner.id, role: "assistant", text: result.text, sources: [], model: settings.model,
          input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost },
      ]);
      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", owner.id);
      saved = !inserted.error;
    }
  } catch {
    saved = false;
  }

  return json({
    ok: true, conversationId, saved, recorded, answer: result.text, sources: context.sources, unknownCitations: unknown,
    truncated: result.finishReason === "MAX_TOKENS", model: settings.model, cost, monthUsd: Number(now.month_usd) + cost,
  });
}
