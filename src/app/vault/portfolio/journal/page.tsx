import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { ENTRY_COLUMNS, STATE_COLUMNS, asEntry, type PublishState } from "@/lib/journal";
import VaultShell from "../../vault-shell";
import JournalList from "./journal-list";

// Phase 4D: the owner's journal entries and their status. Owner only: the proxy guards /vault and
// this checks again. Nothing here changes the public site.
export default function JournalPage() {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        <JournalContent />
      </Suspense>
    </VaultShell>
  );
}

async function JournalContent() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const [entries, states] = await Promise.all([
    supabase.from("journal_entries").select(ENTRY_COLUMNS).eq("user_id", owner.id).order("updated_at", { ascending: false }).limit(500).then((r) => r, () => null),
    supabase.from("journal_published").select(STATE_COLUMNS).limit(500).then((r) => r, () => null),
  ]);
  if (!entries || entries.error || !Array.isArray(entries.data) || !states || states.error || !Array.isArray(states.data)) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load your journal</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <Link className="mt-4 inline-block underline" href="/vault/portfolio/journal">Try loading again</Link>
      </section>
    );
  }
  return (
    <JournalList ownerId={owner.id}
      entries={(entries.data as Record<string, unknown>[]).map(asEntry)}
      states={states.data as PublishState[]} />
  );
}
