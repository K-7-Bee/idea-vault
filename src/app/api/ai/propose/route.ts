import type { NextRequest } from "next/server";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { PROJECT_COLUMNS, type Project, type Row, type TableName } from "@/lib/workspace";
import { CONTEXT_TOKEN_LIMIT, MAX_SOURCES, aiSettings, capCheck, costUsd, worstCase } from "@/lib/ai/limits";
import { MODES, OVERVIEW, buildContext, estimateTokens, modesFor, userPrompt, type AiMode, type Records, type SourceTable } from "@/lib/ai/context";
import { MAX_FOCUS, parseProposals, proposalInstruction } from "@/lib/ai/proposals";
import { generate } from "@/lib/ai/gemini";

// Phase 5B: ask the assistant for proposals (new tasks, milestones or continuity notes).
//
// Same checks as /api/ai/ask (same-origin, owner session, the switch, ticked records re-read from
// the database, monthly and daily caps, every provider call in the ledger). This route writes
// nothing but the usage ledger: proposals go back to the browser, and only the ones the owner
// accepts are saved, through the normal owner-only inserts.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Body = { projectId?: unknown; mode?: unknown; focus?: unknown; selected?: unknown };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const settings = aiSettings();
  if (!settings.enabled) return json({ error: "off", message: "The assistant is switched off." }, 503);

  const body = await request.json().catch(() => null) as Body | null;
  const focus = typeof body?.focus === "string" ? body.focus.trim() : "";
  const mode = body?.mode as AiMode;
  const selected = Array.isArray(body?.selected) ? body.selected as { table?: unknown; id?: unknown }[] : [];
  if (!body || typeof body.projectId !== "string" || !UUID.test(body.projectId) || !(mode in MODES)
    || focus.length > MAX_FOCUS || selected.length === 0 || selected.length > MAX_SOURCES) {
    return json({ error: "invalid", message: "Choose at least one record (and an optional focus of up to 500 characters)." }, 400);
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

  const tables = MODES[mode].tables.includes("story_relationships") && !MODES[mode].tables.includes("story_characters")
    ? [...MODES[mode].tables, "story_characters" as TableName] : MODES[mode].tables;
  const lists = await Promise.all(tables.map((t) => supabase.from(t).select("*").eq("project_id", p.id).eq("user_id", owner.id).limit(1000).then((r) => r, () => null)));
  if (lists.some((r) => !r || r.error || !Array.isArray(r.data))) return json({ error: "unavailable", message: "Couldn't load the project's records. Try again." }, 503);
  const records: Records = Object.fromEntries(tables.map((t, i) => [t, lists[i]!.data as Row[]]));
  const context = buildContext(p, mode, records, picks);
  if (context.missing > 0) return json({ error: "changed", message: "Some chosen records were changed or deleted. Reload the page and choose again." }, 409);
  if (estimateTokens(context.text) > CONTEXT_TOKEN_LIMIT) {
    return json({ error: "too_large", message: `That's about ${estimateTokens(context.text).toLocaleString("en")} tokens of records; the limit is ${CONTEXT_TOKEN_LIMIT.toLocaleString("en")}. Untick some.` }, 413);
  }

  const system = proposalInstruction(mode);
  const prompt = userPrompt(context.text, focus || "Propose the most useful new items, based only on these records.");
  const estimate = estimateTokens(system + prompt);
  const usage = await supabase.rpc("ai_usage_now").then((r) => r, () => null);
  const now = Array.isArray(usage?.data) ? usage.data[0] as { month_usd: number | string; today_requests: number } | undefined : undefined;
  if (!usage || usage.error || !now) return json({ error: "unavailable", message: "Couldn't check this month's AI spending. Nothing was sent." }, 503);
  const cap = capCheck(settings, Number(now.month_usd), now.today_requests, worstCase(settings.model, estimate)!);
  if (!cap.ok) return json({ error: cap.kind === "day" ? "daily_limit" : "monthly_limit", message: `${cap.message} Nothing was sent.` }, 429);

  const result = await generate({ key: process.env.GEMINI_API_KEY!, model: settings.model, system, turns: [{ role: "user", text: prompt }] });
  if (!result.ok) {
    const spent = result.kind === "timeout" ? worstCase(settings.model, estimate)! : 0;
    await supabase.rpc("record_ai_usage", { p_model: settings.model, p_input: result.kind === "timeout" ? estimate : 0, p_output: 0, p_cost: spent, p_outcome: "error" }).then(() => null, () => null);
    return json({ error: result.kind, message: result.message }, result.kind === "rate" ? 429 : 502);
  }
  const cost = costUsd(settings.model, result.inputTokens, result.outputTokens)!;
  const recorded = await supabase.rpc("record_ai_usage", { p_model: settings.model, p_input: result.inputTokens, p_output: result.outputTokens, p_cost: cost, p_outcome: "ok" }).then((r) => !r.error, () => false);
  const parsed = parseProposals(result.text, mode, context.sources);
  if (parsed.unreadable) {
    return json({ ok: true, proposals: [], dropped: 0, unreadable: true, recorded, cost, monthUsd: Number(now.month_usd) + cost, sources: context.sources });
  }
  return json({ ok: true, proposals: parsed.proposals, dropped: parsed.dropped, unreadable: false, recorded, cost, monthUsd: Number(now.month_usd) + cost, sources: context.sources });
}
