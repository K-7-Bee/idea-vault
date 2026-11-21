"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CASE_STUDIES, JOURNAL_LIMITS, deleteEntry, editOf, normalizeEdit, publishProblems, sameEdit, saveEntry, slugFrom,
  type JournalEdit, type JournalEntry, type PublishState,
} from "@/lib/journal";
import { sizeLabel, uploadToLibrary } from "@/lib/library";
import type { LibraryItem } from "@/lib/library-server";
import type { Outcome } from "@/lib/workspace";
import { LockedNotice, useVaultWriter } from "../../../use-vault-writer";
import { field } from "../../../projects/[id]/record-section";
import LibraryPicker from "../../library-picker";
import { homepageShows } from "../../homepage-check";
import { requestProfileFileCleanup } from "../../orphan-cleanup";
import { entryStatus } from "../journal-list";

export type ProjectOption = { id: string; title: string; public: boolean };
export type LabEntry = { id: string; project_id: string; kind: string; title: string; body: string };

const button = "rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const primary = "rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";
const label = "flex flex-col gap-1 text-sm font-medium";
const hint = "font-normal text-muted";
const card = "grid gap-4 rounded-2xl border border-line bg-card p-5";
const LAB_KINDS: Record<string, string> = { note: "Note", experiment: "Experiment", evidence: "Evidence", result: "Result", lesson: "Lesson", decision: "Decision" };

async function post(path: string, body: unknown): Promise<{ ok: boolean; body: { message?: string; publishedAt?: string; count?: number | null } }> {
  const response = await fetch(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

// Phase 4D: write one journal entry, preview it, publish or unpublish it. Nothing is public until
// published; a linked project is named on the public page only while that project is public.
export default function EntryEditor({ ownerId, initialEntry, initialState, projects, labEntries, initialLibrary }: {
  ownerId: string; initialEntry: JournalEntry; initialState: PublishState | null;
  projects: ProjectOption[]; labEntries: LabEntry[]; initialLibrary: LibraryItem[];
}) {
  const { run, busy, message, setMessage, online, locked, retry, region } = useVaultWriter(ownerId);
  const router = useRouter();
  const [saved, setSaved] = useState(initialEntry);
  const [state, setState] = useState(initialState);
  const [form, setForm] = useState<JournalEdit>(() => editOf(initialEntry));
  const [library, setLibrary] = useState(initialLibrary);
  const [confirming, setConfirming] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const edit = normalizeEdit(form);
  const dirty = !sameEdit(edit, editOf(saved));
  const disabled = busy || !online;
  const fileOf = (id: string) => library.find((f) => f.id === id) ?? null;
  const problems = publishProblems(editOf(saved), new Set(library.filter((f) => f.kind === "image").map((f) => f.id)));
  const status = entryStatus(saved, state ?? undefined);
  const upToDate = state !== null && state.draft_version === saved.version;
  const project = projects.find((p) => p.id === form.project_id) ?? null;
  const lab = form.project_id ? labEntries.filter((l) => l.project_id === form.project_id) : [];

  const set = (change: Partial<JournalEdit>) => { setForm((f) => ({ ...f, ...change })); setConfirming(null); };
  const setImage = (k: number, change: Partial<JournalEdit["images"][number]>) => set({ images: form.images.map((img, i) => i === k ? { ...img, ...change } : img) });

  function save() {
    void run((client) => saveEntry(client, ownerId, saved, edit), "Entry saved. Nothing is public until you publish.", (row) => {
      setSaved(row);
      setForm(editOf(row));
    });
  }

  async function upload(file: File): Promise<LibraryItem | null> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let added: LibraryItem | null = null;
    await run((client) => uploadToLibrary(client, ownerId, file.name, bytes, "image"), null, ({ file: row, existing }) => {
      const item: LibraryItem = { ...row, thumb: URL.createObjectURL(file) };
      added = item;
      setLibrary((list) => list.some((f) => f.id === item.id) ? list : [item, ...list]);
      setMessage({ text: existing ? `"${row.name}" is already in your library, so that copy is used.` : `"${row.name}" added to your library. It stays private until you publish.`, error: false });
    });
    return added;
  }

  function copyFrom(l: LabEntry) {
    set({ title: form.title || l.title.slice(0, JOURNAL_LIMITS.title), body: [form.body.trim(), l.body.trim()].filter(Boolean).join("\n\n") });
    setMessage({ text: `Copied "${l.title}" into this entry. Edit it before publishing; nothing was published.`, error: false });
  }

  // Publish or unpublish through the server, then wait until the homepage's Journal link matches.
  function change(kind: "publish" | "unpublish") {
    const draft = saved;
    void run(async (): Promise<Outcome<{ state: PublishState | null; confirmed: boolean }>> => {
      try {
        const r = kind === "publish"
          ? await post("/api/journal/publish", { entryId: draft.id, draftVersion: draft.version })
          : await post("/api/journal/unpublish", { entryId: draft.id });
        if (!r.ok) return { ok: false, reason: "failed", message: r.body.message ?? (kind === "publish" ? "Couldn't publish. Nothing changed on your public site." : "Couldn't unpublish. Try again.") };
        const confirmed = typeof r.body.count === "number" && await homepageShows(`data-journal="${r.body.count}"`);
        const now = r.body.publishedAt ?? new Date().toISOString();
        const next = kind === "publish"
          ? { entry_id: draft.id, slug: draft.slug, draft_version: draft.version, published_at: state?.published_at ?? now, updated_at: now }
          : null;
        return { ok: true, value: { state: next, confirmed } };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Nothing changed on your public site. Try again." };
      }
    }, null, ({ state: next, confirmed }) => {
      setState(next);
      setConfirming(null);
      setMessage(kind === "publish"
        ? { text: confirmed ? "Published. The entry is on your site now." : "Published. The entry page is live; your homepage's Journal link will follow within a minute.", error: false, keep: !confirmed }
        : { text: confirmed ? "Unpublished. The entry is off your site." : "Unpublished. The entry page is gone; your homepage will catch up within a minute.", error: false, keep: !confirmed });
      // Image copies nothing uses any more can go once the homepage has moved on.
      if (confirmed) void requestProfileFileCleanup();
    });
  }

  function remove() {
    void run((client) => deleteEntry(client, ownerId, saved), null, () => router.push("/vault/portfolio/journal"));
  }

  return (
    <>
      {locked && <LockedNotice retry={retry} />}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined} className="grid gap-6">
        <div>
          <Link href="/vault/portfolio/journal" className="text-sm text-muted underline underline-offset-4">← Journal</Link>
          <h2 className="mt-2 text-2xl font-bold">{saved.title || "Untitled entry"}</h2>
          <p className="mt-1 text-sm" aria-live="polite">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold">{status}</span>
            {state && <> <a href={`/journal/${state.slug}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">View public page<span className="sr-only"> (opens in a new tab)</span></a></>}
          </p>
        </div>

        <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <fieldset className={card}>
            <legend className="sr-only">Entry</legend>
            <label className={label}>Title
              <input maxLength={JOURNAL_LIMITS.title} value={form.title} className={field}
                onChange={(e) => set({ title: e.target.value })}
                onBlur={() => { if (!form.slug && !state) set({ slug: slugFrom(form.title) }); }} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Address <span className={hint}>(/journal/…, lowercase words and dashes)</span>
                <input value={form.slug} disabled={state !== null} className={field} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} />
                {state && <span className={hint}>Published entries keep their address. Unpublish to change it.</span>}
              </label>
              <label className={label}>Date <span className={hint}>(optional, for example March 2026)</span>
                <input maxLength={JOURNAL_LIMITS.date} value={form.entry_date} className={field} onChange={(e) => set({ entry_date: e.target.value })} />
              </label>
            </div>
            <label className={label}>Summary <span className={hint}>(optional, one or two sentences for the list)</span>
              <textarea rows={2} maxLength={JOURNAL_LIMITS.summary} value={form.summary} className={`${field} resize-y`} onChange={(e) => set({ summary: e.target.value })} />
            </label>
            <label className={label}>Text <span className={hint}>(plain text; a blank line starts a new paragraph; up to {JOURNAL_LIMITS.paragraphs} paragraphs)</span>
              <textarea rows={10} maxLength={JOURNAL_LIMITS.body} value={form.body} className={`${field} resize-y`} onChange={(e) => set({ body: e.target.value })} />
            </label>
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Project</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Project <span className="normal-case tracking-normal">(optional)</span></h3>
            <label className={label}>Part of
              <select className={field} value={form.case_study ? `case:${form.case_study}` : form.project_id ? `project:${form.project_id}` : ""}
                onChange={(e) => {
                  const [kind, value] = e.target.value.split(":");
                  set({ case_study: kind === "case" ? value : "", project_id: kind === "project" ? value : null });
                }}>
                <option value="">No project</option>
                <optgroup label="Hand-written case studies">
                  {CASE_STUDIES.map((c) => <option key={c.slug} value={`case:${c.slug}`}>{c.title}</option>)}
                </optgroup>
                {projects.length > 0 && (
                  <optgroup label="Your projects">
                    {projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.title}{p.public ? "" : " (not public)"}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {project && !project.public && (
              <p className="text-sm text-muted">This project isn&apos;t on your public site, so the published entry won&apos;t name it. It will once you publish the project&apos;s showcase.</p>
            )}
            {lab.length > 0 && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">Copy text from one of this project&apos;s Lab entries ({lab.length})</summary>
                <p className="mt-2 text-xs text-muted">A one-time copy into this draft. Lab entries stay private; edit the copy before publishing.</p>
                <ul className="mt-3 grid gap-2" aria-label="Lab entries">
                  {lab.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <span><span className="text-xs text-muted">{LAB_KINDS[l.kind] ?? l.kind}</span> · {l.title}</span>
                      <button type="button" className={small} onClick={() => copyFrom(l)}>Copy into this entry<span className="sr-only">: {l.title}</span></button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Images</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Images <span className="normal-case tracking-normal">(optional, up to {JOURNAL_LIMITS.images})</span></h3>
            {form.images.map((img, k) => {
              const file = fileOf(img.file);
              return (
                <div key={img.file} role="group" aria-label={`Image ${k + 1}`} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[4rem_1fr_auto] sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {file?.thumb ? <img src={file.thumb} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span aria-hidden className="grid h-16 w-16 place-items-center rounded-lg bg-background text-xs">IMG</span>}
                  <div className="grid gap-1">
                    <p className="text-xs text-muted">{file ? `${file.name} · ${sizeLabel(file.bytes)}` : <span className="text-danger">No longer in your library</span>}</p>
                    <label className={label}>Describe the image
                      <input maxLength={JOURNAL_LIMITS.alt} value={img.alt} className={field} onChange={(e) => setImage(k, { alt: e.target.value })} />
                    </label>
                  </div>
                  <button type="button" className={small} onClick={() => set({ images: form.images.filter((_, i) => i !== k) })}>Remove<span className="sr-only"> image {k + 1}</span></button>
                </div>
              );
            })}
            {form.images.length < JOURNAL_LIMITS.images && (
              <div className="flex flex-wrap items-center gap-2">
                <LibraryPicker kind="image" items={library.filter((f) => !form.images.some((i) => i.file === f.id))} disabled={disabled} label="Add an image"
                  onUpload={upload} onPick={(item) => set({ images: [...form.images, { file: item.id, alt: "" }] })} />
                <span className="text-xs text-muted">Public copies are re-encoded without location or camera details.</span>
              </div>
            )}
          </fieldset>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-lg">
            <button type="submit" disabled={disabled || !dirty} className={primary}>{busy ? "Saving…" : "Save draft"}</button>
            {!dirty
              ? <a href={`/vault/portfolio/journal/${saved.id}/preview`} target="_blank" rel="noopener noreferrer" className={button}>Preview<span className="sr-only"> (opens in a new tab)</span></a>
              : <span className="text-sm text-muted">Unsaved changes. Save to preview or publish.</span>}
            {message && (
              <p role={message.error ? "alert" : "status"} className={`basis-full text-sm ${message.error ? "text-danger" : "text-muted"}`}>
                {message.text} <button type="button" className="ml-2 text-muted underline" onClick={() => setMessage(null)}>Dismiss</button>
              </p>
            )}
          </div>
        </form>

        <section aria-labelledby="publish-heading" className="rounded-2xl border border-line bg-card p-5">
          <h3 id="publish-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">Publish</h3>
          {dirty ? (
            <p className="mt-2 text-sm text-muted">Save the draft first. Publishing uses the saved draft, exactly as the preview shows it.</p>
          ) : problems.length > 0 ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm font-semibold text-danger">Not ready to publish yet:</p>
              <ul className="list-disc pl-5 text-sm" aria-label="Before you can publish">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ) : upToDate ? (
            <p className="mt-2 text-sm text-muted">The saved draft is what your site shows. Nothing to publish.</p>
          ) : confirming !== "publish" ? (
            <button type="button" className={`${primary} mt-3`} disabled={disabled} onClick={() => setConfirming("publish")}>{state ? "Review and publish changes" : "Review and publish"}</button>
          ) : (
            <div className="mt-3 grid gap-3" role="group" aria-label="Confirm publishing this entry">
              <p className="font-semibold">{state ? `Replace the public entry at /journal/${saved.slug} with draft version ${saved.version}?` : `Publish draft version ${saved.version} at /journal/${saved.slug}?`}</p>
              <p className="text-sm text-muted">
                Anyone on the internet can read it{saved.images.length ? `, including ${saved.images.length === 1 ? "its image" : `its ${saved.images.length} images`}` : ""}.
                {project && !project.public ? " The project stays unnamed until it is public." : ""} Check the preview first if you haven&apos;t.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={disabled} onClick={() => change("publish")}>{busy ? "Publishing…" : "Publish now"}</button>
                <button type="button" className={button} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </div>
          )}
          {state && (
            <div className="mt-4 border-t border-line pt-4">
              {confirming === "unpublish" ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm unpublishing this entry">
                  <span className="text-sm">Take this entry off your site? The draft is kept.</span>
                  <button type="button" className={button} disabled={disabled} onClick={() => change("unpublish")}>Unpublish now</button>
                  <button type="button" className={small} onClick={() => setConfirming(null)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className={button} disabled={disabled} onClick={() => setConfirming("unpublish")}>Unpublish</button>
              )}
            </div>
          )}
        </section>

        {!state && (
          <section aria-label="Delete entry" className="rounded-2xl border border-line bg-card p-5">
            {confirming === "delete" ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm deleting this entry">
                <span className="text-sm">Delete this draft permanently?</span>
                <button type="button" className={`${button} border-danger text-danger`} disabled={disabled} onClick={remove}>Delete permanently</button>
                <button type="button" className={small} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className={small} disabled={disabled} onClick={() => setConfirming("delete")}>Delete entry</button>
            )}
          </section>
        )}
      </div>
    </>
  );
}
