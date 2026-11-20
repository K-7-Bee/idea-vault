import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { PROJECT_COLUMNS, type Project } from "@/lib/workspace";
import type { LiveShowcase } from "@/lib/showcase";
import SessionBoundary from "../session-boundary";
import { STATUS_COLOR, STATUS_INFO } from "../status";
import VaultShell from "../vault-shell";
import OrphanCleanup from "./orphan-cleanup";

// Phase 4A: the Portfolio page. Which projects are on the public site, which are ready to
// showcase, and which could be once they are completed. Publishing happens on each project's
// Showcase tab; nothing here changes the public site.
export default function PortfolioPage() {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />}>
        <PortfolioContent />
      </Suspense>
    </VaultShell>
  );
}

async function PortfolioContent() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const [projects, live] = await Promise.all([
    supabase.from("projects").select(PROJECT_COLUMNS).eq("user_id", owner.id).is("archived_at", null)
      .in("publication_status", ["ready", "published"]).order("updated_at", { ascending: false }).limit(500).then((r) => r, () => null),
    supabase.from("showcases").select("project_id, slug, published_at").limit(500).then((r) => r, () => null),
  ]);
  const completed = await supabase.from("projects").select("id, title, stage, publication_status").eq("user_id", owner.id)
    .is("archived_at", null).eq("stage", "completed").eq("publication_status", "private").limit(500).then((r) => r, () => null);
  if (!projects || projects.error || !live || live.error || !completed || completed.error) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load your portfolio</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href="/vault/portfolio">Try loading again</a>
      </section>
    );
  }
  const all = projects.data as Project[];
  const liveBy = new Map((live.data as LiveShowcase[]).map((s) => [s.project_id, s]));
  const published = all.filter((p) => p.publication_status === "published" && liveBy.has(p.id));
  const ready = all.filter((p) => p.publication_status === "ready" && p.stage === "completed");
  const waiting = all.filter((p) => p.publication_status === "ready" && p.stage !== "completed");
  const privateDone = completed.data as Pick<Project, "id" | "title" | "stage">[];

  return (
    <SessionBoundary ownerId={owner.id}>
      <OrphanCleanup />
      <section aria-labelledby="portfolio-heading" className="grid gap-8">
        <div>
          <h2 id="portfolio-heading" className="text-2xl font-bold">Portfolio</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Only a completed project that you publish from its Showcase tab appears on your public site, and only the fields you chose.
            Moving it out of Completed, archiving it or unpublishing it takes it down immediately.
          </p>
        </div>

        <Group title="On your public site" empty="Nothing published yet. Your three hand-written case studies are still shown.">
          {published.map((p) => (
            <Card key={p.id} project={p}>
              <a href={`/projects/${liveBy.get(p.id)!.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
                View public page<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Card>
          ))}
        </Group>

        <Group title="Ready to showcase" empty="No completed project is marked Ready to showcase.">
          {ready.map((p) => <Card key={p.id} project={p} />)}
        </Group>

        {waiting.length > 0 && (
          <Group title="Marked ready, not completed yet" empty="">
            {waiting.map((p) => <Card key={p.id} project={p} note="Set its stage to Completed before publishing." />)}
          </Group>
        )}

        {privateDone.length > 0 && (
          <Group title="Completed, kept private" empty="">
            {privateDone.map((p) => (
              <li key={p.id}>
                <Link href={`/vault/projects/${p.id}#showcase`} className="block rounded-2xl border border-dashed border-line p-4 text-sm hover:bg-card">
                  <span className="font-semibold">{p.title}</span>
                  <span className="mt-1 block text-muted">Private. Open its Showcase tab if you want to publish it.</span>
                </Link>
              </li>
            ))}
          </Group>
        )}
      </section>
    </SessionBoundary>
  );
}

function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children.length === 0
        ? <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{empty}</p>
        : <ul className="mt-2 grid gap-3 md:grid-cols-2">{children}</ul>}
    </section>
  );
}

function Card({ project: p, note, children }: { project: Project; note?: string; children?: React.ReactNode }) {
  return (
    <li className="relative overflow-hidden rounded-2xl border border-line bg-card p-4 pl-5 shadow-sm">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[p.stage] }} />
      <Link href={`/vault/projects/${p.id}#showcase`} className="break-words font-semibold underline-offset-4 hover:underline">{p.title}</Link>
      <p className="mt-1 text-xs text-muted">{STATUS_INFO[p.stage]?.label ?? p.stage}</p>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {children && <div className="mt-3">{children}</div>}
    </li>
  );
}
