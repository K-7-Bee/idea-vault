import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { IDEA_COLUMNS, PAGE_SIZE, withFileUrls, type RawIdea } from "@/lib/ideas";
import Capture from "./capture";
import LogoutButton from "./logout-button";

export default function VaultPage() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Idea Vault</h1>
        <LogoutButton />
      </div>
      {/* Reads your login cookie, so it loads at request time behind a boundary. */}
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <VaultContent />
      </Suspense>
    </main>
  );
}

// Reads tags in pages of 1000 (the most the server returns at once) so no idea is skipped.
async function allTagLists(supabase: Awaited<ReturnType<typeof createClient>>) {
  const STEP = 1000;
  const lists: string[][] = [];
  for (let from = 0; ; from += STEP) {
    const { data } = await supabase
      .from("ideas")
      .select("tags")
      .order("created_at", { ascending: false })
      .range(from, from + STEP - 1);
    if (!data) break;
    lists.push(...data.map((r) => r.tags as string[]));
    if (data.length < STEP) break;
  }
  return lists;
}

async function VaultContent() {
  const supabase = await createClient();
  const [ideas, allTags] = await Promise.all([
    supabase
      .from("ideas")
      .select(IDEA_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    // Just the tag lists, so the tag buttons cover every idea, not only the latest 100.
    allTagLists(supabase),
  ]);

  return (
    <Capture
      initial={await withFileUrls(supabase, (ideas.data ?? []) as unknown as RawIdea[])}
      initialTags={allTags}
    />
  );
}
