import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { PROJECT_FILE_COLUMNS } from "@/lib/drive/targets";
import type { ProjectFile } from "@/lib/project-files";
import { unitPath, type Row } from "@/lib/workspace";
import { canvasFor, parseDrawing, previewOf } from "@/lib/drawing/format";
import { BOARD_COLUMNS, CARD_COLUMNS, LINK_COLUMNS, type Board, type Card, type Connection } from "@/lib/boards";
import VaultShell from "../../../../vault-shell";
import BoardEditor, { type BoardRefs } from "./board-editor";

// Phase 7C: one visual board, a full page. Owner-only; another account's board reads as not found.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Board" };

export default function BoardPage({ params }: { params: Promise<{ id: string; boardId: string }> }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-card" />}>
        {params.then(({ id, boardId }) => <BoardContent projectId={id} boardId={boardId} />)}
      </Suspense>
    </VaultShell>
  );
}

async function BoardContent({ projectId, boardId }: { projectId: string; boardId: string }) {
  if (!UUID.test(projectId) || !UUID.test(boardId)) notFound();
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;

  const settle = <T,>(p: PromiseLike<T>) => Promise.resolve(p).then((r) => r, () => null);
  const scoped = (table: string, columns: string) =>
    settle(supabase.from(table).select(columns).eq("project_id", projectId).eq("user_id", owner.id).limit(1000));
  const [project, board, cards, links, files, drawings, units, characters, entries] = await Promise.all([
    settle(supabase.from("projects").select("id, title").eq("id", projectId).eq("user_id", owner.id).maybeSingle()),
    settle(supabase.from("boards").select(BOARD_COLUMNS).eq("id", boardId).eq("project_id", projectId).eq("user_id", owner.id).maybeSingle()),
    settle(supabase.from("board_cards").select(CARD_COLUMNS).eq("board_id", boardId).eq("user_id", owner.id).limit(1000)),
    settle(supabase.from("board_links").select(LINK_COLUMNS).eq("board_id", boardId).eq("user_id", owner.id).limit(2000)),
    scoped("project_files", PROJECT_FILE_COLUMNS),
    scoped("drawings", "id, unit_id, base_file_id, title, data"),
    scoped("story_units", "id, parent_id, kind, title, position, version, created_at, updated_at"),
    scoped("story_characters", "id, name"),
    scoped("project_entries", "id, title, kind"),
  ]);
  const all = [project, board, cards, links, files, drawings, units, characters, entries];
  if (all.some((r) => !r || r.error)) {
    return (
      <section role="alert" className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Unable to load this board</h2>
        <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        <a className="mt-4 inline-block underline" href={`/vault/projects/${projectId}/boards/${boardId}`}>Try loading again</a>
      </section>
    );
  }
  if (!project!.data || !board!.data) notFound();

  const unitRows = (units!.data ?? []) as unknown as Row[];
  const fileRows = (files!.data ?? []) as unknown as ProjectFile[];
  type Named = { id: string; name?: string; title?: string; kind?: string };
  const refs: BoardRefs = {
    files: fileRows.map((f) => ({ id: f.id, label: f.name, file: f })),
    drawings: ((drawings!.data ?? []) as unknown as { id: string; unit_id: string | null; base_file_id: string | null; title: string; data: unknown }[])
      .map((d) => {
        const owner = d.unit_id ? unitPath(unitRows, d.unit_id) : fileRows.find((f) => f.id === d.base_file_id)?.name;
        return { id: d.id, label: `${d.title || (d.base_file_id ? "Annotations" : "Sketch")}${owner ? ` (${owner})` : ""}`,
          preview: previewOf(parseDrawing(d.data, canvasFor("16:9"))) };
      }),
    units: unitRows.map((u) => ({ id: String(u.id), label: unitPath(unitRows, String(u.id)) || String(u.title) })),
    characters: ((characters!.data ?? []) as unknown as Named[]).map((c) => ({ id: c.id, label: String(c.name) })),
    entries: ((entries!.data ?? []) as unknown as Named[]).map((e) => ({ id: e.id, label: String(e.title) })),
  };

  return (
    <BoardEditor key={boardId} ownerId={owner.id} projectId={projectId} projectTitle={String(project!.data.title)}
      initialBoard={board!.data as unknown as Board} initialCards={(cards!.data ?? []) as unknown as Card[]}
      initialLinks={(links!.data ?? []) as unknown as Connection[]} refs={refs} />
  );
}
