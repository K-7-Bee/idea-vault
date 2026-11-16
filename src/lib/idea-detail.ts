import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUSES, type FileItem } from "./ideas";
import { tagsFilter } from "./recovery-operations";
import { extractTags } from "./tags";

export const TITLE_MAX = 200;

export type IdeaRecord = {
  id: string;
  title: string | null;
  content: string;
  original_content: string | null;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string | null;
  archived_at: string | null;
};
export type IdeaDetail = IdeaRecord & { files: FileItem[] };

// What the page last saw. A write only applies if the saved row still matches all of it.
export type IdeaBase = Pick<IdeaRecord, "id" | "title" | "content" | "status" | "tags" | "archived_at">;

export type Outcome =
  | { ok: true; idea: IdeaRecord }
  | { ok: false; reason: "conflict" | "failed" | "invalid"; message: string };

const RETURNING = "id, title, content, original_content, status, tags, created_at, updated_at, archived_at";

const CONFLICT: Outcome = {
  ok: false,
  reason: "conflict",
  message: "This idea changed in another tab or device, or was deleted. Nothing was overwritten. Reload to see the saved version.",
};
const FAILED: Outcome = {
  ok: false,
  reason: "failed",
  message: "Couldn't save. Check your connection and try again. Your changes are still here.",
};

// Collapses whitespace; an empty title is stored as "no title", never as "".
export function normalizeTitle(input: string): string | null {
  const title = input.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, TITLE_MAX) : null;
}

type Filterable = {
  eq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
  not(column: string, operator: string, value: null): Filterable;
  filter(column: string, operator: string, value: string): Filterable;
  select(columns: string): PromiseLike<{ data: IdeaRecord[] | null; error: unknown }>;
};

function unchangedSince(query: Filterable, ownerId: string, base: IdeaBase) {
  let q = query
    .eq("id", base.id)
    .eq("user_id", ownerId)
    .eq("content", base.content)
    .eq("status", base.status)
    .filter("tags", "eq", tagsFilter(base.tags));
  q = base.title === null ? q.is("title", null) : q.eq("title", base.title);
  q = base.archived_at === null ? q.is("archived_at", null) : q.not("archived_at", "is", null);
  return q;
}

async function conditionalUpdate(
  client: SupabaseClient,
  ownerId: string,
  base: IdeaBase,
  changes: Record<string, unknown>,
): Promise<Outcome> {
  try {
    const query = client.from("ideas").update(changes) as unknown as Filterable;
    const { data, error } = await unchangedSince(query, ownerId, base).select(RETURNING);
    if (error) return FAILED;
    if (!data || data.length !== 1) return CONFLICT;
    return { ok: true, idea: data[0] };
  } catch {
    return FAILED;
  }
}

export function saveIdea(
  client: SupabaseClient,
  ownerId: string,
  base: IdeaBase,
  edit: { title: string; content: string; status: string },
): Promise<Outcome> {
  if (!(STATUSES as readonly string[]).includes(edit.status)) {
    return Promise.resolve({ ok: false, reason: "invalid", message: "Choose one of the existing stages." });
  }
  return conditionalUpdate(client, ownerId, base, {
    title: normalizeTitle(edit.title),
    content: edit.content,
    tags: extractTags(edit.content),
    status: edit.status,
  });
}

// The database replaces this timestamp with its own clock (migration 004).
export function archiveIdea(client: SupabaseClient, ownerId: string, base: IdeaBase) {
  if (base.archived_at !== null) return Promise.resolve(CONFLICT);
  return conditionalUpdate(client, ownerId, base, { archived_at: new Date().toISOString() });
}

export function restoreIdea(client: SupabaseClient, ownerId: string, base: IdeaBase) {
  if (base.archived_at === null) return Promise.resolve(CONFLICT);
  return conditionalUpdate(client, ownerId, base, { archived_at: null });
}
