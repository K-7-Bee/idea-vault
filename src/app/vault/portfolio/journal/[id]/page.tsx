import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { ENTRY_COLUMNS, LIBRARY_ID, STATE_COLUMNS, asEntry, type PublishState } from "@/lib/journal";
import { loadLibrary } from "@/lib/library-server";
import VaultShell from "../../../vault-shell";
import EntryEditor, { type LabEntry, type ProjectOption } from "./entry-editor";

// Phase 4D: one journal entry's editor. Owner only (the proxy guards /vault and this checks again).
export default function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        {params.then(({ id }) => <EntryContent id={id} />)}
      </Suspense>
    </VaultShell>
  );
}

async function EntryContent({ id }: { id: string }) {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  if (!LIBRARY_ID.test(id)) return <NotFound />;
  const [entry, state, projects, live, lab, library] = await Promise.all([
    supabase.from("journal_entries").select(ENTRY_COLUMNS).eq("id", id).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
    supabase.from("journal_published").select(STATE_COLUMNS).eq("entry_id", id).maybeSingle().then((r) => r, () => null),
    supabase.from("projects").select("id, title").eq("user_id", owner.id).is("archived_at", null).order("updated_at", { ascending: false }).limit(500).then((r) => r, () => null),
    supabase.from("showcases").select("project_id").limit(500).then((r) => r, () => null),
    supabase.from("project_entries").select("id, project_id, kind, title, body").eq("user_id", owner.id).order("updated_at", { ascending: false }).limit(500).then((r) => r, () => null),
    loadLibrary(supabase, owner.id),
  ]);
  if (!entry || entry.error || !state || state.error || !projects || projects.error || !live || live.error || !lab || lab.error || !library) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load this entry</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href={`/vault/portfolio/journal/${id}`}>Try loading again</a>
      </section>
    );
  }
  if (!entry.data) return <NotFound />;
  const publicIds = new Set((live.data as { project_id: string }[]).map((s) => s.project_id));
  return (
    <EntryEditor
      ownerId={owner.id}
      initialEntry={asEntry(entry.data as Record<string, unknown>)}
      initialState={(state.data as PublishState | null) ?? null}
      projects={(projects.data as { id: string; title: string }[]).map((p): ProjectOption => ({ ...p, public: publicIds.has(p.id) }))}
      labEntries={lab.data as LabEntry[]}
      initialLibrary={library}
    />
  );
}

function NotFound() {
  return (
    <section role="alert" className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">Entry not found</h2>
      <p className="mt-2 text-sm text-muted">It may have been deleted. <Link className="underline" href="/vault/portfolio/journal">Back to the journal</Link></p>
    </section>
  );
}
