import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { checkUploaded, isUuid } from "@/lib/drive/files";
import { validDriveId } from "@/lib/drive/flow";
import { GoogleError, findByVaultFileId, getFileMeta } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";

const FILE_COLUMNS = "id, path, name, mime_type, size, provider, drive_file_id";

// Records a finished Drive upload as an attachment, after checking what Drive actually holds:
// the Vault's private tags, the chosen folder, the size and that it isn't trashed. Safe to repeat:
// the record uses the browser's fixed file ID, so a retry returns the existing record.
// Not gated by the upload switch, so an upload already in flight can always be finished.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { ideaId?: unknown; fileId?: unknown; size?: unknown; driveFileId?: unknown } | null;
  const size = body?.size;
  if (!body || !isUuid(body.ideaId) || !isUuid(body.fileId) || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    return json({ error: "invalid" }, 400);
  }
  const ideaId = body.ideaId, fileId = body.fileId;
  const { supabase, owner } = session;

  const existing = await supabase.from("idea_files").select(FILE_COLUMNS).eq("id", fileId).eq("user_id", owner.id)
    .limit(1).then((r) => r, () => null);
  if (!existing || existing.error || !Array.isArray(existing.data)) return json({ error: "unavailable" }, 503);
  if (existing.data.length === 1) return json({ file: existing.data[0] });

  const idea = await supabase.from("ideas").select("id").eq("id", ideaId).eq("user_id", owner.id).limit(1).then((r) => r, () => null);
  if (!idea || idea.error || !Array.isArray(idea.data)) return json({ error: "unavailable" }, 503);
  if (idea.data.length !== 1) return json({ error: "no_idea" }, 404);

  const access = await accessToken(supabase, owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);
  const folderId = access.row.folder_id;
  if (!folderId) return json({ error: "no_folder" }, 409);

  let meta;
  try {
    let driveFileId = validDriveId(body.driveFileId) ? body.driveFileId : null;
    if (!driveFileId) {
      // The upload's final response was lost: find the file by its private Vault tag.
      const found = await findByVaultFileId(access.token, fileId);
      if (found.length !== 1) return json({ error: found.length ? "ambiguous" : "not_found" }, 409);
      driveFileId = found[0];
    }
    meta = await getFileMeta(access.token, driveFileId);
  } catch (error) {
    return json({ error: error instanceof GoogleError && error.status === 404 ? "not_found" : "google" }, error instanceof GoogleError && error.status === 404 ? 409 : 502);
  }
  const check = checkUploaded(meta, { fileId, ideaId, folderId, size });
  if (!check.ok) return json({ error: check.reason }, 409);

  const inserted = await supabase.from("idea_files").insert({
    id: fileId,
    idea_id: ideaId,
    user_id: owner.id,
    path: `drive/${meta.id}`,
    name: meta.name.slice(0, 255),
    mime_type: meta.mimeType || null,
    size: check.size,
    provider: "drive",
    drive_file_id: meta.id,
    md5: check.md5,
  }).select(FILE_COLUMNS).single().then((r) => r, () => null);
  if (inserted && !inserted.error && inserted.data) return json({ file: inserted.data });

  // A concurrent retry may have written the same record first.
  const again = await supabase.from("idea_files").select(FILE_COLUMNS).eq("id", fileId).eq("user_id", owner.id)
    .limit(1).then((r) => r, () => null);
  const row = again && !again.error && Array.isArray(again.data) ? again.data[0] as { drive_file_id?: string } | undefined : undefined;
  if (row && row.drive_file_id === meta.id) return json({ file: row });
  return json({ error: "storage" }, 503);
}
