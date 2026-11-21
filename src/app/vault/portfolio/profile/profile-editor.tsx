"use client";

import { useMemo, useState } from "react";
import {
  ICONS, KINDS, LIMITS, PHOTO_ALT_MAX, SEED, changedSections, filesUsed, normalize, publishProblems, saveDraft, splitEmail,
  type Certificate, type EntryKind, type Highlight, type IconName, type ProfileContent, type ProfileDraft, type ProfileLink,
  type ProfilePhoto, type ProfileResume, type ProfileVersion,
} from "@/lib/profile";
import { sizeLabel, uploadToLibrary, type LibraryKind } from "@/lib/library";
import type { LibraryItem } from "@/lib/library-server";
import LibraryPicker from "../library-picker";
import type { Outcome } from "@/lib/workspace";
import { LockedNotice, useVaultWriter } from "../../use-vault-writer";
import { field } from "../../projects/[id]/record-section";

const button = "rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const primary = "rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";
const label = "flex flex-col gap-1 text-sm font-medium";
const hint = "font-normal text-muted";
const card = "grid gap-4 rounded-2xl border border-line bg-card p-5";

// The form keeps lists as the text the owner types (one item per line, or comma-separated tools),
// so typing is never interrupted; they are split into items when saving.
type FormEntry = { kind: EntryKind; when: string; title: string; detail: string; where: string; tools: string; responsibilities: string; outcomes: string };
type Form = {
  name: string;
  hero: ProfileContent["hero"];
  highlights: Highlight[];
  aboutHeading: string;
  aboutText: string;
  timeline: FormEntry[];
  certificates: Certificate[];
  focus: string;
  links: ProfileLink[];
  contactHeading: string;
  contactText: string;
  email: string;
  resume: ProfileResume;
  photo: ProfilePhoto;
};

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);
const toForm = (c: ProfileContent): Form => ({
  name: c.name,
  hero: { ...c.hero },
  highlights: c.highlights.map((h) => ({ ...h })),
  aboutHeading: c.about.heading,
  aboutText: c.about.paragraphs.join("\n\n"),
  timeline: c.timeline.map((e) => ({ kind: e.kind, when: e.when, title: e.title, detail: e.detail, where: e.where,
    tools: e.tools.join(", "), responsibilities: e.responsibilities.join("\n"), outcomes: e.outcomes.join("\n") })),
  certificates: c.certificates.map((x) => ({ ...x })),
  focus: c.focus.join("\n"),
  links: c.links.map((l) => ({ ...l })),
  contactHeading: c.contact.heading,
  contactText: c.contact.text,
  email: c.contact.email.user || c.contact.email.domain ? `${c.contact.email.user}@${c.contact.email.domain}` : "",
  resume: { ...c.resume },
  photo: { ...c.photo },
});
const fromForm = (f: Form): ProfileContent => normalize({
  name: f.name,
  hero: f.hero,
  highlights: f.highlights,
  about: { heading: f.aboutHeading, paragraphs: f.aboutText.split(/\n\s*\n/) },
  timeline: f.timeline.map((e) => ({ kind: e.kind, when: e.when, title: e.title, detail: e.detail, where: e.where,
    tools: e.tools.split(","), responsibilities: lines(e.responsibilities), outcomes: lines(e.outcomes) })),
  certificates: f.certificates,
  focus: lines(f.focus),
  links: f.links,
  contact: { heading: f.contactHeading, text: f.contactText, email: splitEmail(f.email) },
  resume: f.resume,
  photo: f.photo,
});
// A suggested download name from the owner's name, e.g. "MD-Kaushik-Kamal-Resume.pdf".
const resumeName = (name: string) => `${name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "My"}-Resume.pdf`;
const same = (a: ProfileContent, b: ProfileContent) => JSON.stringify(a) === JSON.stringify(b);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function move<T>(items: T[], index: number, by: number): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item);
  return next;
}

// Up, down and remove buttons for one item in a list.
function ItemButtons({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove: (by: number) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <button type="button" className={small} disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => onMove(-1)}>↑</button>
      <button type="button" className={small} disabled={index === count - 1} aria-label={`Move ${name} down`} onClick={() => onMove(1)}>↓</button>
      <button type="button" className={small} aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
    </div>
  );
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; body: { message?: string; version?: number; publishedAt?: string | null } }> {
  const response = await fetch(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

type Live = { version: number; content: ProfileContent; published_at: string } | null;

// After publishing, asks for the homepage until it shows the new version (its root element carries
// the publish time). The first request gets the previous page and starts the rebuild, so a visitor
// doesn't. Gives up after a few seconds; the page still updates on later visits.
async function homepageShows(publishedAt: string): Promise<boolean> {
  const marker = `data-published="${publishedAt}"`;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch("/", { cache: "no-store", credentials: "omit" });
      if (response.ok && (await response.text()).includes(marker)) return true;
    } catch {
      // Try again until the attempts run out.
    }
  }
  return false;
}

// Phase 4B: edit the homepage text, preview it, publish it and roll back. The draft starts from
// what is published (or, before the first publish, from the text the homepage already shows).
export default function ProfileEditor({ ownerId, initialDraft, live: initialLive, initialVersions, historyLimited, initialLibrary }: {
  ownerId: string; initialDraft: ProfileDraft | null; live: Live; initialVersions: ProfileVersion[]; historyLimited: boolean; initialLibrary: LibraryItem[];
}) {
  const { run, busy, message, setMessage, online, locked, retry, region } = useVaultWriter(ownerId);
  const [saved, setSaved] = useState<ProfileDraft | null>(initialDraft);
  const [live, setLive] = useState<Live>(initialLive);
  const [versions, setVersions] = useState<ProfileVersion[]>(initialVersions);
  const [form, setForm] = useState<Form>(() => toForm(initialDraft?.content ?? initialLive?.content ?? SEED));
  const [confirming, setConfirming] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>(initialLibrary);
  const content = useMemo(() => fromForm(form), [form]);
  const dirty = !saved || !same(content, saved.content);
  const disabled = busy || !online;
  const fileOf = (id: string) => library.find((f) => f.id === id) ?? null;
  const problems = saved ? [
    ...publishProblems(saved.content),
    ...filesUsed(saved.content).filter((u) => !fileOf(u.id))
      .map((u) => `The ${u.part === "resume" ? "résumé" : "photo"} file is no longer in your library. Choose it again.`),
  ] : [];
  const changes = saved ? changedSections(saved.content, live?.content ?? null) : [];

  const set = (change: Partial<Form>) => { setForm((f) => ({ ...f, ...change })); setConfirming(false); };
  const setEntry = (i: number, change: Partial<FormEntry>) => set({ timeline: form.timeline.map((e, k) => k === i ? { ...e, ...change } : e) });

  function save() {
    void run((client) => saveDraft(client, ownerId, saved, content), "Profile draft saved. Nothing is public until you publish.", (row) => {
      setSaved(row);
      setForm(toForm(row.content));
    });
  }

  // Uploads into the private library (or finds the identical file already there) and returns it.
  async function upload(file: File, kind: LibraryKind): Promise<LibraryItem | null> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let added: LibraryItem | null = null;
    await run((client) => uploadToLibrary(client, ownerId, file.name, bytes, kind), null, ({ file: row, existing }) => {
      const item: LibraryItem = { ...row, thumb: row.kind === "image" ? URL.createObjectURL(file) : null };
      added = item;
      setLibrary((list) => list.some((f) => f.id === item.id) ? list : [item, ...list]);
      setMessage({ text: existing ? `"${row.name}" is already in your library, so that copy is used.` : `"${row.name}" added to your library. It stays private until you publish.`, error: false });
    });
    return added;
  }

  function restore(v: ProfileVersion) {
    void run((client) => saveDraft(client, ownerId, saved, v.content),
      `Version ${v.version} copied into the draft. Preview it, then publish to put it back on your site.`, (row) => {
        setSaved(row);
        setForm(toForm(row.content));
        setConfirming(false);
      });
  }

  function publish() {
    if (!saved) return;
    const draft = saved;
    void run(async (): Promise<Outcome<{ version: number; live: boolean }>> => {
      try {
        const r = await post("/api/profile/publish", { draftVersion: draft.version });
        if (!r.ok || typeof r.body.version !== "number") return { ok: false, reason: "failed", message: r.body.message ?? "Couldn't publish. Nothing changed on your public site." };
        const confirmed = typeof r.body.publishedAt === "string" && await homepageShows(r.body.publishedAt);
        return { ok: true, value: { version: r.body.version, live: confirmed } };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Nothing changed on your public site. Try again." };
      }
    }, null, ({ version, live: confirmed }) => {
      setMessage(confirmed
        ? { text: "Published. Your homepage shows it now.", error: false }
        : { text: "Published. Your homepage couldn't be checked just now; it will show the new version within a minute.", error: false, keep: true });
      const published_at = new Date().toISOString();
      setLive({ version, content: draft.content, published_at });
      setVersions((list) => [{ version, content: draft.content, published_at }, ...list]);
      setConfirming(false);
      // Public copies the new version no longer uses (an old résumé or photo) can go now that the
      // homepage has moved on. If it couldn't be confirmed, the Portfolio page does it later.
      if (confirmed) void fetch("/api/profile/cleanup", { method: "POST" }).catch(() => {});
    });
  }

  const resumeFile = form.resume.file ? fileOf(form.resume.file) : null;
  const photoFile = form.photo.file ? fileOf(form.photo.file) : null;

  return (
    <>
      {locked && <LockedNotice retry={retry} />}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined} className="grid gap-6">
        <div>
          <a href="/vault/portfolio" className="text-sm text-muted underline underline-offset-4">← Portfolio</a>
          <h2 className="mt-2 text-2xl font-bold">Profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The text on your homepage: introduction, highlights, about, experience and education, certificates, current focus and contact.
            Write only what you can stand behind. Empty sections and fields are left off the page.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5" aria-live="polite">
          {live ? (
            <p>
              <span className="font-semibold">Version {live.version} is on your homepage</span>, published {when(live.published_at)}.{" "}
              <a href="/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">View homepage<span className="sr-only"> (opens in a new tab)</span></a>
              <span className="block text-sm text-muted">Draft changes stay private until you publish again.</span>
            </p>
          ) : (
            <p>
              <span className="font-semibold">Nothing published from here yet.</span>{" "}
              <span className="text-sm text-muted">Your homepage shows the text it had before the Portfolio Manager. The form below starts from that text.</span>
            </p>
          )}
        </div>

        <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <fieldset className={card}>
            <legend className="sr-only">Introduction</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Introduction</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Your name
                <input maxLength={LIMITS.name} value={form.name} onChange={(e) => set({ name: e.target.value })} className={field} />
              </label>
              <label className={label}>Small line above the headline <span className={hint}>(optional)</span>
                <input maxLength={LIMITS.short} value={form.hero.eyebrow} onChange={(e) => set({ hero: { ...form.hero, eyebrow: e.target.value } })} className={field} />
              </label>
              <label className={label}>Headline, coloured first line
                <input maxLength={LIMITS.short} value={form.hero.accent} onChange={(e) => set({ hero: { ...form.hero, accent: e.target.value } })} className={field} />
              </label>
              <label className={label}>Headline, second line
                <input maxLength={LIMITS.short} value={form.hero.headline} onChange={(e) => set({ hero: { ...form.hero, headline: e.target.value } })} className={field} />
              </label>
              <label className={`${label} sm:col-span-2`}>Introduction <span className={hint}>({form.hero.intro.length}/{LIMITS.text})</span>
                <textarea rows={3} maxLength={LIMITS.text} value={form.hero.intro} onChange={(e) => set({ hero: { ...form.hero, intro: e.target.value } })} className={`${field} resize-y`} />
              </label>
            </div>
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Highlights</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Highlights <span className="normal-case tracking-normal">(the strip under the introduction, up to {LIMITS.highlights})</span></h3>
            {form.highlights.map((h, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
                <label className={label}>Icon
                  <select value={h.icon} className={field} onChange={(e) => set({ highlights: form.highlights.map((x, k) => k === i ? { ...x, icon: e.target.value as IconName } : x) })}>
                    {Object.entries(ICONS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                  </select>
                </label>
                <label className={label}>Title
                  <input maxLength={LIMITS.short} value={h.title} className={field} onChange={(e) => set({ highlights: form.highlights.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} />
                </label>
                <label className={label}>Detail
                  <input maxLength={LIMITS.short} value={h.detail} className={field} onChange={(e) => set({ highlights: form.highlights.map((x, k) => k === i ? { ...x, detail: e.target.value } : x) })} />
                </label>
                <ItemButtons name={`highlight ${i + 1}`} index={i} count={form.highlights.length}
                  onMove={(by) => set({ highlights: move(form.highlights, i, by) })} onRemove={() => set({ highlights: form.highlights.filter((_, k) => k !== i) })} />
              </div>
            ))}
            {form.highlights.length < LIMITS.highlights && (
              <button type="button" className={`${small} justify-self-start`} onClick={() => set({ highlights: [...form.highlights, { icon: "check", title: "", detail: "" }] })}>Add highlight</button>
            )}
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">About</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">About</h3>
            <label className={label}>Heading
              <input maxLength={LIMITS.short} value={form.aboutHeading} onChange={(e) => set({ aboutHeading: e.target.value })} className={field} />
            </label>
            <label className={label}>Text <span className={hint}>(leave a blank line between paragraphs; up to {LIMITS.paragraphs})</span>
              <textarea rows={6} value={form.aboutText} onChange={(e) => set({ aboutText: e.target.value })} className={`${field} resize-y`} />
            </label>
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Experience and education</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Experience and education <span className="normal-case tracking-normal">(shown in this order)</span></h3>
            {form.timeline.map((e, i) => (
              <div key={i} role="group" aria-label={`Entry ${i + 1}${e.title ? `: ${e.title}` : ""}${e.detail ? `, ${e.detail}` : ""}`} className="grid gap-3 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{e.title || `Entry ${i + 1}`}{e.detail ? ` · ${e.detail}` : ""}</p>
                  <ItemButtons name={`entry ${i + 1}`} index={i} count={form.timeline.length}
                    onMove={(by) => set({ timeline: move(form.timeline, i, by) })} onRemove={() => set({ timeline: form.timeline.filter((_, k) => k !== i) })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>Kind
                    <select value={e.kind} className={field} onChange={(ev) => setEntry(i, { kind: ev.target.value as EntryKind })}>
                      {Object.entries(KINDS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                  </label>
                  <label className={label}>When <span className={hint}>(for example 2022, or Mar–Aug 2022)</span>
                    <input maxLength={LIMITS.short} value={e.when} className={field} onChange={(ev) => setEntry(i, { when: ev.target.value })} />
                  </label>
                  <label className={label}>Title or role
                    <input maxLength={LIMITS.short} value={e.title} className={field} onChange={(ev) => setEntry(i, { title: ev.target.value })} />
                  </label>
                  <label className={label}>Organization or school
                    <input maxLength={LIMITS.short} value={e.detail} className={field} onChange={(ev) => setEntry(i, { detail: ev.target.value })} />
                  </label>
                  <label className={label}>Place <span className={hint}>(optional)</span>
                    <input maxLength={LIMITS.short} value={e.where} className={field} onChange={(ev) => setEntry(i, { where: ev.target.value })} />
                  </label>
                  <label className={label}>Tools <span className={hint}>(optional, comma-separated)</span>
                    <input value={e.tools} className={field} onChange={(ev) => setEntry(i, { tools: ev.target.value })} />
                  </label>
                  <label className={label}>What you did <span className={hint}>(optional, one per line)</span>
                    <textarea rows={3} value={e.responsibilities} className={`${field} resize-y`} onChange={(ev) => setEntry(i, { responsibilities: ev.target.value })} />
                  </label>
                  <label className={label}>What you learned <span className={hint}>(optional, one per line)</span>
                    <textarea rows={3} value={e.outcomes} className={`${field} resize-y`} onChange={(ev) => setEntry(i, { outcomes: ev.target.value })} />
                  </label>
                </div>
              </div>
            ))}
            {form.timeline.length < LIMITS.timeline && (
              <button type="button" className={`${small} justify-self-start`}
                onClick={() => set({ timeline: [...form.timeline, { kind: "work", when: "", title: "", detail: "", where: "", tools: "", responsibilities: "", outcomes: "" }] })}>Add entry</button>
            )}
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Certificates</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Certificates <span className="normal-case tracking-normal">(hidden while empty)</span></h3>
            {form.certificates.map((x, i) => (
              <div key={i} role="group" aria-label={`Certificate ${i + 1}`} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
                <label className={label}>Name
                  <input maxLength={LIMITS.short} value={x.name} className={field} onChange={(e) => set({ certificates: form.certificates.map((c, k) => k === i ? { ...c, name: e.target.value } : c) })} />
                </label>
                <label className={label}>Issued by
                  <input maxLength={LIMITS.short} value={x.issuer} className={field} onChange={(e) => set({ certificates: form.certificates.map((c, k) => k === i ? { ...c, issuer: e.target.value } : c) })} />
                </label>
                <label className={label}>When
                  <input maxLength={LIMITS.short} value={x.when} className={field} onChange={(e) => set({ certificates: form.certificates.map((c, k) => k === i ? { ...c, when: e.target.value } : c) })} />
                </label>
                <label className={label}>Link <span className={hint}>(optional, https)</span>
                  <input inputMode="url" placeholder="https://" value={x.href} className={field} onChange={(e) => set({ certificates: form.certificates.map((c, k) => k === i ? { ...c, href: e.target.value } : c) })} />
                </label>
                <div className="sm:col-span-2">
                  <ItemButtons name={`certificate ${i + 1}`} index={i} count={form.certificates.length}
                    onMove={(by) => set({ certificates: move(form.certificates, i, by) })} onRemove={() => set({ certificates: form.certificates.filter((_, k) => k !== i) })} />
                </div>
              </div>
            ))}
            {form.certificates.length < LIMITS.certificates && (
              <button type="button" className={`${small} justify-self-start`} onClick={() => set({ certificates: [...form.certificates, { name: "", issuer: "", when: "", href: "" }] })}>Add certificate</button>
            )}
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Current focus</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Current focus</h3>
            <label className={label}>Items <span className={hint}>(one per line, up to {LIMITS.focus})</span>
              <textarea rows={4} value={form.focus} onChange={(e) => set({ focus: e.target.value })} className={`${field} resize-y`} />
            </label>
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Contact and links</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Contact and links</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Heading
                <input maxLength={LIMITS.short} value={form.contactHeading} onChange={(e) => set({ contactHeading: e.target.value })} className={field} />
              </label>
              <label className={label}>Email address <span className={hint}>(optional; the page never shows it whole in its source)</span>
                <input type="email" autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} className={field} />
              </label>
              <label className={`${label} sm:col-span-2`}>Text
                <textarea rows={2} maxLength={LIMITS.text} value={form.contactText} onChange={(e) => set({ contactText: e.target.value })} className={`${field} resize-y`} />
              </label>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-semibold">Links <span className={hint}>(https only, up to {LIMITS.links})</span></p>
              {form.links.map((l, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <input aria-label={`Link ${i + 1} label`} placeholder="Label" maxLength={LIMITS.linkLabel} value={l.label} className={field}
                    onChange={(e) => set({ links: form.links.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} />
                  <input aria-label={`Link ${i + 1} address`} placeholder="https://" inputMode="url" value={l.href} className={field}
                    onChange={(e) => set({ links: form.links.map((x, k) => k === i ? { ...x, href: e.target.value } : x) })} />
                  <ItemButtons name={`link ${i + 1}`} index={i} count={form.links.length}
                    onMove={(by) => set({ links: move(form.links, i, by) })} onRemove={() => set({ links: form.links.filter((_, k) => k !== i) })} />
                </div>
              ))}
              {form.links.length < LIMITS.links && (
                <button type="button" className={`${small} justify-self-start`} onClick={() => set({ links: [...form.links, { label: "", href: "" }] })}>Add link</button>
              )}
            </div>
          </fieldset>

          <fieldset className={card}>
            <legend className="sr-only">Résumé and photo</legend>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Résumé and photo <span className="normal-case tracking-normal">(both optional; hidden while empty)</span></h3>
            <p className="text-sm text-muted">
              Files come from your private <a href="/vault/portfolio/files" className="underline underline-offset-4">files library</a>. They are copied to the public site only when you publish, and removed from it when you take them off.
            </p>

            <div role="group" aria-label="Résumé" className="grid gap-3 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold">Résumé</p>
              {resumeFile ? <p className="text-sm">PDF: <span className="font-medium">{resumeFile.name}</span> <span className="text-muted">· {sizeLabel(resumeFile.bytes)}</span></p>
                : form.resume.file ? <p className="text-sm text-danger">The chosen PDF is no longer in your library. Choose another.</p>
                : <p className="text-sm text-muted">None chosen. The homepage shows no résumé button.</p>}
              <div className="flex flex-wrap gap-2">
                <LibraryPicker kind="pdf" items={library} disabled={disabled} label={form.resume.file ? "Choose another PDF" : "Choose a résumé PDF"}
                  onUpload={(file) => upload(file, "pdf")}
                  onPick={(item) => set({ resume: { file: item.id, name: form.resume.name || resumeName(form.name) } })} />
                {form.resume.file && <button type="button" className={small} onClick={() => set({ resume: { ...form.resume, file: "" } })}>Remove résumé</button>}
              </div>
              {form.resume.file && (
                <label className={label}>Download file name <span className={hint}>(what visitors&apos; browsers save it as; ends in .pdf)</span>
                  <input maxLength={100} value={form.resume.name} onChange={(e) => set({ resume: { ...form.resume, name: e.target.value } })} className={field} />
                </label>
              )}
              <p className="text-xs text-muted">
                Everything inside the PDF becomes public when you publish, including its text and document properties such as the author name.
                Consider a version without your home address or phone number.
              </p>
            </div>

            <div role="group" aria-label="Photo" className="grid gap-3 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold">Photo <span className={hint}>(shown in the About section)</span></p>
              {photoFile ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photoFile.thumb && <img src={photoFile.thumb} alt="" className="h-20 w-16 rounded-lg object-cover" />}
                  <p className="text-sm"><span className="font-medium">{photoFile.name}</span> <span className="text-muted">· {sizeLabel(photoFile.bytes)}</span></p>
                </div>
              ) : form.photo.file ? <p className="text-sm text-danger">The chosen image is no longer in your library. Choose another.</p>
                : <p className="text-sm text-muted">None chosen.</p>}
              <div className="flex flex-wrap gap-2">
                <LibraryPicker kind="image" items={library} disabled={disabled} label={form.photo.file ? "Choose another image" : "Choose a photo"}
                  onUpload={(file) => upload(file, "image")}
                  onPick={(item) => set({ photo: { ...form.photo, file: item.id } })} />
                {form.photo.file && <button type="button" className={small} onClick={() => set({ photo: { ...form.photo, file: "" } })}>Remove photo</button>}
              </div>
              {form.photo.file && (
                <label className={label}>Describe the photo <span className={hint}>(for people who can&apos;t see it, up to {PHOTO_ALT_MAX} characters)</span>
                  <input maxLength={PHOTO_ALT_MAX} value={form.photo.alt} onChange={(e) => set({ photo: { ...form.photo, alt: e.target.value } })} className={field} />
                </label>
              )}
              <p className="text-xs text-muted">The public copy is re-encoded upright without its hidden details (camera, date, GPS location). Your library original is unchanged.</p>
            </div>
          </fieldset>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-lg">
            <button type="submit" disabled={disabled || !dirty} className={primary}>{busy ? "Saving…" : "Save draft"}</button>
            {saved && !dirty
              ? <a href="/vault/portfolio/profile/preview" target="_blank" rel="noopener noreferrer" className={button}>Preview<span className="sr-only"> (opens in a new tab)</span></a>
              : <span className="text-sm text-muted">{dirty ? "Unsaved changes. Save to preview or publish." : ""}</span>}
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
              <p className="text-sm font-semibold text-danger">Not ready to publish yet. Fix {problems.length === 1 ? "this" : `these ${problems.length} things`} first:</p>
              <ul className="list-disc pl-5 text-sm" aria-label="Before you can publish">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ) : changes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">The saved draft matches what is on your homepage. Nothing to publish.</p>
          ) : !confirming ? (
            <button type="button" className={`${primary} mt-3`} disabled={disabled} onClick={() => setConfirming(true)}>Review and publish</button>
          ) : saved && (
            <div className="mt-3 grid gap-3" role="group" aria-label="Confirm what changes on your homepage">
              <p className="font-semibold">Publishing draft version {saved.version} changes these parts of your homepage:</p>
              <ul className="list-disc pl-5 text-sm">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="text-sm text-muted">Anyone on the internet can see your homepage. Check the preview first if you haven&apos;t.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={disabled} onClick={publish}>{busy ? "Publishing…" : "Publish now"}</button>
                <button type="button" className={button} onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="history-heading" className="rounded-2xl border border-line bg-card p-5">
          <h3 id="history-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">History</h3>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Every version you publish is kept here. You can copy any of them back into the draft.</p>
          ) : (
            <ol className="mt-3 grid gap-2">
              {versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">Version {v.version}</span> · {when(v.published_at)}
                    {live?.version === v.version && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold">On your homepage</span>}
                  </span>
                  <button type="button" className={small} disabled={disabled || dirty || (saved !== null && same(saved.content, v.content))}
                    title={dirty ? "Save or undo your changes first" : undefined} onClick={() => restore(v)}>
                    Restore to draft<span className="sr-only"> (version {v.version})</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {historyLimited && <p className="mt-2 text-xs text-muted">Showing the latest 50 versions.</p>}
        </section>
      </div>
    </>
  );
}
