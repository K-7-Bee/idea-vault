import type { SupabaseClient } from "@supabase/supabase-js";

// Phase 6A: "Download my data". Everything the owner's account holds in the database, read through
// the owner's own session (row security applies), as one JSON file. File bytes are not included
// (names, sizes and paths are); Drive tokens are left out entirely. Nothing is changed.

type Source = { table: string; columns?: string; owned?: boolean; note?: string };
export const EXPORT_LIMIT = 10_000;

export const EXPORT_TABLES: Source[] = [
  { table: "ideas" }, { table: "idea_files" },
  { table: "projects" }, { table: "project_milestones" }, { table: "project_tasks" }, { table: "project_entries" },
  { table: "project_components" }, { table: "project_links" }, { table: "project_files" },
  { table: "story_bible_entries" }, { table: "story_characters" }, { table: "story_relationships" },
  { table: "story_units" }, { table: "story_timeline_events" }, { table: "story_continuity" },
  { table: "drawings", note: "Sketches and image annotations (vector data)." },
  { table: "project_showcases" },
  { table: "showcases", columns: "project_id, slug, title, category, summary, technologies, sections, links, images, published_at", owned: false, note: "Published project snapshots (public)." },
  { table: "profile_drafts" }, { table: "profile_versions" },
  { table: "profile_published", columns: "content, version, published_at", owned: false, note: "The published homepage profile (public)." },
  { table: "library_files" },
  { table: "journal_entries" },
  { table: "journal_published", columns: "entry_id, slug, images, draft_version, published_at, updated_at", owned: false, note: "Which journal entries are published; their text is in journal_entries." },
  { table: "drive_connections", columns: "google_email, scope, folder_id, folder_name, connected_at, updated_at", note: "Drive tokens are never exported." },
  { table: "drive_folders" },
  { table: "ai_conversations" }, { table: "ai_messages" }, { table: "ai_usage" },
  { table: "timevault_state", note: "Legacy storage from before the Vault rebuild." },
];

export type ExportFile = {
  format: "idea-vault-export-v1";
  exportedAt: string;
  account: { id: string; email: string | null };
  notes: string[];
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

// Reads every table; a table that can't be read is reported in notes, never silently missing.
export async function buildExport(supabase: SupabaseClient, owner: { id: string; email?: string | null }, now = new Date()): Promise<ExportFile> {
  const results = await Promise.all(EXPORT_TABLES.map(async (source) => {
    let query = supabase.from(source.table).select(source.columns ?? "*").limit(EXPORT_LIMIT);
    if (source.owned !== false) query = query.eq("user_id", owner.id);
    const result = await query.then((r) => r, () => null);
    return { source, rows: result && !result.error && Array.isArray(result.data) ? result.data as unknown[] : null };
  }));
  const file: ExportFile = {
    format: "idea-vault-export-v1",
    exportedAt: now.toISOString(),
    account: { id: owner.id, email: owner.email ?? null },
    notes: [
      "Everything your account holds in the Vault's database, read with your own permissions. File contents are not included: idea attachments, library files and public copies are listed by name, size and path. Files in Google Drive stay in Drive.",
      "To restore the Vault itself, use the encrypted backup and restore drill described in scripts/vault/README.md; this file is for reading and keeping.",
    ],
    counts: {},
    tables: {},
  };
  for (const { source, rows } of results) {
    if (rows === null) {
      file.notes.push(`${source.table}: couldn't be read for this export.`);
      continue;
    }
    file.tables[source.table] = rows;
    file.counts[source.table] = rows.length;
    if (rows.length >= EXPORT_LIMIT) file.notes.push(`${source.table}: only the first ${EXPORT_LIMIT} rows are included.`);
    if (source.note) file.notes.push(`${source.table}: ${source.note}`);
  }
  return file;
}
