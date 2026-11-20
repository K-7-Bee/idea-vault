import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { checkUploaded, isUuid, parseTarget, targetTags } from "@/lib/drive/files";
import { validDriveId } from "@/lib/drive/flow";
import { GoogleError, findByVaultFileId, getFileMeta } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { recordUpload, recordedFile, targetFolder, verifyTarget } from "@/lib/drive/targets";

// Records a finished Drive upload, after checking what Drive actually holds: the Vault's private
// tags, the expected folder, the size and that it isn't trashed. Safe to repeat: the record uses the
// browser's fixed file ID, so a retry returns the existing record.
// Not gated by the upload switch, so an upload already in flight can always be finished.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { fileId?: unknown; size?: unknown; driveFileId?: unknown } | null;
  const target = parseTarget(body);
  const size = body?.size;
  if (!body || !target || !isUuid(body.fileId) || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    return json({ error: "invalid" }, 400);
  }
  const fileId = body.fileId;
  const { supabase, owner } = session;

  const existing = await recordedFile(supabase, owner.id, target, fileId);
  if (existing === undefined) return json({ error: "unavailable" }, 503);
  if (existing) return json({ file: existing });

  const verified = await verifyTarget(supabase, owner.id, target);
  if (verified === "unavailable") return json({ error: "unavailable" }, 503);
  if (verified === "missing") return json({ error: target.kind === "idea" ? "no_idea" : "no_project" }, 404);

  const access = await accessToken(supabase, owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);
  const root = access.row.folder_id;
  if (!root) return json({ error: "no_folder" }, 409);

  let meta, folderId;
  try {
    folderId = await targetFolder(supabase, owner.id, access.token, root, target, false);
    if (!folderId) return json({ error: "no_folder" }, 409);
    let driveFileId = validDriveId(body.driveFileId) ? body.driveFileId : null;
    if (!driveFileId) {
      // The upload's final response was lost: find the file by its private Vault tag.
      const found = await findByVaultFileId(access.token, fileId);
      if (found.length !== 1) return json({ error: found.length ? "ambiguous" : "not_found" }, 409);
      driveFileId = found[0];
    }
    meta = await getFileMeta(access.token, driveFileId);
  } catch (error) {
    if (error instanceof GoogleError) return json({ error: error.status === 404 ? "not_found" : "google" }, error.status === 404 ? 409 : 502);
    return json({ error: "unavailable" }, 503);
  }
  const check = checkUploaded(meta, { tags: targetTags(target, fileId), folderId, size });
  if (!check.ok) return json({ error: check.reason }, 409);

  const row = await recordUpload(supabase, owner.id, target, fileId, meta, check);
  return row ? json({ file: row }) : json({ error: "storage" }, 503);
}
