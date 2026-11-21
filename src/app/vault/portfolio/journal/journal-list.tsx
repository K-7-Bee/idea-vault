"use client";

import { useRouter } from "next/navigation";
import { createEntry, type JournalEntry, type PublishState } from "@/lib/journal";
import { LockedNotice, useVaultWriter } from "../../use-vault-writer";

const primary = "rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40";
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export function entryStatus(entry: JournalEntry, state: PublishState | undefined): string {
  if (!state) return "Draft";
  return state.draft_version === entry.version ? "Published" : "Published, with unpublished changes";
}

// Phase 4D: the list of journal entries with their status, and a button to start a new one.
export default function JournalList({ ownerId, entries, states }: { ownerId: string; entries: JournalEntry[]; states: PublishState[] }) {
  const { run, busy, message, setMessage, online, locked, retry, region } = useVaultWriter(ownerId);
  const router = useRouter();
  const stateOf = (id: string) => states.find((s) => s.entry_id === id);
  const published = states.length;

  function start() {
    void run((client) => createEntry(client, ownerId), null, (entry) => router.push(`/vault/portfolio/journal/${entry.id}`));
  }

  return (
    <>
      {locked && <LockedNotice retry={retry} />}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined} className="grid gap-6">
        <div>
          <a href="/vault/portfolio" className="text-sm text-muted underline underline-offset-4">← Portfolio</a>
          <h2 className="mt-2 text-2xl font-bold">Journal</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Short, real engineering notes and lessons. Every entry starts private and is published on its own. Your homepage shows a Journal link only
            while at least one entry is published.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={busy || !online} onClick={start}>{busy ? "Starting…" : "New entry"}</button>
          <span className="text-sm text-muted">{published === 0 ? "Nothing published; the Journal is hidden on your site." : `${published} published`}</span>
          {message && (
            <p role={message.error ? "alert" : "status"} className={`basis-full text-sm ${message.error ? "text-danger" : "text-muted"}`}>
              {message.text} <button type="button" className="ml-2 text-muted underline" onClick={() => setMessage(null)}>Dismiss</button>
            </p>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No entries yet.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Journal entries">
            {entries.map((e) => {
              const status = entryStatus(e, stateOf(e.id));
              return (
                <li key={e.id}>
                  <a href={`/vault/portfolio/journal/${e.id}`} className="block rounded-2xl border border-line bg-card p-4 shadow-sm hover:bg-background">
                    <span className="font-semibold">{e.title || "Untitled entry"}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${status === "Draft" ? "bg-background" : "bg-accent/15"}`}>{status}</span>
                      <span>Edited {when(e.updated_at)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
