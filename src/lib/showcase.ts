import type { SupabaseClient } from "@supabase/supabase-js";
import type { Outcome } from "./workspace";

// Phase 4A: project showcases. The owner edits a private draft (project_showcases); publishing
// copies whitelisted fields into the public snapshot (showcases, migration 013). Shared by the
// Vault editor, the preview, the publish route and the public pages.

export const SECTIONS = [
  { key: "problem", label: "The problem" },
  { key: "objective", label: "Objective" },
  { key: "approach", label: "Approach" },
  { key: "implementation", label: "Implementation" },
  { key: "results", label: "Results" },
  { key: "limitations", label: "Limitations" },
  { key: "lessons", label: "Lessons learned" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

// The hand-written case studies in src/lib/projects.ts keep these addresses (also enforced in SQL).
export const RESERVED_SLUGS = ["waste-to-energy-lighting", "cha-restaurant", "idea-vault"] as const;

export const LIMITS = { slug: 60, title: 120, category: 60, summary: 400, section: 5000, technologies: 12, technology: 40, links: 5, linkLabel: 80, images: 8, alt: 200 };
// Public copies: JPEG, PNG or WebP, at most 5 MB each (the "showcase" bucket's own limits).
export const PUBLIC_IMAGE_MAX = 5 * 1024 * 1024;
export const PUBLIC_IMAGE_TYPES: Record<string, "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type ShowcaseImage = { file_id: string; alt: string };
export type ShowcaseLink = { label: string; href: string };
export type ShowcaseDraft = {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  technologies: string[];
  sections: Partial<Record<SectionKey, string>>;
  links: ShowcaseLink[];
  images: ShowcaseImage[];
  version: number;
  updated_at: string;
};
export type DraftEdit = Pick<ShowcaseDraft, "slug" | "title" | "category" | "summary" | "technologies" | "sections" | "links" | "images">;
export const DRAFT_COLUMNS = "id, project_id, slug, title, category, summary, technologies, sections, links, images, version, updated_at";

// What visitors can read (column-level grant in 013; never the owner or project id).
export const PUBLIC_COLUMNS = "slug, title, category, summary, technologies, sections, links, images, published_at";
export type PublishedShowcase = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  technologies: string[];
  sections: { key: string; body: string }[];
  links: ShowcaseLink[];
  images: { path: string; alt: string }[];
  published_at: string;
};
// The owner's own view of what is live for a project.
export type LiveShowcase = { project_id: string; slug: string; published_at: string };

// What the public page and the preview both render.
export type ShowcaseContent = {
  title: string;
  category: string;
  summary: string;
  technologies: string[];
  sections: { key: string; label: string; body: string }[];
  links: ShowcaseLink[];
  images: { src: string; alt: string }[];
};

const sectionLabel = (key: string) => SECTIONS.find((s) => s.key === key)?.label ?? key;

// Non-empty known sections in display order: the same rule publish_showcase applies.
export function draftSections(sections: Partial<Record<string, string>>) {
  return SECTIONS.map(({ key, label }) => ({ key, label, body: (sections[key] ?? "").trim() })).filter((s) => s.body);
}

export function draftContent(draft: DraftEdit, imageSrc: (fileId: string) => string): ShowcaseContent {
  return {
    title: draft.title.trim(),
    category: draft.category.trim(),
    summary: draft.summary.trim(),
    technologies: draft.technologies,
    sections: draftSections(draft.sections),
    links: draft.links,
    images: draft.images.map((img) => ({ src: imageSrc(img.file_id), alt: img.alt.trim() })),
  };
}

export function publishedContent(row: PublishedShowcase, supabaseUrl: string): ShowcaseContent {
  return {
    title: row.title,
    category: row.category,
    summary: row.summary,
    technologies: row.technologies ?? [],
    sections: (row.sections ?? []).map((s) => ({ key: s.key, label: sectionLabel(s.key), body: s.body })),
    links: row.links ?? [],
    images: (row.images ?? []).map((img) => ({ src: publicImageUrl(supabaseUrl, img.path), alt: img.alt })),
  };
}

export function publicImageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/showcase/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function slugify(input: string): string {
  return input.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIMITS.slug).replace(/-+$/, "");
}

export function slugProblem(slug: string): string | null {
  if (!slug) return "Choose a web address.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers and single hyphens, like line-rover.";
  if (slug.length < 3 || slug.length > LIMITS.slug) return `The address must be 3 to ${LIMITS.slug} characters.`;
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return "That address belongs to one of the existing case studies.";
  return null;
}

export function linkProblem(link: ShowcaseLink): string | null {
  if (!link.label.trim() || link.label.trim().length > LIMITS.linkLabel) return `Each link needs a label of up to ${LIMITS.linkLabel} characters.`;
  if (!/^https:\/\/\S+$/.test(link.href) || link.href.length > 2000) return "Links must start with https://.";
  try { new URL(link.href); } catch { return "One of the links isn't a valid address."; }
  return null;
}

export function parseTechnologies(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, LIMITS.technology);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out.slice(0, LIMITS.technologies);
}

// Cleans an edit for saving. A draft may be incomplete; only format and size are checked here.
export function cleanDraft(edit: DraftEdit): { ok: true; value: DraftEdit } | { ok: false; message: string } {
  const slug = edit.slug.trim();
  if (slug) { const problem = slugProblem(slug); if (problem) return { ok: false, message: problem }; }
  if (edit.title.length > LIMITS.title) return { ok: false, message: `The title can be up to ${LIMITS.title} characters.` };
  if (edit.category.length > LIMITS.category) return { ok: false, message: `The category can be up to ${LIMITS.category} characters.` };
  if (edit.summary.length > LIMITS.summary) return { ok: false, message: `The summary can be up to ${LIMITS.summary} characters.` };
  const sections: Partial<Record<SectionKey, string>> = {};
  for (const { key } of SECTIONS) {
    const body = edit.sections[key] ?? "";
    if (body.length > LIMITS.section) return { ok: false, message: `Each section can be up to ${LIMITS.section} characters.` };
    if (body.trim()) sections[key] = body;
  }
  const links = edit.links.map((l) => ({ label: l.label.trim(), href: l.href.trim() })).filter((l) => l.label || l.href);
  if (links.length > LIMITS.links) return { ok: false, message: `Up to ${LIMITS.links} links.` };
  for (const link of links) { const problem = linkProblem(link); if (problem) return { ok: false, message: problem }; }
  if (edit.images.length > LIMITS.images) return { ok: false, message: `Up to ${LIMITS.images} images.` };
  if (new Set(edit.images.map((i) => i.file_id)).size !== edit.images.length) return { ok: false, message: "An image is listed twice." };
  if (edit.images.some((i) => i.alt.length > LIMITS.alt)) return { ok: false, message: `Image descriptions can be up to ${LIMITS.alt} characters.` };
  return {
    ok: true,
    value: {
      slug, title: edit.title, category: edit.category, summary: edit.summary,
      technologies: edit.technologies.slice(0, LIMITS.technologies), sections, links,
      images: edit.images.map((i) => ({ file_id: i.file_id, alt: i.alt })),
    },
  };
}

type FileLike = { id: string; mime_type: string | null; size: number | null; state: string };

// Whether a project file can be copied to the public site.
export function publicImageProblem(file: FileLike | undefined): string | null {
  if (!file) return "This file is no longer on the project.";
  if (file.state !== "ok") return "This file is unavailable in Drive. Run Check files on the Files tab.";
  if (!file.mime_type || !PUBLIC_IMAGE_TYPES[file.mime_type.toLowerCase()]) return "Only JPEG, PNG or WebP images can be published.";
  if (file.size === null || file.size > PUBLIC_IMAGE_MAX) return "Images must be 5 MB or smaller to publish.";
  return null;
}

// Everything that stops a saved draft from being published, in plain words. Empty means ready.
export function publishProblems(
  draft: DraftEdit | null,
  project: { stage: string; archived_at: string | null },
  files: FileLike[],
): string[] {
  const problems: string[] = [];
  if (project.stage !== "completed") problems.push("Set the project's stage to Completed first.");
  if (project.archived_at !== null) problems.push("Restore the project from the archive first.");
  if (!draft) return [...problems, "Save a showcase draft first."];
  const slug = slugProblem(draft.slug);
  if (slug) problems.push(slug);
  if (!draft.title.trim()) problems.push("Add a public title.");
  if (!draft.summary.trim()) problems.push("Add a public summary.");
  for (const link of draft.links) { const p = linkProblem(link); if (p) { problems.push(p); break; } }
  draft.images.forEach((img, i) => {
    if (!img.alt.trim()) problems.push(`Describe image ${i + 1} for people who can't see it.`);
    const p = publicImageProblem(files.find((f) => f.id === img.file_id));
    if (p) problems.push(`Image ${i + 1}: ${p}`);
  });
  return problems;
}

// Identifies the real type of image bytes, so a mislabelled file is never published as an image.
export function sniffImage(bytes: Uint8Array): keyof typeof PUBLIC_IMAGE_TYPES | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

const FAILED = { ok: false, reason: "failed", message: "Couldn't save the showcase. Check your connection and try again. Your changes are still here." } as const;
const CONFLICT = { ok: false, reason: "conflict", message: "The showcase changed in another tab or device. Nothing was overwritten. Reload to see the saved version." } as const;

// Saves the private draft. A new draft is inserted; an existing one only updates if nobody else
// saved it since (version check), like every other Vault record.
export async function saveDraft(
  client: SupabaseClient,
  ownerId: string,
  projectId: string,
  base: ShowcaseDraft | null,
  edit: DraftEdit,
): Promise<Outcome<ShowcaseDraft>> {
  const cleaned = cleanDraft(edit);
  if (!cleaned.ok) return { ok: false, reason: "invalid", message: cleaned.message };
  try {
    const result = base
      ? await client.from("project_showcases").update(cleaned.value).eq("id", base.id).eq("user_id", ownerId)
          .eq("version", base.version).select(DRAFT_COLUMNS)
      : await client.from("project_showcases").insert({ id: crypto.randomUUID(), user_id: ownerId, project_id: projectId, ...cleaned.value })
          .select(DRAFT_COLUMNS);
    if (result.error) {
      if (result.error.code === "23505" && /slug/.test(result.error.message)) {
        return { ok: false, reason: "invalid", message: "Another project's showcase already uses that address." };
      }
      if (result.error.code === "23505") return CONFLICT;
      if (result.error.code === "23514") return { ok: false, reason: "invalid", message: "Something in the showcase isn't allowed. Check the address and lengths." };
      return FAILED;
    }
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) return CONFLICT;
    return { ok: true, value: row as unknown as ShowcaseDraft };
  } catch {
    return FAILED;
  }
}

// A starting point taken from the project's own title and summary; nothing is saved until the
// owner presses Save, and private notes are never copied in.
export function suggestedDraft(project: { title: string; summary: string }): DraftEdit {
  return {
    slug: slugify(project.title).length >= 3 && !slugProblem(slugify(project.title)) ? slugify(project.title) : "",
    title: project.title.slice(0, LIMITS.title),
    category: "",
    summary: "",
    technologies: [],
    sections: {},
    links: [],
    images: [],
  };
}
