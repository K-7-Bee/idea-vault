"use client";

import { Fragment, useMemo, useState } from "react";
import type { Project } from "@/lib/workspace";
import { CONTEXT_TOKEN_LIMIT, MAX_QUESTION, costUsd, usd } from "@/lib/ai/limits";
import { MODES, OVERVIEW, TAB_OF, availableSources, buildContext, estimateTokens, modesFor, systemInstruction, type AiMode, type Records, type Source } from "@/lib/ai/context";
import { splitCitations } from "@/lib/ai/citations";
import type { Outcome } from "@/lib/workspace";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantConfig = {
  model: string; monthlyUsd: number; dailyRequests: number; monthUsd: number; todayRequests: number;
  conversations: { id: string; mode: AiMode; title: string; updated_at: string }[];
};
type Message = { role: "user" | "assistant"; text: string; sources: Source[]; cost?: number };
type Writer = {
  run: <T>(operation: (client: SupabaseClient) => Promise<Outcome<T>>, done: string | null, onSuccess: (value: T) => void) => Promise<boolean>;
  busy: boolean; online: boolean;
  setMessage: (m: { text: string; error: boolean; keep?: boolean } | null) => void;
};

const button = "rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const primary = "rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";
const SECTION: Record<string, string> = {
  overview: "Project", project_entries: "Lab notebook", project_components: "Components", project_tasks: "Tasks", project_milestones: "Milestones",
  project_links: "Links", story_bible_entries: "Story Bible", story_characters: "Characters", story_relationships: "Relationships",
  story_units: "Structure (scenes and shots)", story_timeline_events: "Timeline", story_continuity: "Continuity",
};
const key = (s: { table: string; id: string }) => `${s.table}:${s.id}`;

// An answer as text, with each citation shown as a link to the record's tab, and any citation of
// something that wasn't sent flagged. Never rendered as HTML.
function Answer({ text, sources }: { text: string; sources: Source[] }) {
  const byLabel = new Map(sources.map((s) => [s.label, s]));
  return (
    <div className="grid gap-2 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {splitCitations(para, byLabel.keys()).map((piece, k) => "text" in piece ? <Fragment key={k}>{piece.text}</Fragment>
            : piece.known
              ? <a key={k} href={`#${TAB_OF[byLabel.get(piece.label)!.table]}`} title={byLabel.get(piece.label)!.title}
                  className="mx-0.5 rounded bg-accent/15 px-1 text-xs font-semibold underline-offset-2 hover:underline">[{piece.label}]</a>
              : <span key={k} className="mx-0.5 rounded bg-danger/15 px-1 text-xs font-semibold text-danger" title="This label wasn't among the records sent">[{piece.label}: not in the records sent]</span>)}
        </p>
      ))}
    </div>
  );
}

// Phase 5A: ask the read-only assistant about this project. Only the records ticked here are sent,
// and the size and approximate cost are shown first. Nothing in the project is ever changed.
export default function AssistantPanel({ project, records, config, writer }: {
  project: Project; records: Records; config: AssistantConfig; writer: Writer;
}) {
  const modes = modesFor(project.project_type);
  const [mode, setMode] = useState<AiMode>(modes[0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState(config.conversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [monthUsd, setMonthUsd] = useState(config.monthUsd);
  const [today, setToday] = useState(config.todayRequests);
  const [warning, setWarning] = useState<string | null>(null);
  const disabled = writer.busy || !writer.online;

  const sources = useMemo(() => availableSources(project, mode, records), [project, mode, records]);
  const selected = sources.filter((s) => picked.has(key(s)));
  const context = useMemo(() => buildContext(project, mode, records, selected), [project, mode, records, selected]);
  const tokens = estimateTokens(systemInstruction(mode) + context.text + question);
  const contextTokens = estimateTokens(context.text);
  const estimate = costUsd(config.model, tokens, 800) ?? 0;
  const groups = [...new Set(sources.map((s) => s.table))];
  const paused = today >= config.dailyRequests ? "Today's question limit is reached." : monthUsd >= config.monthlyUsd ? "This month's spending limit is reached." : null;

  function switchMode(next: AiMode) {
    setMode(next);
    setPicked(new Set());
    setConversationId(null);
    setMessages([]);
  }
  const toggle = (s: Source) => setPicked((set) => { const n = new Set(set); if (n.has(key(s))) n.delete(key(s)); else n.add(key(s)); return n; });
  const toggleGroup = (table: string, on: boolean) => setPicked((set) => {
    const n = new Set(set);
    for (const s of sources.filter((x) => x.table === table)) if (on) n.add(key(s)); else n.delete(key(s));
    return n;
  });

  function ask() {
    const sent = selected.map(({ table, id }) => ({ table, id }));
    const q = question.trim();
    void writer.run(async (): Promise<Outcome<{ id: string | null; answer: string; sources: Source[]; cost: number; month: number; unknown: string[]; saved: boolean; truncated: boolean }>> => {
      try {
        const response = await fetch("/api/ai/ask", {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, mode, question: q, selected: sent, conversationId }),
        });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) return { ok: false, reason: "failed", message: typeof body.message === "string" ? body.message : "The assistant couldn't answer. Try again." };
        return { ok: true, value: { id: body.conversationId as string | null, answer: String(body.answer), sources: body.sources as Source[], cost: Number(body.cost),
          month: Number(body.monthUsd), unknown: body.unknownCitations as string[], saved: Boolean(body.saved), truncated: Boolean(body.truncated) } };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Nothing was sent. Try again." };
      }
    }, null, (r) => {
      setMessages((list) => [...list, { role: "user", text: q, sources: r.sources }, { role: "assistant", text: r.answer, sources: r.sources, cost: r.cost }]);
      setQuestion("");
      setMonthUsd(r.month);
      setToday((n) => n + 1);
      if (r.id && r.id !== conversationId) {
        setConversationId(r.id);
        setConversations((list) => [{ id: r.id!, mode, title: q.slice(0, 120), updated_at: new Date().toISOString() }, ...list.filter((c) => c.id !== r.id)]);
      }
      setWarning([
        r.unknown.length ? `The answer cites ${r.unknown.join(", ")}, which ${r.unknown.length === 1 ? "wasn't" : "weren't"} among the records sent. Treat ${r.unknown.length === 1 ? "that claim" : "those claims"} as unsupported.` : "",
        r.truncated ? "The answer hit its length limit and may be cut off." : "",
        r.saved ? "" : "The answer couldn't be saved to the conversation history.",
      ].filter(Boolean).join(" ") || null);
    });
  }

  function openConversation(id: string) {
    const convo = conversations.find((c) => c.id === id);
    if (!convo) return;
    void writer.run(async (client): Promise<Outcome<Message[]>> => {
      const r = await client.from("ai_messages").select("role, text, sources, cost_usd").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
      if (r.error || !Array.isArray(r.data)) return { ok: false, reason: "failed", message: "Couldn't load that conversation." };
      let last: Source[] = [];
      return { ok: true, value: (r.data as { role: "user" | "assistant"; text: string; sources: Source[]; cost_usd: number }[]).map((m) => {
        if (m.role === "user") last = m.sources;
        return { role: m.role, text: m.text, sources: m.role === "user" ? m.sources : last, cost: Number(m.cost_usd) };
      }) };
    }, null, (list) => {
      setMode(convo.mode);
      setConversationId(id);
      setMessages(list);
      setWarning(null);
      const lastSent = [...list].reverse().find((m) => m.role === "user")?.sources ?? [];
      setPicked(new Set(lastSent.map(key)));
    });
  }

  function deleteConversation(id: string) {
    void writer.run(async (client): Promise<Outcome<null>> => {
      const r = await client.from("ai_conversations").delete().eq("id", id).select("id");
      return r.error ? { ok: false, reason: "failed", message: "Couldn't delete the conversation." } : { ok: true, value: null };
    }, "Conversation deleted.", () => {
      setConversations((list) => list.filter((c) => c.id !== id));
      if (conversationId === id) { setConversationId(null); setMessages([]); }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section aria-label="Ask the assistant" className="grid gap-4">
        <div className="rounded-2xl border border-line bg-card p-4 text-sm">
          <p>
            The assistant reads only the records you tick below and sends them to Google Gemini ({config.model}, paid tier: not used for training).
            It never changes anything in your project. Check its answers against the cited records.
          </p>
          <p className="mt-2 text-muted">This month {usd(monthUsd)} of ${config.monthlyUsd.toFixed(2)} · today {today} of {config.dailyRequests} questions.</p>
        </div>

        <fieldset className="flex flex-wrap gap-2" aria-label="Mode">
          {modes.map((m) => (
            <label key={m} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${mode === m ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
              <input type="radio" name="assistant-mode" className="sr-only" checked={mode === m} onChange={() => switchMode(m)} />{MODES[m].label}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted">{MODES[mode].hint}</p>

        <fieldset className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 text-sm font-semibold">Records to send ({selected.length} of {sources.length})</legend>
          {groups.map((table) => {
            const items = sources.filter((s) => s.table === table);
            const all = items.every((s) => picked.has(key(s)));
            return (
              <div key={table} role="group" aria-label={SECTION[table]} className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">{SECTION[table]}</p>
                  {items.length > 1 && <button type="button" className={small} onClick={() => toggleGroup(table, !all)}>{all ? "Clear" : "Select all"}<span className="sr-only"> in {SECTION[table]}</span></button>}
                </div>
                {items.length === 0 ? <p className="text-xs text-muted">None yet.</p> : items.map((s) => (
                  <label key={key(s)} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={picked.has(key(s))} onChange={() => toggle(s)} />
                    <span><span className="font-mono text-xs text-muted">{s.label}</span> {s.table === OVERVIEW ? "Project overview" : s.title}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </fieldset>

        {messages.length > 0 && (
          <ol className="grid gap-3" aria-label="Conversation">
            {messages.map((m, i) => (
              <li key={i} className={`rounded-2xl border p-4 ${m.role === "user" ? "border-line bg-background" : "border-line bg-card"}`}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{m.role === "user" ? "You asked" : `Assistant${m.cost !== undefined ? ` · ${usd(m.cost)}` : ""}`}</p>
                {m.role === "user" ? <p className="whitespace-pre-line text-sm">{m.text}</p> : <Answer text={m.text} sources={m.sources} />}
                {m.role === "assistant" && mode === "engineering" && <p className="mt-2 text-xs text-muted">Check engineering suggestions against datasheets, ratings and safety rules before acting.</p>}
              </li>
            ))}
          </ol>
        )}
        {warning && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">{warning}</p>}

        <form className="grid gap-2 rounded-2xl border border-line bg-card p-4" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <label className="flex flex-col gap-1 text-sm font-medium">{conversationId ? "Ask a follow-up" : "Your question"}
            <textarea rows={3} maxLength={MAX_QUESTION} value={question} onChange={(e) => setQuestion(e.target.value)}
              className="rounded-xl border border-line bg-background px-3 py-2 font-normal" />
          </label>
          <p className="text-xs text-muted" aria-live="polite">
            {selected.length === 0 ? "Tick at least one record to send."
              : contextTokens > CONTEXT_TOKEN_LIMIT ? `Too much selected: about ${contextTokens.toLocaleString("en")} tokens of records (limit ${CONTEXT_TOKEN_LIMIT.toLocaleString("en")}). Untick some.`
              : `Sends ${selected.length} ${selected.length === 1 ? "record" : "records"} (about ${tokens.toLocaleString("en")} tokens, roughly ${usd(estimate)}) to Google Gemini.`}
          </p>
          {paused && <p role="status" className="text-sm text-danger">{paused} The assistant is paused until it resets.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={disabled || !question.trim() || selected.length === 0 || contextTokens > CONTEXT_TOKEN_LIMIT || paused !== null}>
              {writer.busy ? "Asking…" : "Ask"}
            </button>
            {conversationId && <button type="button" className={button} onClick={() => { setConversationId(null); setMessages([]); setWarning(null); }}>New conversation</button>}
          </div>
        </form>
      </section>

      <aside aria-label="Saved conversations" className="grid content-start gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Saved conversations</h3>
        {conversations.length === 0 ? <p className="text-sm text-muted">None yet. Conversations are private to you and can be deleted.</p> : (
          <ul className="grid gap-2">
            {conversations.map((c) => (
              <li key={c.id} className={`rounded-xl border p-2 text-sm ${c.id === conversationId ? "border-accent" : "border-line"}`}>
                <button type="button" className="block w-full text-left font-medium underline-offset-4 hover:underline" disabled={disabled} onClick={() => openConversation(c.id)}>{c.title || "Untitled"}</button>
                <span className="text-xs text-muted">{MODES[c.mode].label}</span>
                <button type="button" className={`${small} ml-2`} disabled={disabled} onClick={() => deleteConversation(c.id)}>Delete<span className="sr-only"> conversation: {c.title}</span></button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
