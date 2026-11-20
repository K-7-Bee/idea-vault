import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { driveUploadsEnabled, parseUploadRequest } from "@/lib/drive/files";
import { GoogleError, createTaggedEmptyFile, createUploadSession } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin, siteOrigin } from "@/lib/drive/route-helpers";

// Starts one attachment upload into the owner's chosen Drive folder. Returns only the resumable
// session URL; the browser sends the bytes directly to Google. Error codes in `error` tell the
// browser whether to fall back to Vault storage (Drive unavailable) or to report a failure.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  if (!driveUploadsEnabled()) return json({ error: "disabled" }, 409);
  const input = parseUploadRequest(await request.json().catch(() => null));
  if (!input) return json({ error: "invalid" }, 400);

  const idea = await session.supabase.from("ideas").select("id").eq("id", input.ideaId).eq("user_id", session.owner.id)
    .limit(1).then((r) => r, () => null);
  if (!idea || idea.error || !Array.isArray(idea.data)) return json({ error: "unavailable" }, 503);
  if (idea.data.length !== 1) return json({ error: "no_idea" }, 404);

  // A retry of a file that is already recorded (in Drive or in Vault storage) must not upload again.
  const recorded = await session.supabase.from("idea_files").select("id, drive_file_id").eq("id", input.fileId)
    .eq("user_id", session.owner.id).limit(1).then((r) => r, () => null);
  if (!recorded || recorded.error || !Array.isArray(recorded.data)) return json({ error: "unavailable" }, 503);
  if (recorded.data.length === 1) return json({ done: true, driveFileId: (recorded.data[0] as { drive_file_id: string | null }).drive_file_id });

  const access = await accessToken(session.supabase, session.owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);
  const folderId = access.row.folder_id;
  if (!folderId) return json({ error: "no_folder" }, 409);

  const tags = { vaultFileId: input.fileId, vaultIdeaId: input.ideaId };
  try {
    if (input.size === 0) {
      const created = await createTaggedEmptyFile(access.token, { folderId, name: input.name, mimeType: input.mimeType, tags });
      return json({ done: true, driveFileId: created.id });
    }
    const url = await createUploadSession(access.token, {
      folderId, name: input.name, mimeType: input.mimeType, size: input.size, tags, origin: siteOrigin(request),
    });
    return json({ session: url });
  } catch (error) {
    if (error instanceof GoogleError && error.status === 404) return json({ error: "no_folder" }, 409);
    if (error instanceof GoogleError && error.status === 401) return json({ error: "reconnect" }, 409);
    if (error instanceof GoogleError && error.code === "storageQuotaExceeded") return json({ error: "quota" }, 409);
    return json({ error: "google" }, 502);
  }
}
