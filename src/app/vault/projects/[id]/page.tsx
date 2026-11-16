import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { ALL_TABLES, PROJECT_COLUMNS, type Project, type Row, type TableName } from "@/lib/workspace";
import VaultShell from "../../vault-shell";
import ProjectWorkspace from "./project-workspace";

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

  const [sourceIdea, ...lists] = await Promise.all([
    data.source_idea_id
      ? supabase.from("ideas").select("id, title, content").eq("id", data.source_idea_id).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null)
      : Promise.resolve(null),
    ...ALL_TABLES.map((table) =>
      supabase.from(table).select("*").eq("project_id", id).eq("user_id", owner.id).limit(RECORD_LIMIT).then((r) => r, () => null),
    ),
  ]);
  if (lists.some((r) => !r || r.error || !r.data)) return <LoadError id={id} />;

  const records = Object.fromEntries(ALL_TABLES.map((table, i) => [table, lists[i]!.data as Row[]])) as Record<TableName, Row[]>;
  const truncated = ALL_TABLES.filter((table) => records[table].length >= RECORD_LIMIT);
  const idea = sourceIdea && !sourceIdea.error && sourceIdea.data
    ? { id: String(sourceIdea.data.id), label: String(sourceIdea.data.title ?? sourceIdea.data.content).slice(0, 120) || "Attachment-only idea" }
    : null;

  return <ProjectWorkspace ownerId={owner.id} initialProject={data} initialRecords={records} sourceIdea={idea} truncated={truncated} />;
}
