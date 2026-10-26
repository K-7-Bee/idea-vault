import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
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
  const { data } = await supabase
    .from("ideas")
    .select("id, content, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return <Capture initial={data ?? []} />;
}
