import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { isUuid } from "@/lib/drive/files";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { DRAFT_COLUMNS, publishProblems, type ShowcaseDraft } from "@/lib/showcase";
import { CopyError, copyImage, removeImages } from "@/lib/showcase-images";

// Publishes a project's saved showcase draft (Phase 4A). The owner confirmed exactly this draft
// version in the editor; if it changed since, nothing is published. Chosen images are copied from
// Drive into the public bucket first, then publish_showcase writes the snapshot and marks the
// project published in one transaction. On any failure the new copies are removed again.
export const maxDuration = 60;

type FileRow = { id: string; drive_file_id: string; name: string; mime_type: string | null; size: number | null; state: string };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { projectId?: unknown; draftVersion?: unknown } | null;
  if (!body || !isUuid(body.projectId) || !Number.isSafeInteger(body.draftVersion)) return json({ error: "invalid" }, 400);
  const projectId = body.projectId;
  const { supabase, owner } = session;

  const [project, draft, previous] = await Promise.all([
    supabase.from("projects").select("id, stage, archived_at").eq("id", projectId).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
    supabase.from("project_showcases").select(DRAFT_COLUMNS).eq("project_id", projectId).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
    supabase.from("showcases").select("images").eq("project_id", projectId).maybeSingle().then((r) => r, () => null),
  ]);
  if (!project || project.error || !draft || draft.error || !previous || previous.error) return json({ error: "unavailable", message: "Couldn't load the project. Try again." }, 503);
  if (!project.data) return json({ error: "no_project", message: "This project doesn't exist." }, 404);
  const d = draft.data as unknown as ShowcaseDraft | null;
  if (!d || d.version !== body.draftVersion) {
    return json({ error: "changed", message: "The showcase changed since you checked it. Review it again before publishing." }, 409);
  }

  const ids = d.images.map((i) => i.file_id);
  const files = ids.length
    ? await supabase.from("project_files").select("id, drive_file_id, name, mime_type, size, state")
        .eq("project_id", projectId).eq("user_id", owner.id).in("id", ids).then((r) => r, () => null)
    : { data: [] as FileRow[], error: null };
  if (!files || files.error || !Array.isArray(files.data)) return json({ error: "unavailable", message: "Couldn't load the project's files. Try again." }, 503);
  const rows = files.data as FileRow[];
  const problems = publishProblems(d, project.data as { stage: string; archived_at: string | null }, rows);
  if (problems.length) return json({ error: "not_ready", message: problems[0], problems }, 409);

  // Copy images (one at a time keeps memory to one 5 MB image).
  const copied: string[] = [];
  if (ids.length) {
    const access = await accessToken(supabase, owner.id, Date.now());
    if (!access.ok) {
      return json({ error: access.reason, message: access.reason === "unavailable" ? "Google Drive couldn't be reached. Try again."
        : "Google Drive needs reconnecting. Open Settings and reconnect Drive." }, access.reason === "unavailable" ? 503 : 409);
    }
    try {
      for (const [i, id] of ids.entries()) {
        const file = rows.find((f) => f.id === id)!;
        copied.push(await copyImage(supabase, owner.id, access.token, file.drive_file_id, `Image ${i + 1} (${file.name})`));
      }
    } catch (error) {
      await removeImages(supabase, owner.id, copied);
      if (error instanceof CopyError) return json({ error: "image", message: error.message }, error.status);
      return json({ error: "image", message: "Couldn't copy the images. Try again." }, 502);
    }
  }

  const published = await supabase.rpc("publish_showcase", { p_project: projectId, p_draft_version: d.version, p_image_paths: copied })
    .then((r) => r, () => null);
  if (!published || published.error || typeof published.data !== "number") {
    await removeImages(supabase, owner.id, copied);
    const code = published?.error?.code;
    if (code === "40001") return json({ error: "changed", message: "The showcase changed since you checked it. Review it again before publishing." }, 409);
    if (code === "23505") return json({ error: "slug", message: "Another published project already uses that address. Choose a different one." }, 409);
    if (code === "23514") return json({ error: "not_ready", message: published!.error!.message }, 409);
    if (code === "P0002") return json({ error: "no_project", message: "This project doesn't exist." }, 404);
    return json({ error: "failed", message: "Couldn't publish. Nothing changed on your public site. Try again." }, 502);
  }

  // The previous snapshot's copies are no longer used.
  const old = ((previous.data as { images?: { path: string }[] } | null)?.images ?? []).map((i) => i.path).filter((p) => !copied.includes(p));
  const cleaned = await removeImages(supabase, owner.id, old);
  return json({ ok: true, version: published.data, slug: d.slug, cleaned });
}
