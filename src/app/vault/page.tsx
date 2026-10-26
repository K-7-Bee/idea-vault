import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { IDEA_COLUMNS, withFileUrls, type RawIdea } from "@/lib/ideas";
import Capture from "./capture";

export default function VaultPage() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Idea Vault</h1>
      {/* Reads your login cookie, so it loads at request time behind a boundary. */}
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <VaultContent />
      </Suspense>
    </main>
  );
}

async function VaultContent() {
  const supabase = await createClient();
  const [ideas, allTags] = await Promise.all([
    supabase
      .from("ideas")
      .select(IDEA_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100),
    // Just the tag lists, so the tag buttons cover every idea, not only the latest 100.
    supabase.from("ideas").select("tags").limit(2000),
  ]);

  return (
    <Capture
      initial={await withFileUrls(supabase, (ideas.data ?? []) as unknown as RawIdea[])}
      initialTags={(allTags.data ?? []).map((r) => r.tags)}
    />
  );
}
