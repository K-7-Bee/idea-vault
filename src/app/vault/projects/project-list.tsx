import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { PROJECT_COLUMNS, PROJECT_TYPES, PUBLICATION, type Project, type ProjectType } from "@/lib/workspace";
import SessionBoundary from "../session-boundary";
import { STATUS_COLOR, STATUS_INFO } from "../status";
import VaultShell from "../vault-shell";
import NewProjectForm from "./new-project-form";

const LIMIT = 500;

type Props = { heading: string; intro: string; types: ProjectType[]; defaultType: ProjectType; empty: string; retryHref: string };

// Shared by the Project Library, Engineering Lab and Story Studio pages.
export default function ProjectListPage(props: Props) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />}>
        <ProjectListContent {...props} />
      </Suspense>
    </VaultShell>
  );
}

const typeLabel = (t: string) => PROJECT_TYPES.find((p) => p.value === t)?.label ?? t;
const publicationLabel = (p: string) => PUBLICATION.find((x) => x.value === p)?.label ?? p;

async function ProjectListContent({ heading, intro, types, defaultType, empty, retryHref }: Props) {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const result = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", owner.id)
    .in("project_type", types)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMIT + 1)
    .then((r) => r, () => null);
  if (!result || result.error || !result.data) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load projects</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href={retryHref}>Try loading again</a>
      </section>
    );
  }
  const all = (result.data as Project[]).slice(0, LIMIT);
  const active = all.filter((p) => p.archived_at === null);
  const archived = all.filter((p) => p.archived_at !== null);

  return (
    <SessionBoundary ownerId={owner.id}>
      <section aria-labelledby="projects-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="projects-heading" className="text-2xl font-bold">{heading}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>
          </div>
        </div>

        <NewProjectForm ownerId={owner.id} defaultType={defaultType} types={types} />

        {active.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-muted">{empty}</p>
        ) : (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {active.map((p) => <ProjectCard key={p.id} project={p} />)}
          </ul>
        )}
        {all.length > LIMIT && <p className="mt-4 text-sm text-muted">Showing the {LIMIT} most recently updated projects.</p>}

        {archived.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Archived projects ({archived.length})</summary>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {archived.map((p) => <ProjectCard key={p.id} project={p} />)}
            </ul>
          </details>
        )}
      </section>
    </SessionBoundary>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  return (
    <li>
      <Link
        href={`/vault/projects/${p.id}`}
        className="relative block h-full overflow-hidden rounded-2xl border border-line bg-card p-4 pl-5 shadow-sm transition hover:shadow-md"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[p.stage] }} />
        <span className="block break-words font-semibold">{p.title}</span>
        {p.summary && <span className="mt-1 line-clamp-2 block break-words text-sm text-muted">{p.summary}</span>}
        <span className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-line px-2 py-0.5">{typeLabel(p.project_type)}</span>
          <span className="rounded-full border border-line px-2 py-0.5">{STATUS_INFO[p.stage]?.label ?? p.stage}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-muted">{publicationLabel(p.publication_status)}</span>
        </span>
      </Link>
    </li>
  );
}
