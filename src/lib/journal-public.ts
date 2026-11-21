import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { caseStudyTitle, normalizeEdit, type PublishedEntry } from "./journal";

// Server only. Published journal entries as a visitor sees them, through journal_public()
// (migration 016) with the public key and no session.
//
// The pages (/journal, /journal/<slug>) read at request time and bypass every cache, so an
// unpublished entry, or a project that stopped being public, disappears on the very next request.
// The homepage only needs to know whether any entry is published (for its Journal link); that
// stays in the static shell and is refreshed by the publish and unpublish routes (JOURNAL_TAG),
// with the same failure behaviour as the profile: a failed read fails the build or keeps the last
// good page.
export const JOURNAL_TAG = "journal";

function anonymous(noStore: boolean) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(noStore ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } } : {}),
  });
}
const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

function clean(row: Record<string, unknown>): PublishedEntry {
  const edit = normalizeEdit(row);
  const projectSlug = typeof row.project_slug === "string" && row.project_slug ? row.project_slug : null;
  const projectTitle = typeof row.project_title === "string" && row.project_title ? row.project_title : projectSlug ? caseStudyTitle(projectSlug) : null;
  return {
    slug: edit.slug, title: edit.title, summary: edit.summary, body: edit.body, entry_date: edit.entry_date, images: edit.images,
    project_slug: projectSlug && projectTitle ? projectSlug : null, project_title: projectSlug && projectTitle ? projectTitle : null,
    published_at: String(row.published_at ?? ""), updated_at: String(row.updated_at ?? ""),
  };
}

// How many entries are published (0 hides the Journal link). Throws when it can't be read.
export async function getJournalCount(): Promise<number> {
  "use cache";
  cacheTag(JOURNAL_TAG);
  cacheLife("max");
  if (!configured()) return 0;
  const { data, error } = await anonymous(false).rpc("journal_public");
  if (error || !Array.isArray(data)) throw new Error(`The journal couldn't be read (${error?.code ?? "no data"}).`);
  return data.length;
}

// undefined = couldn't be read (the page says so).
export async function listEntries(): Promise<PublishedEntry[] | undefined> {
  await connection();
  if (!configured()) return [];
  try {
    const { data, error } = await anonymous(true).rpc("journal_public");
    if (error || !Array.isArray(data)) return undefined;
    return (data as Record<string, unknown>[]).map(clean);
  } catch {
    return undefined;
  }
}

// undefined = couldn't be read; null = not published.
export const getEntry = cache(async (slug: string): Promise<PublishedEntry | null | undefined> => {
  await connection();
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !configured()) return null;
  try {
    const { data, error } = await anonymous(true).rpc("journal_public", { p_slug: slug });
    if (error || !Array.isArray(data)) return undefined;
    const row = (data as Record<string, unknown>[])[0];
    return row ? clean(row) : null;
  } catch {
    return undefined;
  }
});
