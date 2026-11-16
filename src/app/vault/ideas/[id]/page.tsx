import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IDEA_DETAIL_COLUMNS, withFileUrls, type RawIdea } from "@/lib/ideas";
import type { IdeaDetail } from "@/lib/idea-detail";
import { verifiedOwner } from "@/lib/vault-owner";
import VaultShell from "../../vault-shell";
import IdeaView from "./idea-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        {params.then(({ id }) => <IdeaContent id={id} />)}
      </Suspense>
    </VaultShell>
  );
}

async function IdeaContent({ id }: { id: string }) {
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  // Owner-only row security means another account's idea reads as "not found", never as data.
  const result = await supabase
    .from("ideas")
    .select(IDEA_DETAIL_COLUMNS)
    .eq("id", id)
    .eq("user_id", owner.id)
    .maybeSingle()
    .then((r) => r, () => null);
  if (!result || result.error) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load this idea</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href={`/vault/ideas/${id}`}>Try loading again</a>
      </section>
    );
  }
  if (!result.data) notFound();
  const [idea] = await withFileUrls(supabase, [result.data as unknown as RawIdea]);
  return <IdeaView ownerId={owner.id} initial={idea as unknown as IdeaDetail} />;
}
