import type { NextRequest } from "next/server";
import { accessToken, saveFolder } from "@/lib/drive/connection";
import { validDriveId } from "@/lib/drive/flow";
import { GoogleError, createEmptyFile, deleteFile, getFile } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";

const FOLDER = "application/vnd.google-apps.folder";
const PROBE_NAME = "Idea Vault write check (safe to delete)";

// Saves the folder the owner picked, after proving the app may write there: one empty file is
// created and deleted again. Nothing else in the folder is listed or read.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!validDriveId(body?.id)) return json({ error: "invalid_folder" }, 400);
  const folderId = body.id;

  const access = await accessToken(session.supabase, session.owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);

  let folder;
  try {
    folder = await getFile(access.token, folderId);
  } catch (error) {
    // 404 under drive.file: the folder was not granted through the picker, or no longer exists.
    return json({ error: error instanceof GoogleError && error.status === 404 ? "not_granted" : "google" }, 409);
  }
  if (folder.mimeType !== FOLDER) return json({ error: "not_a_folder" }, 409);
  if (folder.trashed) return json({ error: "trashed" }, 409);
  if (folder.capabilities?.canAddChildren === false) return json({ error: "read_only" }, 409);

  let probe;
  try {
    probe = await createEmptyFile(access.token, folder.id, PROBE_NAME);
  } catch {
    return json({ error: "cannot_write" }, 409);
  }
  const cleaned = await deleteFile(access.token, probe.id).then(() => true, () => false);

  const saved = await saveFolder(session.supabase, session.owner.id, { id: folder.id, name: folder.name });
  if (!saved) return json({ error: "storage", probeLeft: !cleaned }, 503);
  return json({ ok: true, folder: { id: folder.id, name: folder.name }, probeLeft: !cleaned });
}
