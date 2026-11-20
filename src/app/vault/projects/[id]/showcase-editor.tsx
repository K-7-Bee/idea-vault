"use client";

import { useMemo, useState } from "react";
import { isImage, type ProjectFile } from "@/lib/project-files";
import {
  LIMITS, SECTIONS, draftSections, parseTechnologies, publicImageProblem, publishProblems, saveDraft, suggestedDraft,
  type DraftEdit, type LiveShowcase, type ShowcaseDraft,
} from "@/lib/showcase";
import type { Outcome, Project } from "@/lib/workspace";
import { field, type Writer } from "./record-section";
import { Thumb } from "./story-image";

const button = "rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const primary = "rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

type Form = DraftEdit & { technologiesText: string };
const toForm = (d: DraftEdit): Form => ({ ...d, links: d.links.map((l) => ({ ...l })), images: d.images.map((i) => ({ ...i })), technologiesText: d.technologies.join(", ") });
const fromForm = ({ technologiesText, ...rest }: Form): DraftEdit => ({ ...rest, technologies: parseTechnologies(technologiesText) });
const editOf = (d: ShowcaseDraft): DraftEdit => ({ slug: d.slug, title: d.title, category: d.category, summary: d.summary,
  technologies: d.technologies ?? [], sections: d.sections ?? {}, links: d.links ?? [], images: d.images ?? [] });
const same = (a: DraftEdit, b: DraftEdit) => JSON.stringify(a) === JSON.stringify(b);

async function post(path: string, body: unknown): Promise<{ ok: boolean; body: { message?: string; version?: number; slug?: string } }> {
  const response = await fetch(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

// Phase 4A: the project's public showcase. The owner writes a private draft here (nothing from the
// project is copied in automatically), previews it, and publishes it after confirming exactly what
// becomes public. Only completed, active projects can be published.
// The draft and live state are owned by the workspace, so switching tabs or changing the stage on
// the Overview tab never leaves this view out of date.
export default function ShowcaseEditor({ ownerId, project, onProject, files, writer, saved, setSaved, liveShowcase, setLive }: {
  ownerId: string; project: Project; onProject: (change: Partial<Project>) => void; files: ProjectFile[]; writer: Writer;
  saved: ShowcaseDraft | null; setSaved: (draft: ShowcaseDraft) => void;
  liveShowcase: LiveShowcase | null; setLive: (live: LiveShowcase | null) => void;
}) {
  // The database drops the snapshot whenever the project stops being published.
  const live = project.publication_status === "published" ? liveShowcase : null;
  const [form, setForm] = useState<Form>(() => toForm(saved ? editOf(saved) : suggestedDraft(project)));
  const [confirming, setConfirming] = useState(false);
  const edit = useMemo(() => fromForm(form), [form]);
  const dirty = !saved || !same(edit, editOf(saved));
  const disabled = writer.busy || !writer.online;
  const archived = project.archived_at !== null;
  const problems = publishProblems(saved ? editOf(saved) : null, project, files);
  const images = files.filter(isImage);
  const chosen = new Set(form.images.map((i) => i.file_id));
  const fileById = (id: string) => files.find((f) => f.id === id);

  const set = (change: Partial<Form>) => { setForm((f) => ({ ...f, ...change })); setConfirming(false); };
  const setSection = (key: string, body: string) => set({ sections: { ...form.sections, [key]: body } });
  const moveImage = (index: number, by: number) => {
    const next = [...form.images];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    set({ images: next });
  };

  function save() {
    void writer.run((client) => saveDraft(client, ownerId, project.id, saved, edit), "Showcase draft saved. Nothing is public until you publish.", (row) => {
      setSaved(row);
      setForm(toForm(editOf(row)));
    });
  }

  function publish() {
    if (!saved) return;
    void writer.run(async (): Promise<Outcome<{ version: number; slug: string }>> => {
      try {
        const r = await post("/api/showcase/publish", { projectId: project.id, draftVersion: saved.version });
        if (!r.ok || typeof r.body.version !== "number") return { ok: false, reason: "failed", message: r.body.message ?? "Couldn't publish. Nothing changed on your public site." };
        return { ok: true, value: { version: r.body.version, slug: r.body.slug ?? saved.slug } };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Nothing changed on your public site. Try again." };
      }
    }, "Published. It's on your public site now.", ({ version, slug }) => {
      setLive({ project_id: project.id, slug, published_at: new Date().toISOString() });
      onProject({ publication_status: "published", version });
      setConfirming(false);
    });
  }

  function unpublish() {
    void writer.run(async (): Promise<Outcome<number>> => {
      try {
        const r = await post("/api/showcase/unpublish", { projectId: project.id });
        if (!r.ok || typeof r.body.version !== "number") return { ok: false, reason: "failed", message: r.body.message ?? "Couldn't unpublish. Try again." };
        return { ok: true, value: r.body.version };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Try again." };
      }
    }, "Unpublished. It's no longer on your public site; the draft is kept.", (version) => {
      setLive(null);
      onProject({ publication_status: "ready", version });
    });
  }

  return (
    <section aria-label="Showcase" className="grid gap-4">
      <div className="rounded-2xl border border-line bg-card p-5" aria-live="polite">
        {live ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-semibold">On your public site</span> at{" "}
              <a href={`/projects/${live.slug}`} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">/projects/{live.slug}</a>
              <span className="sr-only"> (opens in a new tab)</span>.
              <span className="block text-sm text-muted">Visitors see the version you last published. Draft changes stay private until you publish again.</span>
            </p>
            <button type="button" className={button} disabled={disabled} onClick={unpublish}>Unpublish</button>
          </div>
        ) : (
          <p>
            <span className="font-semibold">Not on your public site.</span>{" "}
            <span className="text-sm text-muted">Only the fields below are ever published, and only after you confirm. Notes, tasks, files and Drive links stay private.</span>
          </p>
        )}
      </div>

      <form className="grid gap-4 rounded-2xl border border-line bg-card p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Public text</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Public title
            <input maxLength={LIMITS.title} value={form.title} onChange={(e) => set({ title: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Web address
            <span className="flex items-center gap-1">
              <span className="text-muted">/projects/</span>
              <input maxLength={LIMITS.slug} value={form.slug} placeholder="line-rover" aria-describedby="slug-hint"
                onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className={field} />
            </span>
            <span id="slug-hint" className="font-normal text-muted">Lowercase letters, numbers and hyphens. Keep it stable once published.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Category <span className="font-normal text-muted">(optional, for example Electrical engineering)</span>
            <input maxLength={LIMITS.category} value={form.category} onChange={(e) => set({ category: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tools and topics <span className="font-normal text-muted">(comma-separated)</span>
            <input value={form.technologiesText} onChange={(e) => set({ technologiesText: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            Public summary <span className="font-normal text-muted">({form.summary.length}/{LIMITS.summary})</span>
            <textarea rows={3} maxLength={LIMITS.summary} value={form.summary} onChange={(e) => set({ summary: e.target.value })} className={`${field} resize-y`} />
          </label>
        </div>

        <details open={draftSections(form.sections).length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Case study sections (optional; empty ones are left out)</summary>
          <div className="mt-3 grid gap-3">
            {SECTIONS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1 text-sm font-medium">
                {label}
                <textarea rows={3} maxLength={LIMITS.section} value={form.sections[key] ?? ""} onChange={(e) => setSection(key, e.target.value)} className={`${field} resize-y`} />
              </label>
            ))}
            <p className="text-sm text-muted">Write only what you can stand behind. Measurements and results should come from your own records.</p>
          </div>
        </details>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Links <span className="font-normal text-muted">(https only, up to {LIMITS.links})</span></legend>
          {form.links.map((link, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input aria-label={`Link ${i + 1} label`} placeholder="Label" maxLength={LIMITS.linkLabel} value={link.label} className={field}
                onChange={(e) => set({ links: form.links.map((l, k) => k === i ? { ...l, label: e.target.value } : l) })} />
              <input aria-label={`Link ${i + 1} address`} placeholder="https://" inputMode="url" value={link.href} className={field}
                onChange={(e) => set({ links: form.links.map((l, k) => k === i ? { ...l, href: e.target.value } : l) })} />
              <button type="button" className={small} onClick={() => set({ links: form.links.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          ))}
          {form.links.length < LIMITS.links && (
            <button type="button" className={`${small} justify-self-start`} onClick={() => set({ links: [...form.links, { label: "", href: "" }] })}>Add link</button>
          )}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">Images <span className="font-normal text-muted">(the first is the cover; up to {LIMITS.images})</span></legend>
          <p className="text-sm text-muted">Chosen images are copied to your public site when you publish. The originals in Drive are never shared.</p>
          {form.images.length > 0 && (
            <ol className="grid gap-2">
              {form.images.map((img, i) => {
                const file = fileById(img.file_id);
                const problem = publicImageProblem(file);
                return (
                  <li key={img.file_id} className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
                    {file ? <Thumb file={file} alt="" className="h-20 w-24 rounded-lg" /> : <span className="text-xs text-muted">Removed</span>}
                    <div className="grid gap-1">
                      <span className="break-all text-xs text-muted">{i === 0 ? "Cover · " : ""}{file?.name ?? "This file is no longer on the project"}</span>
                      <input aria-label={`Description of image ${i + 1}`} placeholder="Describe the image for people who can't see it" maxLength={LIMITS.alt}
                        value={img.alt} className={field}
                        onChange={(e) => set({ images: form.images.map((x, k) => k === i ? { ...x, alt: e.target.value } : x) })} />
                      {problem && <span className="text-xs text-danger">{problem}</span>}
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className={small} disabled={i === 0} aria-label={`Move image ${i + 1} up`} onClick={() => moveImage(i, -1)}>↑</button>
                      <button type="button" className={small} disabled={i === form.images.length - 1} aria-label={`Move image ${i + 1} down`} onClick={() => moveImage(i, 1)}>↓</button>
                      <button type="button" className={small} onClick={() => set({ images: form.images.filter((_, k) => k !== i) })}>Remove</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {images.length === 0 ? (
            <p className="text-sm text-muted">No images on this project yet. Add them on the Files tab.</p>
          ) : form.images.length < LIMITS.images && (
            <ul className="flex flex-wrap gap-2" aria-label="Project images you can add">
              {images.filter((f) => !chosen.has(f.id)).map((f) => {
                const problem = publicImageProblem(f);
                return (
                  <li key={f.id}>
                    <button type="button" disabled={!!problem} title={problem ?? `Add ${f.name}`}
                      className="grid w-28 gap-1 rounded-xl border border-line p-1 text-left text-xs disabled:opacity-50"
                      onClick={() => set({ images: [...form.images, { file_id: f.id, alt: "" }] })}>
                      <Thumb file={f} alt="" className="h-20 w-full rounded-lg" />
                      <span className="truncate">{problem ? "Can't publish" : "Add"} · {f.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button type="submit" disabled={disabled || !dirty} className={primary}>{writer.busy ? "Saving…" : "Save draft"}</button>
          {saved && !dirty
            ? <a href={`/vault/portfolio/preview/${project.id}`} target="_blank" rel="noopener noreferrer" className={button}>Preview<span className="sr-only"> (opens in a new tab)</span></a>
            : <span className="text-sm text-muted">{dirty ? "Unsaved changes. Save to preview or publish." : ""}</span>}
        </div>
      </form>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{live ? "Publish changes" : "Publish"}</h3>
        {dirty ? (
          <p className="mt-2 text-sm text-muted">Save the draft first. Publishing uses the saved draft, exactly as the preview shows it.</p>
        ) : problems.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm" aria-label="Before you can publish">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : !confirming ? (
          <button type="button" className={`${primary} mt-3`} disabled={disabled || archived} onClick={() => setConfirming(true)}>
            {live ? "Review and publish changes" : "Review and publish"}
          </button>
        ) : saved && (
          <div className="mt-3 grid gap-3" role="group" aria-label="Confirm what becomes public">
            <p className="font-semibold">This becomes public at /projects/{saved.slug}:</p>
            <ul className="list-disc pl-5 text-sm">
              <li>Title: {saved.title}</li>
              {saved.category && <li>Category: {saved.category}</li>}
              <li>Summary: {saved.summary}</li>
              {saved.technologies.length > 0 && <li>Tools and topics: {saved.technologies.join(", ")}</li>}
              {draftSections(saved.sections).map((s) => <li key={s.key}>Section: {s.label}</li>)}
              <li>{saved.images.length === 0 ? "No images" : `${saved.images.length} image${saved.images.length === 1 ? "" : "s"}: ${saved.images.map((i) => `“${i.alt}”`).join(", ")}`}</li>
              {saved.links.map((l) => <li key={l.href}>Link: {l.label} ({l.href})</li>)}
            </ul>
            <p className="text-sm text-muted">Nothing else from this project is published. Anyone on the internet will be able to see this page.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={disabled} onClick={publish}>{writer.busy ? "Publishing…" : "Publish now"}</button>
              <button type="button" className={button} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
