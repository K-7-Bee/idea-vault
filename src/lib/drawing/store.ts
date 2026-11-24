// Phase 7: reading and writing drawings through the signed-in Supabase client (row-level security
// limits every call to the owner's rows). Each save names the version it edited; a save against a
// newer version changes nothing and reports a conflict instead of overwriting.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Aspect, DrawingData, SketchAspect } from "./format";

export const DRAWING_COLUMNS = "id, project_id, unit_id, base_file_id, title, aspect, data, position, version, updated_at";

export type DrawingRow = {
  id: string; project_id: string; unit_id: string | null; base_file_id: string | null;
  title: string; aspect: Aspect; data: unknown; position: number; version: number; updated_at: string;
};

export type SaveResult =
  | { ok: true; row: DrawingRow }
  | { ok: false; reason: "conflict" | "invalid" | "failed" | "blocked"; message: string };

function failure(error: { code?: string } | null): SaveResult {
  if (error?.code === "23503") return { ok: false, reason: "blocked", message: "This is still linked to other items. Nothing was changed." };
  if (error?.code === "23514" || error?.code === "22P02" || error?.code === "23505") {
    return { ok: false, reason: "invalid", message: "That wasn't accepted (too large or not allowed here). Nothing was changed." };
  }
  return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Your drawing is kept on this device; try again." };
}

export async function createSketch(client: SupabaseClient, ownerId: string, projectId: string,
  input: { unitId: string; aspect: SketchAspect; title: string; position: number; data: DrawingData }): Promise<SaveResult> {
  try {
    const { data, error } = await client.from("drawings")
      .insert({ id: crypto.randomUUID(), user_id: ownerId, project_id: projectId, unit_id: input.unitId, aspect: input.aspect,
        title: input.title.slice(0, 200), position: input.position, data: input.data })
      .select(DRAWING_COLUMNS).single();
    return error ? failure(error) : { ok: true, row: data as DrawingRow };
  } catch {
    return failure(null);
  }
}

export async function createAnnotation(client: SupabaseClient, ownerId: string, projectId: string,
  input: { baseFileId: string; data: DrawingData }): Promise<SaveResult> {
  try {
    const { data, error } = await client.from("drawings")
      .insert({ id: crypto.randomUUID(), user_id: ownerId, project_id: projectId, base_file_id: input.baseFileId, aspect: "image", data: input.data })
      .select(DRAWING_COLUMNS).single();
    return error ? failure(error) : { ok: true, row: data as DrawingRow };
  } catch {
    return failure(null);
  }
}

export async function saveDrawing(client: SupabaseClient, ownerId: string, base: { id: string; version: number },
  changes: { data: DrawingData; title?: string; aspect?: SketchAspect }): Promise<SaveResult> {
  try {
    const { data, error } = await client.from("drawings").update(changes)
      .eq("id", base.id).eq("user_id", ownerId).eq("version", base.version).select(DRAWING_COLUMNS);
    if (error) return failure(error);
    if (!data || data.length !== 1) {
      return { ok: false, reason: "conflict", message: "This drawing was changed somewhere else (another tab or device) since you opened it." };
    }
    return { ok: true, row: data[0] as DrawingRow };
  } catch {
    return failure(null);
  }
}

export async function loadDrawing(client: SupabaseClient, ownerId: string, id: string): Promise<DrawingRow | null> {
  const { data, error } = await client.from("drawings").select(DRAWING_COLUMNS).eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (error) throw error;
  return data as DrawingRow | null;
}

export async function deleteDrawing(client: SupabaseClient, ownerId: string, base: { id: string; version: number }): Promise<SaveResult> {
  try {
    const { data, error } = await client.from("drawings").delete()
      .eq("id", base.id).eq("user_id", ownerId).eq("version", base.version).select(DRAWING_COLUMNS);
    if (error) return failure(error);
    if (!data || data.length !== 1) return { ok: false, reason: "conflict", message: "This drawing changed since the page loaded. Reload and try again." };
    return { ok: true, row: data[0] as DrawingRow };
  } catch {
    return failure(null);
  }
}
