import { createClient } from "@/lib/supabase/server";
import Capture from "./capture";

export default async function VaultPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("id, content, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Idea Vault</h1>
      <Capture initial={data ?? []} />
    </main>
  );
}
