"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROJECT_TYPES, createProject, type ProjectType } from "@/lib/workspace";
import { LockedNotice, useVaultWriter } from "../use-vault-writer";

const field =
  "w-full rounded-xl border border-line bg-field p-3 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

export default function NewProjectForm({ ownerId, defaultType, types }: { ownerId: string; defaultType: ProjectType; types: ProjectType[] }) {
  const router = useRouter();
  const { run, busy, message, setMessage, online, locked, retry } = useVaultWriter(ownerId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", project_type: defaultType as string, summary: "" });
  const choices = PROJECT_TYPES.filter((t) => types.includes(t.value));

  if (locked) return <div className="mt-6"><LockedNotice retry={retry} /></div>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm shadow-accent/30 transition hover:brightness-105"
      >
        + New project
      </button>
    );
  }
  return (
    <form
      className="mt-4 grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-[2fr_1fr]"
      onSubmit={(e) => {
        e.preventDefault();
        void run((c) => createProject(c, ownerId, draft), null, (project) => router.push(`/vault/projects/${project.id}`));
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Project title
        <input required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Type
        <select value={draft.project_type} onChange={(e) => setDraft({ ...draft, project_type: e.target.value })} className={field}>
          {choices.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        Summary <span className="font-normal text-muted">(optional)</span>
        <textarea rows={3} maxLength={5000} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className={`${field} resize-y`} />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || !online} className="rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
          {busy ? "Creating…" : "Create project"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMessage(null); }} className="rounded-xl border border-line px-4 py-2 text-muted transition hover:text-foreground">
          Cancel
        </button>
        {!online && <span className="text-sm text-muted">You&apos;re offline. Creating a project needs a connection.</span>}
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm sm:col-span-2 ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
