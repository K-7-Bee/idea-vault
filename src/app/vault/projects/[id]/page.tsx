import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { ALL_TABLES, PROJECT_COLUMNS, type Project, type Row, type TableName } from "@/lib/workspace";
import { driveUploadsEnabled } from "@/lib/drive/files";
import { PROJECT_FILE_COLUMNS } from "@/lib/drive/targets";
import type { ProjectFile } from "@/lib/project-files";
import { DRAFT_COLUMNS, type LiveShowcase, type ShowcaseDraft } from "@/lib/showcase";
import { aiSettings } from "@/lib/ai/limits";
import VaultShell from "../../vault-shell";
import type { AssistantConfig } from "./assistant-panel";
import ProjectWorkspace from "./project-workspace";
import type { DrawingSummary } from "./drawings/sketch-strip";
import { canvasFor, parseDrawing, previewOf } from "@/lib/drawing/format";
import { BOARD_COLUMNS, type Board } from "@/lib/boards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Per record type. The page says so if a list is cut off rather than hiding it.
const RECORD_LIMIT = 1000;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        {params.then(({ id }) => <ProjectContent id={id} />)}
      </Suspense>
    </VaultShell>
  );
}

function LoadError({ id }: { id: string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <div role="alert">
        <h2 className="text-lg font-semibold">Unable to load this project</h2>
        <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
      </div>
      <a className="mt-4 inline-block underline" href={`/vault/projects/${id}`}>Try loading again</a>
    </section>
  );
}

async function ProjectContent({ id }: { id: string }) {
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  // Owner-only row security means another account's project reads as "not found", never as data.
  const project = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", owner.id)
    .maybeSingle()
    .then((r) => r, () => null);
  if (!project || project.error) return <LoadError id={id} />;
  if (!project.data) notFound();
  const data = project.data as Project;

  const [projectFiles, showcaseDraft, liveShowcase, sourceIdea, drawingRows, boardRows, ...lists] = await Promise.all([
    supabase.from("project_files").select(PROJECT_FILE_COLUMNS).eq("project_id", id).eq("user_id", owner.id)
      .order("created_at", { ascending: false }).limit(RECORD_LIMIT).then((r) => r, () => null),
    // Phase 4A: the private showcase draft and, if published, what is live.
    supabase.from("project_showcases").select(DRAFT_COLUMNS).eq("project_id", id).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
    supabase.from("showcases").select("project_id, slug, published_at").eq("project_id", id).maybeSingle().then((r) => r, () => null),
    data.source_idea_id
      ? supabase.from("ideas").select("id, title, content").eq("id", data.source_idea_id).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null)
      : Promise.resolve(null),
    // Phase 7: drawings, reduced to thumbnails below so a large storyboard stays light.
    supabase.from("drawings").select("id, unit_id, base_file_id, title, aspect, data, position, updated_at").eq("project_id", id).eq("user_id", owner.id)
      .limit(RECORD_LIMIT).then((r) => r, () => null),
    supabase.from("boards").select(BOARD_COLUMNS).eq("project_id", id).eq("user_id", owner.id).limit(RECORD_LIMIT).then((r) => r, () => null),
    ...ALL_TABLES.map((table) =>
      supabase.from(table).select("*").eq("project_id", id).eq("user_id", owner.id).limit(RECORD_LIMIT).then((r) => r, () => null),
    ),
  ]);
  if (lists.some((r) => !r || r.error || !r.data) || !projectFiles || projectFiles.error || !projectFiles.data
    || !showcaseDraft || showcaseDraft.error || !liveShowcase || liveShowcase.error || !drawingRows || drawingRows.error || !boardRows || boardRows.error) return <LoadError id={id} />;
  const drawings: DrawingSummary[] = (drawingRows.data ?? []).map((d) => ({
    id: String(d.id), unit_id: (d.unit_id as string | null) ?? null, base_file_id: (d.base_file_id as string | null) ?? null, title: String(d.title ?? ""),
    aspect: String(d.aspect), position: Number(d.position) || 0, updated_at: String(d.updated_at),
    preview: previewOf(parseDrawing(d.data, canvasFor("16:9"))),
  }));

  // Phase 5A: the assistant's limits and this project's saved conversations, when it is switched on.
  const ai = aiSettings();
  let assistant: AssistantConfig | null = null;
  if (ai.enabled) {
    const [usage, convos] = await Promise.all([
      supabase.rpc("ai_usage_now").then((r) => r, () => null),
      supabase.from("ai_conversations").select("id, mode, title, updated_at").eq("project_id", id).eq("user_id", owner.id)
        .order("updated_at", { ascending: false }).limit(50).then((r) => r, () => null),
    ]);
    const now = usage && !usage.error && Array.isArray(usage.data) ? usage.data[0] as { month_usd: number | string; today_requests: number } | undefined : undefined;
    if (now && convos && !convos.error && Array.isArray(convos.data)) {
      assistant = { model: ai.model, monthlyUsd: ai.monthlyUsd, dailyRequests: ai.dailyRequests, monthUsd: Number(now.month_usd),
        todayRequests: now.today_requests, conversations: convos.data as AssistantConfig["conversations"] };
    }
  }

  const records = Object.fromEntries(ALL_TABLES.map((table, i) => [table, lists[i]!.data as Row[]])) as Record<TableName, Row[]>;
  const truncated = ALL_TABLES.filter((table) => records[table].length >= RECORD_LIMIT);
  const idea = sourceIdea && !sourceIdea.error && sourceIdea.data
    ? { id: String(sourceIdea.data.id), label: String(sourceIdea.data.title ?? sourceIdea.data.content).slice(0, 120) || "Attachment-only idea" }
    : null;

  return (
    <ProjectWorkspace ownerId={owner.id} initialProject={data} initialRecords={records} sourceIdea={idea} truncated={truncated}
      initialFiles={projectFiles.data as unknown as ProjectFile[]} driveUploads={driveUploadsEnabled()}
      showcase={{ draft: (showcaseDraft.data as unknown as ShowcaseDraft | null) ?? null, live: (liveShowcase.data as LiveShowcase | null) ?? null }}
      picker={{ apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "", appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "" }}
      assistant={assistant} drawings={drawings} boards={(boardRows.data ?? []) as unknown as Board[]} />
  );
}
