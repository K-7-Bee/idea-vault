import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { IDEA_COLUMNS, PAGE_SIZE, withFileUrls, type RawIdea } from "@/lib/ideas";
import Capture from "./capture";
import LogoutButton from "./logout-button";
import { serif } from "./fonts";
import { SparkIcon } from "./icons";

export default function VaultPage() {
  return (
    <div className="vault min-h-screen text-foreground">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-on-accent shadow-sm shadow-accent/30">
              <SparkIcon />
            </span>
            <div>
              <h1 className={`${serif.className} text-3xl leading-none tracking-tight`}>
                Idea Vault
              </h1>
              <p className="mt-1 text-sm text-muted">Catch it before it&apos;s gone.</p>
            </div>
          </div>
          <LogoutButton />
        </header>
        {/* Reads your login cookie, so it loads at request time behind a boundary. */}
        <Suspense
          fallback={<div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />}
        >
          <VaultContent />
        </Suspense>
      </main>
    </div>
  );
}

async function VaultContent() {
  const supabase = await createClient();
  const [ideas, allTags] = await Promise.all([
    supabase
      .from("ideas")
      .select(IDEA_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    // A light index of every idea, so folder counts, tags and the streak cover all of them.
    supabase
      .from("ideas")
      .select("id, tags, status, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  const index = allTags.data ?? [];

  return (
    <Capture
      initial={await withFileUrls(supabase, (ideas.data ?? []) as unknown as RawIdea[])}
      initialTags={index.map((r) => r.tags)}
      initialMeta={index.map(({ id, status, created_at }) => ({ id, status, created_at }))}
    />
  );
}
