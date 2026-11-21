import type { SupabaseClient } from "@supabase/supabase-js";
import type { Outcome } from "./workspace";

// Phase 4B: the public profile (homepage text). The owner edits a private draft (profile_drafts);
// publishing copies it into the single public row (profile_published, migration 014) and keeps a
// copy in history (profile_versions). Shared by the Vault editor, the preview, the publish route
// and the public homepage. Everything is plain text: the homepage renders it as text, never HTML.

export const ICONS = { cap: "Graduation cap", case: "Briefcase", award: "Award", chip: "Chip", bolt: "Lightning", web: "Globe", check: "Check mark" } as const;
export type IconName = keyof typeof ICONS;
export const KINDS = { edu: "Education", work: "Experience", award: "Award" } as const;
export type EntryKind = keyof typeof KINDS;

export const LIMITS = {
  name: 80, short: 120, text: 600, paragraph: 1200,
  highlights: 4, paragraphs: 4, timeline: 20, certificates: 12, focus: 6, links: 8, listItems: 8, listItem: 200, tools: 12, tool: 40,
  linkLabel: 40, href: 2000,
};

export type Highlight = { icon: IconName; title: string; detail: string };
export type TimelineEntry = {
  kind: EntryKind;
  when: string;
  title: string;
  detail: string; // organization or school
  where: string;
  tools: string[];
  responsibilities: string[];
  outcomes: string[];
};
export type Certificate = { name: string; issuer: string; when: string; href: string };
export type ProfileLink = { label: string; href: string };
// Phase 4C. In the draft and in history, file is a library file id (library_files, migration 015);
// in the published row it is the name of the public copy in the "profile-files" bucket. Empty: none.
export type ProfileResume = { file: string; name: string };
export type ProfilePhoto = { file: string; alt: string };
export type ProfileContent = {
  name: string;
  hero: { eyebrow: string; accent: string; headline: string; intro: string };
  highlights: Highlight[];
  about: { heading: string; paragraphs: string[] };
  timeline: TimelineEntry[];
  certificates: Certificate[];
  focus: string[];
  links: ProfileLink[];
  // Stored in two halves so the whole address never appears in page source (see EmailLink).
  contact: { heading: string; text: string; email: { user: string; domain: string } };
  resume: ProfileResume;
  photo: ProfilePhoto;
};

const entry = (kind: EntryKind, when: string, title: string, detail: string, where: string): TimelineEntry =>
  ({ kind, when, title, detail, where, tools: [], responsibilities: [], outcomes: [] });

// Today's published homepage text, moved here unchanged from src/app/page.tsx. The homepage shows
// this until the first profile is published, so day one looks exactly as before. Only details
// already verified on the published portfolio; nothing is guessed.
export const SEED: ProfileContent = {
  name: "MD Kaushik Kamal",
  hero: {
    eyebrow: "Engineering science · Electrical technology · Web",
    accent: "Curiosity meets",
    headline: "engineering.",
    intro: "I'm MD Kaushik Kamal, an engineering science student at Jeonbuk National University exploring circuits, electrical systems and practical software through real projects.",
  },
  highlights: [
    { icon: "cap", title: "Bachelor (in progress)", detail: "Jeonbuk National University" },
    { icon: "case", title: "2 internships", detail: "Real-world experience" },
    { icon: "award", title: "First prize", detail: "Innovation fair" },
    { icon: "chip", title: "Electrical technology", detail: "Diploma, completed 2023" },
  ],
  about: {
    heading: "I build what I'm learning.",
    paragraphs: [
      "I'm an engineering science student at Jeonbuk National University in South Korea, with a diploma in electrical technology from CCN Polytechnic Institute in Bangladesh.",
      "I explore what I'm learning through circuits, practical web tools and documented projects, from a prize-winning waste-to-energy lighting system to software I use every day.",
    ],
  },
  timeline: [
    entry("edu", "Expected 2028", "Bachelor · Engineering Science", "Jeonbuk National University", "South Korea"),
    entry("edu", "2023", "Diploma · Electrical Technology", "CCN Polytechnic Institute", "Bangladesh"),
    entry("work", "2022", "Internship", "Altech Aluminum", "Bangladesh"),
    entry("work", "2020", "Internship", "Transformer factory", "Bangladesh"),
    entry("award", "Innovation fair", "First prize", "Renewable energy from waste, with an automatic lighting system", "CCN Polytechnic Institute"),
  ],
  certificates: [],
  focus: [
    "Engineering science coursework",
    "Circuits and electrical systems",
    "Practical web tools",
    "Documenting projects as I build them",
  ],
  links: [
    { label: "GitHub", href: "https://github.com/K-7-Bee" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/md-kaushik-kamal-aa324a263" },
    { label: "Instagram", href: "https://www.instagram.com/kau_sh_ik_46" },
    { label: "Facebook", href: "https://www.facebook.com/share/19fzqecV1B/" },
  ],
  contact: {
    heading: "Let's build something.",
    text: "Open to engineering internship conversations and project collaboration.",
    email: { user: "koushikkamal6", domain: "gmail.com" },
  },
  resume: { file: "", name: "" },
  photo: { file: "", alt: "" },
};

// The editor's sections, in page order. Used for the "what changed" list before publishing.
export const SECTIONS = [
  { key: "hero", label: "Introduction" },
  { key: "highlights", label: "Highlights" },
  { key: "about", label: "About" },
  { key: "timeline", label: "Experience and education" },
  { key: "certificates", label: "Certificates" },
  { key: "focus", label: "Current focus" },
  { key: "contact", label: "Contact and links" },
  { key: "files", label: "Résumé and photo" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const sectionParts = (c: ProfileContent): Record<SectionKey, unknown> => ({
  hero: [c.name, c.hero], highlights: c.highlights, about: c.about, timeline: c.timeline,
  certificates: c.certificates, focus: c.focus, contact: [c.contact, c.links], files: [c.resume, c.photo],
});

// Labels of the sections that differ between two versions.
export function changedSections(next: ProfileContent, current: ProfileContent | null): string[] {
  if (!current) return SECTIONS.map((s) => s.label);
  const a = sectionParts(next), b = sectionParts(current);
  return SECTIONS.filter((s) => JSON.stringify(a[s.key]) !== JSON.stringify(b[s.key])).map((s) => s.label);
}

// ---------- Validation ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const line = (v: unknown, max: number) => text(v, max).replace(/\s+/g, " ");
const unique = (items: string[]) => items.filter((x, i) => items.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
const list = (v: unknown, max: number, itemMax: number) =>
  (Array.isArray(v) ? v : []).map((x) => line(x, itemMax)).filter(Boolean).slice(0, max);

// A library file id (draft) or a public copy's name (published), as checked by 015.
export const LIBRARY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PUBLIC_NAME = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;
// The file name visitors' browsers save the résumé under.
export const RESUME_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,95}\.pdf$/;
export const PHOTO_ALT_MAX = 200;
const fileRef = (v: unknown) => { const s = typeof v === "string" ? v.trim() : ""; return LIBRARY_ID.test(s) || PUBLIC_NAME.test(s) ? s : ""; };

export const EMAIL_USER = /^[A-Za-z0-9._%+-]{1,64}$/;
export const EMAIL_DOMAIN = /^(?=.{3,190}$)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// Whether an address can be published: https only, no spaces, quotes or angle brackets (as in 014).
export function hrefOk(href: string): boolean {
  if (!/^https:\/\/[^\s<>"]+$/.test(href) || href.length > LIMITS.href) return false;
  try { new URL(href); return true; } catch { return false; }
}

export function linkProblem(link: ProfileLink): string | null {
  if (!link.label || link.label.length > LIMITS.linkLabel) return `Each link needs a label of up to ${LIMITS.linkLabel} characters.`;
  if (!hrefOk(link.href)) return `"${link.label}" must be a full address starting with https://.`;
  return null;
}

// Reads stored or edited content into the exact shape, trimming, dropping empty items and capping
// sizes. Unknown fields are dropped. Never throws.
export function normalize(input: unknown): ProfileContent {
  const c = isObject(input) ? input : {};
  const hero = isObject(c.hero) ? c.hero : {};
  const about = isObject(c.about) ? c.about : {};
  const contact = isObject(c.contact) ? c.contact : {};
  const email = isObject(contact.email) ? contact.email : {};
  const resume = isObject(c.resume) ? c.resume : {};
  const photo = isObject(c.photo) ? c.photo : {};
  const arr = (v: unknown) => (Array.isArray(v) ? v : []).filter(isObject);
  return {
    name: line(c.name, LIMITS.name),
    hero: {
      eyebrow: line(hero.eyebrow, LIMITS.short),
      accent: line(hero.accent, LIMITS.short),
      headline: line(hero.headline, LIMITS.short),
      intro: text(hero.intro, LIMITS.text),
    },
    highlights: arr(c.highlights).map((h) => ({
      icon: (typeof h.icon === "string" && h.icon in ICONS ? h.icon : "check") as IconName,
      title: line(h.title, LIMITS.short), detail: line(h.detail, LIMITS.short),
    })).filter((h) => h.title).slice(0, LIMITS.highlights),
    about: {
      heading: line(about.heading, LIMITS.short),
      paragraphs: (Array.isArray(about.paragraphs) ? about.paragraphs : []).map((p) => text(p, LIMITS.paragraph)).filter(Boolean).slice(0, LIMITS.paragraphs),
    },
    timeline: arr(c.timeline).map((e) => ({
      kind: (typeof e.kind === "string" && e.kind in KINDS ? e.kind : "work") as EntryKind,
      when: line(e.when, LIMITS.short), title: line(e.title, LIMITS.short), detail: line(e.detail, LIMITS.short), where: line(e.where, LIMITS.short),
      tools: unique(list(e.tools, LIMITS.tools * 2, LIMITS.tool)).slice(0, LIMITS.tools),
      responsibilities: list(e.responsibilities, LIMITS.listItems, LIMITS.listItem),
      outcomes: list(e.outcomes, LIMITS.listItems, LIMITS.listItem),
    })).filter((e) => e.title).slice(0, LIMITS.timeline),
    certificates: arr(c.certificates).map((x) => ({
      name: line(x.name, LIMITS.short), issuer: line(x.issuer, LIMITS.short), when: line(x.when, LIMITS.short), href: line(x.href, LIMITS.href),
    })).filter((x) => x.name).slice(0, LIMITS.certificates),
    focus: list(c.focus, LIMITS.focus, LIMITS.short),
    links: arr(c.links).map((l) => ({ label: line(l.label, LIMITS.linkLabel), href: line(l.href, LIMITS.href) }))
      .filter((l) => l.label || l.href).slice(0, LIMITS.links),
    contact: {
      heading: line(contact.heading, LIMITS.short),
      text: text(contact.text, LIMITS.text),
      email: { user: line(email.user, 64), domain: line(email.domain, 190).toLowerCase() },
    },
    resume: { file: fileRef(resume.file), name: line(resume.name, 100) },
    photo: { file: fileRef(photo.file), alt: line(photo.alt, PHOTO_ALT_MAX) },
  };
}

// The library files a draft uses, by role.
export function filesUsed(c: ProfileContent): { part: "resume" | "photo"; id: string }[] {
  return [
    ...(c.resume.file ? [{ part: "resume" as const, id: c.resume.file }] : []),
    ...(c.photo.file ? [{ part: "photo" as const, id: c.photo.file }] : []),
  ];
}

// Everything that stops content from being published, in plain words. Empty means ready.
export function publishProblems(c: ProfileContent): string[] {
  const problems: string[] = [];
  if (!c.name) problems.push("Add your name.");
  if (!c.hero.headline && !c.hero.accent) problems.push("Add a headline.");
  for (const l of c.links) { const p = linkProblem(l); if (p) problems.push(p); }
  for (const x of c.certificates) {
    if (x.href && !hrefOk(x.href)) problems.push(`The link for the certificate "${x.name}" must be a full address starting with https://.`);
  }
  const { user, domain } = c.contact.email;
  if ((user || domain) && !(EMAIL_USER.test(user) && EMAIL_DOMAIN.test(domain))) problems.push("The contact email address isn't valid.");
  if (c.resume.file && !RESUME_NAME.test(c.resume.name)) problems.push("Give the résumé a download name ending in .pdf, using letters, numbers, spaces, dots, dashes or brackets.");
  if (c.photo.file && !c.photo.alt) problems.push("Describe the photo for people who can't see it.");
  if (strings(c).some((s) => HTML_LIKE.test(s))) problems.push("Remove the HTML tag from your text. Write plain text; the page adds its own formatting.");
  return problems;
}

// Text that looks like an HTML tag. The page renders text as text anyway; publish_profile refuses it too.
export const HTML_LIKE = /<[A-Za-z/!]/;
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : isObject(v) ? Object.values(v).flatMap(strings) : [];

export function splitEmail(address: string): { user: string; domain: string } {
  const value = address.trim();
  const at = value.lastIndexOf("@");
  return at < 0 ? { user: value, domain: "" } : { user: value.slice(0, at), domain: value.slice(at + 1).toLowerCase() };
}

// ---------- Draft storage (browser, owner session, row security) ----------

export type ProfileDraft = { id: string; content: ProfileContent; version: number; updated_at: string };
export type ProfileVersion = { version: number; content: ProfileContent; published_at: string };
export const DRAFT_COLUMNS = "id, content, version, updated_at";
// What visitors can read (column grant in 014; never the owner id).
export const PUBLIC_COLUMNS = "content, published_at";
export type PublishedProfile = { content: ProfileContent; published_at: string };

const FAILED = { ok: false, reason: "failed", message: "Couldn't save the profile. Check your connection and try again. Your changes are still here." } as const;
const CONFLICT = { ok: false, reason: "conflict", message: "The profile changed in another tab or device. Nothing was overwritten. Reload to see the saved version." } as const;

export function asDraft(row: { id: string; content: unknown; version: number; updated_at: string }): ProfileDraft {
  return { id: row.id, content: normalize(row.content), version: row.version, updated_at: row.updated_at };
}

// Saves the private draft. A new draft is inserted; an existing one only updates if nobody else
// saved it since (version check), like every other Vault record.
export async function saveDraft(client: SupabaseClient, ownerId: string, base: ProfileDraft | null, content: ProfileContent): Promise<Outcome<ProfileDraft>> {
  const value = normalize(content);
  try {
    const result = base
      ? await client.from("profile_drafts").update({ content: value }).eq("id", base.id).eq("user_id", ownerId).eq("version", base.version).select(DRAFT_COLUMNS)
      : await client.from("profile_drafts").insert({ id: crypto.randomUUID(), user_id: ownerId, content: value }).select(DRAFT_COLUMNS);
    if (result.error) {
      if (result.error.code === "23505") return CONFLICT;
      if (result.error.code === "23514") return { ok: false, reason: "invalid", message: "The profile is too large to save. Shorten some text." };
      return FAILED;
    }
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) return CONFLICT;
    return { ok: true, value: asDraft(row as { id: string; content: unknown; version: number; updated_at: string }) };
  } catch {
    return FAILED;
  }
}
