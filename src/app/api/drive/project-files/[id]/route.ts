import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/drive/files";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { PROJECT_FILE_COLUMNS, verifyTarget } from "@/lib/drive/targets";

type Params = { params: Promise<{ id: string }> };

async function ownedFile(id: string) {
  const session = await routeOwner();
  if (!session) return { response: denied() };
  const found = await session.supabase.from("project_files").select("id, project_id").eq("id", id).eq("user_id", session.owner.id)
    .limit(1).then((r) => r, () => null);
  if (!found || found.error || !Array.isArray(found.data)) return { response: json({ error: "unavailable" }, 503) };
  if (found.data.length !== 1) return { response: json({ error: "not_found" }, 404) };
  return { session, file: found.data[0] as { id: string; project_id: string } };
}

// Attach a project file to one of the project's lab entries or components, or detach it.
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "invalid" }, 400);
  const body = await request.json().catch(() => null) as { entryId?: unknown; componentId?: unknown } | null;
  const entryId = body?.entryId ?? null, componentId = body?.componentId ?? null;
  if (!body || (entryId !== null && !isUuid(entryId)) || (componentId !== null && !isUuid(componentId)) || (entryId && componentId)) {
    return json({ error: "invalid" }, 400);
  }
  const owned = await ownedFile(id);
  if (!owned.session) return owned.response;
  const { supabase, owner } = owned.session;
  const target = { kind: "project" as const, projectId: owned.file.project_id, entryId: entryId as string | null, componentId: componentId as string | null };
  const verified = await verifyTarget(supabase, owner.id, target);
  if (verified !== "ok") return json({ error: verified === "missing" ? "no_record" : "unavailable" }, verified === "missing" ? 404 : 503);
  const updated = await supabase.from("project_files").update({ entry_id: target.entryId, component_id: target.componentId })
    .eq("id", id).eq("user_id", owner.id).select(PROJECT_FILE_COLUMNS).single().then((r) => r, () => null);
  if (!updated || updated.error || !updated.data) return json({ error: "storage" }, 503);
  return json({ file: updated.data });
}

// Unlink: removes the Vault's link only. The file stays in Drive and can be linked again.
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "invalid" }, 400);
  const owned = await ownedFile(id);
  if (!owned.session) return owned.response;
  const removed = await owned.session.supabase.from("project_files").delete().eq("id", id).eq("user_id", owned.session.owner.id)
    .select("id").then((r) => r, () => null);
  if (!removed || removed.error || removed.data?.length !== 1) return json({ error: "storage" }, 503);
  return json({ ok: true });
}
