import type { SupabaseClient } from "@supabase/supabase-js";
import { folderName, linkColumns, type UploadTarget } from "./files";
import { GoogleError, createFolder, getFileMeta, type DriveFileMeta } from "./google";

// Server only. Where an upload's record lives and which Drive folder it goes into:
// idea attachments → idea_files, in the owner's chosen folder (3B);
// project files → project_files, in Projects/<project title> inside that folder (3C).

export const IDEA_FILE_COLUMNS = "id, path, name, mime_type, size, provider, drive_file_id";
export const PROJECT_FILE_COLUMNS = "id, project_id, entry_id, component_id, character_id, unit_id, is_main, source, drive_file_id, name, mime_type, size, md5, state, state_reason, checked_at, created_at";

type Rows = { data: unknown[] | null; error: unknown } | null;
const settle = <T,>(p: PromiseLike<T>) => Promise.resolve(p).then((r) => r, () => null);
const rows = (r: Rows) => (r && !r.error && Array.isArray(r.data) ? r.data : undefined);

// "ok", "missing" (not the owner's, or the record was deleted) or "unavailable" (read failed).
export async function verifyTarget(supabase: SupabaseClient, ownerId: string, target: UploadTarget): Promise<"ok" | "missing" | "unavailable"> {
  const one = async (table: string, filters: [string, string][]) => {
    let q = supabase.from(table).select("id").eq("user_id", ownerId);
    for (const [column, value] of filters) q = q.eq(column, value);
    const found = rows(await settle(q.limit(1)) as Rows);
    return found === undefined ? "unavailable" : found.length === 1 ? "ok" : "missing";
  };
  if (target.kind === "idea") return one("ideas", [["id", target.ideaId]]);
  const project = await one("projects", [["id", target.projectId]]);
  if (project !== "ok") return project;
  if (target.entryId) return one("project_entries", [["id", target.entryId], ["project_id", target.projectId]]);
  if (target.componentId) return one("project_components", [["id", target.componentId], ["project_id", target.projectId]]);
  if (target.characterId) return one("story_characters", [["id", target.characterId], ["project_id", target.projectId]]);
  if (target.unitId) return one("story_units", [["id", target.unitId], ["project_id", target.projectId]]);
  return "ok";
}

// The record already written for this browser file ID, if any (so a retry never uploads twice).
export async function recordedFile(supabase: SupabaseClient, ownerId: string, target: UploadTarget, fileId: string): Promise<Record<string, unknown> | null | undefined> {
  const table = target.kind === "idea" ? "idea_files" : "project_files";
  const columns = target.kind === "idea" ? IDEA_FILE_COLUMNS : PROJECT_FILE_COLUMNS;
  const found = rows(await settle(supabase.from(table).select(columns).eq("id", fileId).eq("user_id", ownerId).limit(1)) as Rows);
  return found === undefined ? undefined : (found[0] as Record<string, unknown> | undefined) ?? null;
}

async function storedFolder(supabase: SupabaseClient, ownerId: string, purpose: "projects_root" | "project", parent: string, projectId?: string) {
  let q = supabase.from("drive_folders").select("folder_id").eq("user_id", ownerId).eq("purpose", purpose).eq("parent_folder_id", parent);
  if (projectId) q = q.eq("project_id", projectId);
  const found = rows(await settle(q.limit(1)) as Rows);
  if (found === undefined) throw new Error("folders_unavailable");
  return (found[0] as { folder_id: string } | undefined)?.folder_id ?? null;
}

// Finds or creates one Vault folder. Two requests racing both create a folder; the unique row
// decides which one is used and the extra empty folder is left in Drive (never deleted).
async function ensureFolder(supabase: SupabaseClient, ownerId: string, token: string, spec: {
  purpose: "projects_root" | "project"; parent: string; projectId?: string; name: string; create: boolean;
}): Promise<string | null> {
  const existing = await storedFolder(supabase, ownerId, spec.purpose, spec.parent, spec.projectId);
  if (existing || !spec.create) return existing;
  const made = await createFolder(token, spec.name, spec.parent);
  await settle(supabase.from("drive_folders").insert({
    user_id: ownerId, purpose: spec.purpose, parent_folder_id: spec.parent, project_id: spec.projectId ?? null, folder_id: made.id,
  }));
  return await storedFolder(supabase, ownerId, spec.purpose, spec.parent, spec.projectId);
}

// The Drive folder an upload goes into. With create=false (completion) it only looks folders up.
export async function targetFolder(supabase: SupabaseClient, ownerId: string, token: string, rootFolderId: string,
  target: UploadTarget, create: boolean): Promise<string | null> {
  if (target.kind === "idea") return rootFolderId;
  const projects = await ensureFolder(supabase, ownerId, token, { purpose: "projects_root", parent: rootFolderId, name: "Projects", create });
  if (!projects) return null;
  let title = "Project";
  if (create) {
    const found = rows(await settle(supabase.from("projects").select("title").eq("id", target.projectId).eq("user_id", ownerId).limit(1)) as Rows);
    title = String((found?.[0] as { title?: string } | undefined)?.title ?? "Project");
  }
  return ensureFolder(supabase, ownerId, token, { purpose: "project", parent: projects, projectId: target.projectId, name: folderName(title), create });
}

// After Drive reports a missing parent: forget Vault folders that are gone or trashed, so the
// next attempt creates them again. Folders that still exist are kept.
export async function forgetMissingFolders(supabase: SupabaseClient, ownerId: string, token: string, rootFolderId: string, target: UploadTarget) {
  if (target.kind !== "project") return;
  const gone = async (folderId: string | null) => {
    if (!folderId) return false;
    try { return !!(await getFileMeta(token, folderId)).trashed; }
    catch (error) { return error instanceof GoogleError && error.status === 404; }
  };
  const projects = await storedFolder(supabase, ownerId, "projects_root", rootFolderId).catch(() => null);
  if (projects) {
    const own = await storedFolder(supabase, ownerId, "project", projects, target.projectId).catch(() => null);
    if (await gone(own)) await settle(supabase.from("drive_folders").delete().eq("user_id", ownerId).eq("purpose", "project").eq("folder_id", own!));
  }
  if (await gone(projects)) await settle(supabase.from("drive_folders").delete().eq("user_id", ownerId).eq("purpose", "projects_root").eq("folder_id", projects!));
}

// Writes the record for a verified Drive file. Returns the row, or null if storage failed.
export async function recordUpload(supabase: SupabaseClient, ownerId: string, target: UploadTarget, fileId: string,
  meta: DriveFileMeta, check: { size: number; md5: string | null }): Promise<Record<string, unknown> | null> {
  const name = meta.name.slice(0, target.kind === "idea" ? 255 : 500);
  const insert: PromiseLike<unknown> = target.kind === "idea"
    ? supabase.from("idea_files").insert({ id: fileId, idea_id: target.ideaId, user_id: ownerId, path: `drive/${meta.id}`, name,
        mime_type: meta.mimeType || null, size: check.size, provider: "drive", drive_file_id: meta.id, md5: check.md5 }).select(IDEA_FILE_COLUMNS).single()
    : supabase.from("project_files").insert({ id: fileId, project_id: target.projectId, user_id: ownerId, ...linkColumns(target),
        source: "upload", drive_file_id: meta.id, name, mime_type: meta.mimeType || null,
        size: check.size, md5: check.md5 }).select(PROJECT_FILE_COLUMNS).single();
  const inserted = await settle(insert) as { data: unknown; error: unknown } | null;
  if (inserted && !inserted.error && inserted.data) return inserted.data as Record<string, unknown>;
  // A concurrent retry may have written the same record first.
  const again = await recordedFile(supabase, ownerId, target, fileId);
  return again && again.drive_file_id === meta.id ? again : null;
}
