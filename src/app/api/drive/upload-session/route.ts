import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { driveUploadsEnabled, parseUploadRequest, targetTags } from "@/lib/drive/files";
import { GoogleError, createTaggedEmptyFile, createUploadSession } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin, siteOrigin } from "@/lib/drive/route-helpers";
import { forgetMissingFolders, recordedFile, targetFolder, verifyTarget } from "@/lib/drive/targets";

// Starts one upload into the owner's Drive: an idea attachment goes to the chosen folder, a project
// file to Projects/<project title> inside it. Returns only the resumable session URL; the browser
// sends the bytes directly to Google. Error codes in `error` tell the browser whether Drive is
// unavailable (Capture may fall back; projects show a message) or the request itself is wrong.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  if (!driveUploadsEnabled()) return json({ error: "disabled" }, 409);
  const input = parseUploadRequest(await request.json().catch(() => null));
  if (!input) return json({ error: "invalid" }, 400);
  const { supabase, owner } = session;

  const target = await verifyTarget(supabase, owner.id, input.target);
  if (target === "unavailable") return json({ error: "unavailable" }, 503);
  if (target === "missing") return json({ error: input.target.kind === "idea" ? "no_idea" : "no_project" }, 404);

  // A retry of a file that is already recorded (in Drive or in Vault storage) must not upload again.
  const recorded = await recordedFile(supabase, owner.id, input.target, input.fileId);
  if (recorded === undefined) return json({ error: "unavailable" }, 503);
  if (recorded) return json({ done: true, driveFileId: (recorded.drive_file_id as string | null) ?? null });

  const access = await accessToken(supabase, owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);
  const root = access.row.folder_id;
  if (!root) return json({ error: "no_folder" }, 409);

  const tags = targetTags(input.target, input.fileId);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const folderId = await targetFolder(supabase, owner.id, access.token, root, input.target, true);
      if (!folderId) return json({ error: "unavailable" }, 503);
      if (input.size === 0) {
        const created = await createTaggedEmptyFile(access.token, { folderId, name: input.name, mimeType: input.mimeType, tags });
        return json({ done: true, driveFileId: created.id });
      }
      const url = await createUploadSession(access.token, {
        folderId, name: input.name, mimeType: input.mimeType, size: input.size, tags, origin: siteOrigin(request),
      });
      return json({ session: url });
    } catch (error) {
      // A project folder deleted in Drive is created again once; the chosen folder itself is not.
      if (error instanceof GoogleError && error.status === 404 && input.target.kind === "project" && attempt === 0) {
        await forgetMissingFolders(supabase, owner.id, access.token, root, input.target);
        continue;
      }
      if (error instanceof GoogleError && error.status === 404) return json({ error: "no_folder" }, 409);
      if (error instanceof GoogleError && error.status === 401) return json({ error: "reconnect" }, 409);
      if (error instanceof GoogleError && error.code === "storageQuotaExceeded") return json({ error: "quota" }, 409);
      return json({ error: error instanceof GoogleError ? "google" : "unavailable" }, error instanceof GoogleError ? 502 : 503);
    }
  }
  return json({ error: "no_folder" }, 409);
}
