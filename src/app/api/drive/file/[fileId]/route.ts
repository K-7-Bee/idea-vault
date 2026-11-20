import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { disposition, inlineSafe, isGoogleNative, isUuid, safeRange } from "@/lib/drive/files";
import { GoogleError, fileMedia, getFileMeta } from "@/lib/drive/google";
import { DRIVE_PREVIEW_MAX_BYTES } from "@/lib/ideas";
import { routeOwner } from "@/lib/drive/route-helpers";

// Serves one Drive attachment to its owner. Small files stream through here (with Range, so audio
// and video can seek); large ones, or ?open=drive, redirect to the file in the owner's Google Drive.
// Not gated by the upload switch: linked files stay viewable after uploads are turned off.

const LOCKED = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function unavailable(status: number, message: string): Response {
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Attachment unavailable</title>`
    + `<body style="font-family:system-ui;margin:2rem;max-width:36rem;line-height:1.5"><h1 style="font-size:1.2rem">Attachment unavailable</h1>`
    + `<p>${message}</p><p>The idea and its record are unchanged. <a href="/vault">Back to the Vault</a></p></body>`;
  return new Response(page, { status, headers: { ...LOCKED, "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
}

const GONE = "This file was deleted, moved out of the Vault's Drive folder, or is in the Drive trash.";
const RECONNECT = "Google Drive needs reconnecting. Open Settings in the Vault and reconnect Drive.";

function driveLink(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const test = process.env.VAULT_E2E === "1" && process.env.DRIVE_GOOGLE_TEST_BASE ? new URL(process.env.DRIVE_GOOGLE_TEST_BASE).origin : null;
    if (url.protocol === "https:" && /(^|\.)google\.com$/.test(url.hostname)) return url.toString();
    if (test && url.origin === test) return url.toString();
  } catch { /* not a URL */ }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await routeOwner();
  if (!session) return new Response("Not signed in to the Vault.", { status: 401, headers: LOCKED });
  const { fileId } = await params;
  if (!isUuid(fileId)) return unavailable(404, "This attachment doesn't exist.");

  // Idea attachments (3B) first, then project files (3C). Both are owner-filtered.
  type Linked = { name: string; mime_type: string | null; size: number | null; drive_file_id: string };
  const lookup = async (table: "idea_files" | "project_files") => {
    let q = session.supabase.from(table).select("id, name, mime_type, size, drive_file_id").eq("id", fileId).eq("user_id", session.owner.id);
    if (table === "idea_files") q = q.eq("provider", "drive");
    const r = await q.limit(1).then((x) => x, () => null);
    return !r || r.error || !Array.isArray(r.data) ? undefined : ((r.data[0] as Linked | undefined) ?? null);
  };
  const ideaRow = await lookup("idea_files");
  const row = ideaRow ?? (ideaRow === null ? await lookup("project_files") : undefined);
  if (row === undefined) return unavailable(503, "The Vault couldn't load this attachment. Try again.");
  if (!row) return unavailable(404, "This attachment doesn't exist.");

  const access = await accessToken(session.supabase, session.owner.id, Date.now());
  if (!access.ok) {
    return unavailable(409, access.reason === "reconnect" || access.reason === "not_connected" ? RECONNECT : "Google Drive couldn't be reached. Try again.");
  }

  // Google Docs/Sheets/Slides (no size, no bytes) and large files open in Drive.
  if (request.nextUrl.searchParams.get("open") === "drive" || row.size === null || isGoogleNative(row.mime_type)
      || Number(row.size) > DRIVE_PREVIEW_MAX_BYTES) {
    try {
      const meta = await getFileMeta(access.token, row.drive_file_id);
      const link = driveLink(meta.webViewLink);
      if (meta.trashed || !link) return unavailable(404, GONE);
      return new Response(null, { status: 303, headers: { ...LOCKED, Location: link } });
    } catch (error) {
      if (error instanceof GoogleError && error.status === 404) return unavailable(404, GONE);
      if (error instanceof GoogleError && error.status === 401) return unavailable(409, RECONNECT);
      return unavailable(502, "Google Drive couldn't be reached. Try again.");
    }
  }

  let upstream: Response;
  try {
    upstream = await fileMedia(access.token, row.drive_file_id, safeRange(request.headers.get("range")));
  } catch {
    return unavailable(502, "Google Drive couldn't be reached. Try again.");
  }
  if (upstream.status === 404) return unavailable(404, GONE);
  if (upstream.status === 401) return unavailable(409, RECONNECT);
  if (upstream.status === 416) return new Response(null, { status: 416, headers: { ...LOCKED, "Content-Range": upstream.headers.get("content-range") ?? "" } });
  if (upstream.status !== 200 && upstream.status !== 206) return unavailable(502, "Google Drive couldn't send this file. Try again.");

  const inline = inlineSafe(row.mime_type);
  const headers: Record<string, string> = {
    ...LOCKED,
    "Content-Type": inline ? row.mime_type! : "application/octet-stream",
    "Content-Disposition": disposition(inline ? "inline" : "attachment", row.name),
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Accept-Ranges": "bytes",
  };
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
