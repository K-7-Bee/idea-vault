"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { STATUSES, formatSize } from "@/lib/ideas";
import {
  TITLE_MAX,
  archiveIdea,
  restoreIdea,
  saveIdea,
  type IdeaDetail,
  type Outcome,
} from "@/lib/idea-detail";
import { splitTags } from "@/lib/tags";
import { FileIcon } from "../../icons";
import { STATUS_COLOR, STATUS_INFO } from "../../status";
import { useOnline } from "../../use-online";
import { useSessionGate } from "../../use-session-gate";

const field =
  "w-full rounded-xl border border-line bg-field p-3 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function IdeaView({ ownerId, initial }: { ownerId: string; initial: IdeaDetail }) {
  const [idea, setIdea] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", status: initial.status });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const online = useOnline();
  const region = useRef<HTMLDivElement>(null);
  const { gate, locked, retry } = useSessionGate(ownerId, (isLocked) => {
    if (isLocked) region.current?.querySelectorAll("audio, video").forEach((m) => (m as HTMLMediaElement).pause());
  });
  const archived = idea.archived_at !== null;

  // Every write re-checks the account, and drops its result if the vault locked meanwhile.
  async function run(operation: (client: SupabaseClient) => Promise<Outcome>, done: string) {
    if (!gate.allowed() || busy) return;
    if (navigator.onLine === false) {
      setMessage({ text: "You're offline. Nothing was changed; try again when you're connected.", error: true });
      return;
    }
    const ticket = gate.ticket();
    setBusy(true);
    setMessage(null);
    try {
      const client = createClient();
      try {
        const identity = await client.auth.getUser();
        if (!gate.valid(ticket)) return;
        if (identity.error || identity.data.user?.id !== ownerId) { gate.lock(); return; }
      } catch {
        if (gate.valid(ticket)) gate.lock();
        return;
      }
      const result = await operation(client);
      if (!gate.valid(ticket)) return;
      if (!result.ok) { setMessage({ text: result.message, error: true }); return; }
      setIdea((current) => ({ ...current, ...result.idea, files: current.files }));
      setEditing(false);
      setMessage({ text: done, error: false });
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setDraft({ title: idea.title ?? "", content: idea.content, status: idea.status });
    setMessage(null);
    setEditing(true);
  }

  const original = idea.original_content !== null && idea.original_content !== idea.content ? idea.original_content : null;

  return (
    <>
      {locked && (
        <section role="alert" className="rounded-2xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold">Vault locked</h2>
          <p className="mt-2">Verify the original account to continue. Unsaved edits on this page are kept while it stays open.</p>
          <button onClick={retry} className="mt-4 underline">Verify account again</button>
        </section>
      )}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined}>
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href={archived ? "/vault/archive" : "/vault#ideas"} className="text-muted underline-offset-4 hover:text-foreground hover:underline">
            ← {archived ? "Archive" : "All ideas"}
          </Link>
        </nav>

        {archived && (
          <section aria-label="Archived" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-card p-4">
            <p className="text-sm" suppressHydrationWarning>
              Archived {when(idea.archived_at!)}. It is hidden from your idea list and counts, and nothing in it was deleted.
            </p>
            <button
              type="button"
              disabled={busy || !online}
              onClick={() => run((c) => restoreIdea(c, ownerId, idea), "Restored to your idea list.")}
              className="rounded-xl bg-accent px-4 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40"
            >
              Restore
            </button>
          </section>
        )}

        <article className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 pl-6 shadow-sm sm:p-6 sm:pl-7">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[idea.status] }} />

          {editing ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run((c) => saveIdea(c, ownerId, idea, draft), "Saved.");
              }}
            >
              <label className="flex flex-col gap-1 text-sm font-medium">
                Title <span className="font-normal text-muted">(optional)</span>
                <input
                  value={draft.title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className={field}
                />
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="idea-text" className="font-medium">Idea</label>
                <textarea
                  id="idea-text"
                  rows={8}
                  value={draft.content}
                  aria-describedby="idea-text-hint"
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  className={`${field} resize-y`}
                />
                <span id="idea-text-hint" className="text-muted">#words become tags.</span>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Stage
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  className={`${field} capitalize`}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy || !online}
                  className="rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setMessage(null); }}
                  className="rounded-xl border border-line px-4 py-2 text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className={`break-words text-2xl font-bold ${idea.title ? "" : "text-muted"}`}>
                  {idea.title ?? "Untitled idea"}
                </h2>
                <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm capitalize">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[idea.status] }} />
                  {STATUS_INFO[idea.status]?.label ?? idea.status}
                </span>
              </div>
              {idea.content ? (
                <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">
                  {splitTags(idea.content).map((part, i) =>
                    part.tag ? (
                      <span key={i} className="rounded-md bg-accent-soft px-1 font-medium text-link">{part.text}</span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </p>
              ) : (
                <p className="mt-4 text-muted">No text — attachments only.</p>
              )}
            </>
          )}

          {message && (
            <p role={message.error ? "alert" : "status"} className={`mt-4 text-sm ${message.error ? "text-danger" : "text-muted"}`}>
              {message.text}
            </p>
          )}
          {!online && <p className="mt-4 text-sm text-muted">You&apos;re offline. Viewing works; changes need a connection.</p>}

          {idea.files.length > 0 && (
            <section aria-label="Attachments" className="mt-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Attachments ({idea.files.length})</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {idea.files.map((f) => (
                  <li key={f.id} className="overflow-hidden rounded-xl border border-line bg-background">
                    {f.url && f.mime_type?.startsWith("image/") && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt={f.name} className="max-h-72 w-full object-contain" />
                    )}
                    {f.url && f.mime_type?.startsWith("audio/") && (
                      <audio controls preload="none" src={f.url} className="w-full p-2" />
                    )}
                    <div className="flex items-center gap-2 px-3 py-2 text-sm">
                      <FileIcon className="h-4 w-4 shrink-0 text-muted" />
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-4 hover:underline">{f.name}</a>
                      ) : (
                        <span className="min-w-0 truncate">{f.name} <span className="text-muted">(link unavailable — reload to retry)</span></span>
                      )}
                      <span className="ml-auto shrink-0 text-muted">{formatSize(f.size)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <dl className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Captured</dt><dd suppressHydrationWarning>{when(idea.created_at)}</dd></div>
            <div><dt className="text-muted">Last edited</dt><dd suppressHydrationWarning>{idea.updated_at ? when(idea.updated_at) : "No edits recorded"}</dd></div>
          </dl>

          {original !== null && (
            <details className="mt-4 rounded-xl border border-line bg-background p-3 text-sm">
              <summary className="cursor-pointer font-medium">Original capture</summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-muted">{original || "(empty)"}</p>
            </details>
          )}

          {!editing && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              {!archived && (
                <button
                  type="button"
                  disabled={busy || !online}
                  onClick={startEdit}
                  className="rounded-xl bg-accent px-4 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40"
                >
                  Edit
                </button>
              )}
              {!archived && (
                <button
                  type="button"
                  disabled={busy || !online}
                  onClick={() => run((c) => archiveIdea(c, ownerId, idea), "Archived. Restore it any time from here or the Archive.")}
                  className="rounded-xl border border-line px-4 py-2 transition hover:bg-background disabled:opacity-40"
                >
                  Archive
                </button>
              )}
            </div>
          )}
        </article>
      </div>
    </>
  );
}
