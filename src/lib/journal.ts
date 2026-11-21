import type { SupabaseClient } from "@supabase/supabase-js";
import type { Outcome } from "./workspace";
import { projects as caseStudies } from "./projects";

// Phase 4D: the Journal. The owner writes private drafts (journal_entries, migration 016) and
// publishes each one on its own into a public snapshot (journal_published). Visitors read through
// journal_public(), which names a linked project only while it is public. Plain text throughout:
// pages render it as text, never HTML. Shared by the Vault, the preview, the routes and public pages.

export const JOURNAL_LIMITS = { title: 120, summary: 300, body: 12000, paragraphs: 20, date: 40, images: 4, alt: 200 } as const;
export const CASE_STUDIES: { slug: string; title: string }[] = caseStudies.map((p) => ({ slug: p.slug, title: p.title }));
export const caseStudyTitle = (slug: string) => CASE_STUDIES.find((c) => c.slug === slug)?.title ?? null;

export type JournalImage = { file: string; alt: string };
export type JournalEntry = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  entry_date: string;
  project_id: string | null;
  case_study: string;
  images: JournalImage[];
  created_at: string;
  updated_at: string;
  version: number;
};
export type JournalEdit = Pick<JournalEntry, "slug" | "title" | "summary" | "body" | "entry_date" | "project_id" | "case_study" | "images">;
export const ENTRY_COLUMNS = "id, slug, title, summary, body, entry_date, project_id, case_study, images, created_at, updated_at, version";
// What the owner can read about a published entry (column grant in 016).
export type PublishState = { entry_id: string; slug: string; draft_version: number; published_at: string; updated_at: string };
export const STATE_COLUMNS = "entry_id, slug, draft_version, published_at, updated_at";
// What journal_public() returns to visitors.
export type PublishedEntry = {
  slug: string; title: string; summary: string; body: string; entry_date: string; images: JournalImage[];
  project_slug: string | null; project_title: string | null; published_at: string; updated_at: string;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LIBRARY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HTML_LIKE = /<[A-Za-z/!]/;
export const slugOk = (slug: string) => SLUG.test(slug) && slug.length >= 3 && slug.length <= 60;

// A suggested address from a title: lowercase words joined by dashes.
export function slugFrom(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

// Paragraphs as shown on the page: split at blank lines, trimmed, empty ones dropped.
export const paragraphs = (body: string) => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const text = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const line = (v: unknown, max: number) => text(v, max).replace(/\s+/g, " ");

// Brings edited or stored content into the exact shape, trimming and capping. Never throws.
export function normalizeEdit(input: Partial<Record<keyof JournalEdit, unknown>>): JournalEdit {
  const caseStudy = typeof input.case_study === "string" && caseStudyTitle(input.case_study) ? input.case_study : "";
  const project = typeof input.project_id === "string" && LIBRARY_ID.test(input.project_id) && !caseStudy ? input.project_id : null;
  const images = (Array.isArray(input.images) ? input.images : [])
    .filter((i): i is { file: unknown; alt: unknown } => typeof i === "object" && i !== null)
    .map((i) => ({ file: typeof i.file === "string" ? i.file.trim() : "", alt: line(i.alt, JOURNAL_LIMITS.alt) }))
    .filter((i) => LIBRARY_ID.test(i.file) || /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(i.file))
    .filter((i, k, all) => all.findIndex((x) => x.file === i.file) === k)
    .slice(0, JOURNAL_LIMITS.images);
  return {
    slug: line(input.slug, 60).toLowerCase(),
    title: line(input.title, JOURNAL_LIMITS.title),
    summary: line(input.summary, JOURNAL_LIMITS.summary),
    body: paragraphs(text(input.body, JOURNAL_LIMITS.body)).slice(0, JOURNAL_LIMITS.paragraphs).join("\n\n"),
    entry_date: line(input.entry_date, JOURNAL_LIMITS.date),
    project_id: project,
    case_study: caseStudy,
    images,
  };
}

export const editOf = (e: JournalEntry): JournalEdit => normalizeEdit(e);
export const sameEdit = (a: JournalEdit, b: JournalEdit) => JSON.stringify(a) === JSON.stringify(b);

// Everything that stops an entry from being published, in plain words. Empty means ready.
// knownImages: library ids still in the library (a deleted file is reported).
export function publishProblems(e: JournalEdit, knownImages?: Set<string>): string[] {
  const problems: string[] = [];
  if (!slugOk(e.slug)) problems.push("Give the entry an address: 3 to 60 lowercase letters, numbers and single dashes, like solar-charger-notes.");
  if (!e.title) problems.push("Add a title.");
  if (!e.body) problems.push("Write the entry's text.");
  if ([e.title, e.summary, e.body, e.entry_date, ...e.images.map((i) => i.alt)].some((s) => HTML_LIKE.test(s))) {
    problems.push("Remove the HTML tag from your text. Write plain text; the page adds its own formatting.");
  }
  e.images.forEach((img, k) => {
    if (!img.alt) problems.push(`Describe image ${k + 1} for people who can't see it.`);
    if (knownImages && !knownImages.has(img.file)) problems.push(`Image ${k + 1} is no longer in your library. Remove it or choose another.`);
  });
  return problems;
}

const FAILED = { ok: false, reason: "failed", message: "Couldn't save the entry. Check your connection and try again. Your changes are still here." } as const;
const CONFLICT = { ok: false, reason: "conflict", message: "The entry changed in another tab or device. Nothing was overwritten. Reload to see the saved version." } as const;

export function asEntry(row: Record<string, unknown>): JournalEntry {
  const edit = normalizeEdit(row);
  return { ...edit, id: String(row.id), created_at: String(row.created_at ?? ""), updated_at: String(row.updated_at ?? ""), version: Number(row.version) };
}

// Starts a new private draft, optionally from copied text, and returns it.
export async function createEntry(client: SupabaseClient, ownerId: string, seed: Partial<JournalEdit> = {}): Promise<Outcome<JournalEntry>> {
  try {
    const value = normalizeEdit(seed);
    const result = await client.from("journal_entries").insert({ id: crypto.randomUUID(), user_id: ownerId, ...value }).select(ENTRY_COLUMNS);
    const row = !result.error && Array.isArray(result.data) ? result.data[0] : null;
    return row ? { ok: true, value: asEntry(row) } : FAILED;
  } catch {
    return FAILED;
  }
}

// Saves a draft only if nobody else saved it since (version check), like every Vault record.
export async function saveEntry(client: SupabaseClient, ownerId: string, base: JournalEntry, edit: JournalEdit): Promise<Outcome<JournalEntry>> {
  try {
    const result = await client.from("journal_entries").update(normalizeEdit(edit))
      .eq("id", base.id).eq("user_id", ownerId).eq("version", base.version).select(ENTRY_COLUMNS);
    if (result.error) {
      if (result.error.code === "23514" && /address/.test(result.error.message)) return { ok: false, reason: "invalid", message: result.error.message };
      if (result.error.code === "23514") return { ok: false, reason: "invalid", message: "Something in the entry isn't allowed: check the address and the image list." };
      if (result.error.code === "23503") return { ok: false, reason: "invalid", message: "That project no longer exists. Choose another." };
      return FAILED;
    }
    const row = Array.isArray(result.data) ? result.data[0] : null;
    return row ? { ok: true, value: asEntry(row) } : CONFLICT;
  } catch {
    return FAILED;
  }
}

export async function deleteEntry(client: SupabaseClient, ownerId: string, entry: JournalEntry): Promise<Outcome<JournalEntry>> {
  try {
    const result = await client.from("journal_entries").delete().eq("id", entry.id).eq("user_id", ownerId).select("id");
    if (result.error) {
      return result.error.code === "23503"
        ? { ok: false, reason: "invalid", message: "This entry is published. Unpublish it before deleting it." }
        : { ok: false, reason: "failed", message: "Couldn't delete the entry. Try again." };
    }
    return result.data?.length ? { ok: true, value: entry } : { ok: false, reason: "conflict", message: "That entry was already deleted." };
  } catch {
    return { ok: false, reason: "failed", message: "Couldn't delete the entry. Try again." };
  }
}
