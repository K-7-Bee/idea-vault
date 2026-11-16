import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { IDEA_COLUMNS, PAGE_SIZE, withFileUrls, type RawIdea } from "@/lib/ideas";
import { vaultStats } from "@/lib/vault-stats";
import Capture from "./capture";
import Dashboard from "./dashboard";
import VaultSidebar, { VaultTopBar } from "./sidebar";

export default function VaultPage() {
  return (
    <div className="vault flex min-h-screen text-foreground">
      <VaultSidebar />
      <div className="min-w-0 flex-1">
        <VaultTopBar />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
          {/* Reads your login cookie, so it loads at request time behind a boundary. */}
          <Suspense
            fallback={<div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />}
          >
            <VaultContent />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// A light index of every idea, so folder counts, tags and the streak cover all of them.
// Read in pages of 1000 (the most the server returns at once) so no idea is skipped.
async function ideaIndex(supabase: Awaited<ReturnType<typeof createClient>>) {
  const STEP = 1000;
  const rows: { id: string; tags: string[]; status: string; created_at: string }[] = [];
  for (let from = 0; ; from += STEP) {
    const { data, error } = await supabase
      .from("ideas")
      .select("id, tags, status, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + STEP - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < STEP) break;
  }
  return rows;
}

async function VaultContent() {
  const supabase = await createClient();
  const identity = await supabase.auth.getUser().catch(() => null);
  const user = identity?.data.user;
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (identity?.error || !user || !allowed || user.email?.toLowerCase() !== allowed) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const result = await Promise.all([
    supabase
      .from("ideas")
      .select(IDEA_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE),
    ideaIndex(supabase),
  ]).catch(() => null);

  if (!result || result[0].error || !result[0].data || !result[1]) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load your ideas</h2>
          <p className="mt-2 text-sm text-muted">
            The saved ideas or their counts could not be loaded. Your saved data
            and pending captures on this device have not been changed.
          </p>
        </div>
        <a className="mt-4 inline-block underline" href="/vault">Try loading again</a>
      </section>
    );
  }

  const [ideas, index] = result;

  const initial = await withFileUrls(supabase, ideas.data as unknown as RawIdea[]);

  return (
    <>
      <Dashboard stats={vaultStats(index, new Date())} />
      <section id="ideas" aria-label="Ideas" className="scroll-mt-6">
        <Capture
          key={user.id}
          ownerId={user.id}
          initial={initial}
          initialTags={index.map((r) => r.tags)}
          initialMeta={index.map(({ id, status, created_at }) => ({ id, status, created_at }))}
        />
      </section>
    </>
  );
}
