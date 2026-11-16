"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROJECT_TYPES, convertIdea } from "@/lib/workspace";
import { useVaultWriter } from "../../use-vault-writer";

// Creates a project from this idea. The idea is kept unchanged; doing it twice opens the same project.
export default function ConvertToProject({ ownerId, idea }: {
  ownerId: string; idea: { id: string; title: string | null; content: string; status: string };
}) {
  const router = useRouter();
  const { run, busy, message, online, locked } = useVaultWriter(ownerId);
  const [type, setType] = useState<string>("engineering");
  if (locked) return null;
  return (
    <section aria-labelledby="convert-heading" className="mt-4 rounded-2xl border border-line bg-card p-4">
      <h3 id="convert-heading" className="font-semibold">Turn into a project</h3>
      <p className="mt-1 text-sm text-muted">Starts a private project with this idea&apos;s title, text and stage. The idea stays as it is.</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run((c) => convertIdea(c, ownerId, idea, type), null, ({ project }) => router.push(`/vault/projects/${project.id}`));
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Project type
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-line bg-field p-2.5 text-base text-ink">
            {PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !online} className="rounded-xl bg-accent px-4 py-2.5 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
          {busy ? "Opening…" : "Create or open project"}
        </button>
      </form>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>
      )}
    </section>
  );
}
