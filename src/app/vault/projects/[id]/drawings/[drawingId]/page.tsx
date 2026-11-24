import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { driveUploadsEnabled } from "@/lib/drive/files";
import { PROJECT_FILE_COLUMNS } from "@/lib/drive/targets";
import { isImage, projectFileView, thumbUrl, type ProjectFile } from "@/lib/project-files";
import { unitPath, type Row } from "@/lib/workspace";
import { DRAWING_COLUMNS, type DrawingRow } from "@/lib/drawing/store";
import VaultShell from "../../../../vault-shell";
import DrawingEditor, { type EditorImage } from "./editor";

// Phase 7: the drawing editor, a full page so it fills an iPad screen and survives a reload.
// Owner-only: another account's drawing, or one from another project, reads as "not found".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Drawing" };

export default function DrawingPage({ params }: { params: Promise<{ id: string; drawingId: string }> }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-card" />}>
        {params.then(({ id, drawingId }) => <DrawingContent projectId={id} drawingId={drawingId} />)}
      </Suspense>
    </VaultShell>
  );
}

function imageFor(file: ProjectFile): EditorImage {
  const view = projectFileView(file);
  return { id: file.id, name: file.name, href: view.preview === "image" ? view.href : thumbUrl(file), available: file.state === "ok",
    link: { entryId: file.entry_id, componentId: file.component_id, characterId: file.character_id ?? null, unitId: file.unit_id ?? null } };
}

async function DrawingContent({ projectId, drawingId }: { projectId: string; drawingId: string }) {
  if (!UUID.test(projectId) || !UUID.test(drawingId)) notFound();
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;

  const settle = <T,>(p: PromiseLike<T>) => Promise.resolve(p).then((r) => r, () => null);
  const [project, drawing, units, files] = await Promise.all([
    settle(supabase.from("projects").select("id, title").eq("id", projectId).eq("user_id", owner.id).maybeSingle()),
    settle(supabase.from("drawings").select(DRAWING_COLUMNS).eq("id", drawingId).eq("project_id", projectId).eq("user_id", owner.id).maybeSingle()),
    settle(supabase.from("story_units").select("id, parent_id, kind, title, position, version, created_at, updated_at").eq("project_id", projectId).eq("user_id", owner.id).limit(1000)),
    settle(supabase.from("project_files").select(PROJECT_FILE_COLUMNS).eq("project_id", projectId).eq("user_id", owner.id).limit(1000)),
  ]);
  if (!project || project.error || !drawing || drawing.error || !units || units.error || !files || files.error) {
    return (
      <section role="alert" className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Unable to load this drawing</h2>
        <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        <a className="mt-4 inline-block underline" href={`/vault/projects/${projectId}/drawings/${drawingId}`}>Try loading again</a>
      </section>
    );
  }
  if (!project.data || !drawing.data) notFound();
  const row = drawing.data as DrawingRow;
  const fileRows = (files.data ?? []) as unknown as ProjectFile[];
  const base = row.base_file_id ? fileRows.find((f) => f.id === row.base_file_id) ?? null : null;
  const context = row.unit_id
    ? unitPath(units.data as unknown as Row[], row.unit_id) || "Scene or shot"
    : base ? base.name : "Image";
  const backgrounds = row.unit_id ? fileRows.filter((f) => isImage(f) && f.state === "ok").map(imageFor) : [];

  return (
    <DrawingEditor key={row.id} ownerId={owner.id} projectId={projectId} projectTitle={String(project.data.title)} initial={row} context={context}
      base={base ? imageFor(base) : null} backgrounds={backgrounds} driveUploads={driveUploadsEnabled()} />
  );
}
