import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { driveUploadsEnabled, linkColumns, parseTarget } from "@/lib/drive/files";
import { validDriveId } from "@/lib/drive/flow";
import { GoogleError, getFileMeta } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { PROJECT_FILE_COLUMNS, verifyTarget } from "@/lib/drive/targets";

const FOLDER = "application/vnd.google-apps.folder";
const MAX_PICK = 50;

// Links existing Drive files, chosen in Google Picker, to a project where they already are. Nothing
// is moved or copied. Picking granted the Vault drive.file access to exactly those files; anything
// Drive won't show the Vault is reported back and not linked.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  if (!driveUploadsEnabled()) return json({ error: "disabled" }, 409);
  const body = await request.json().catch(() => null) as (Record<string, unknown> & { driveFileIds?: unknown }) | null;
  const target = parseTarget(body ? { projectId: body.projectId, entryId: body.entryId, componentId: body.componentId,
    characterId: body.characterId, unitId: body.unitId } : null);
  const ids = Array.isArray(body?.driveFileIds) ? [...new Set(body.driveFileIds)] : [];
  if (!target || target.kind !== "project" || ids.length === 0 || ids.length > MAX_PICK || !ids.every(validDriveId)) return json({ error: "invalid" }, 400);
  const { supabase, owner } = session;

  const verified = await verifyTarget(supabase, owner.id, target);
  if (verified === "unavailable") return json({ error: "unavailable" }, 503);
  if (verified === "missing") return json({ error: "no_project" }, 404);
  const access = await accessToken(supabase, owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);

  const linked: unknown[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids as string[]) {
    let meta;
    try {
      meta = await getFileMeta(access.token, id);
    } catch (error) {
      skipped.push({ id, reason: error instanceof GoogleError && error.status === 404 ? "not_granted" : "google" });
      continue;
    }
    if (meta.mimeType === FOLDER) { skipped.push({ id, reason: "folder" }); continue; }
    if (meta.trashed) { skipped.push({ id, reason: "trashed" }); continue; }
    const size = meta.size !== undefined && Number.isSafeInteger(Number(meta.size)) ? Number(meta.size) : null;
    const md5 = typeof meta.md5Checksum === "string" && /^[0-9a-f]{32}$/.test(meta.md5Checksum) ? meta.md5Checksum : null;
    const inserted = await supabase.from("project_files").insert({
      user_id: owner.id, project_id: target.projectId, ...linkColumns(target),
      source: "picked", drive_file_id: meta.id, name: (meta.name || "Untitled").slice(0, 500), mime_type: meta.mimeType || null, size, md5,
    }).select(PROJECT_FILE_COLUMNS).single().then((r) => r, () => null);
    if (inserted && !inserted.error && inserted.data) linked.push(inserted.data);
    else skipped.push({ id, reason: inserted?.error && (inserted.error as { code?: string }).code === "23505" ? "already_linked" : "storage" });
  }
  return json({ linked, skipped });
}
