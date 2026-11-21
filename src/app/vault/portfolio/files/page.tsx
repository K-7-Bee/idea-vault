import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { normalize } from "@/lib/profile";
import { loadLibrary } from "@/lib/library-server";
import VaultShell from "../../vault-shell";
import FilesManager from "./files-manager";

// Phase 4C: the private files library (PDFs and images for the résumé and photo). Owner only: the
// proxy guards /vault and this checks again. Nothing here is public until the profile is published.
export default function FilesPage() {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        <FilesContent />
      </Suspense>
    </VaultShell>
  );
}

async function FilesContent() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const [library, draft] = await Promise.all([
    loadLibrary(supabase, owner.id),
    supabase.from("profile_drafts").select("content").eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
  ]);
  if (!library || !draft || draft.error) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load your files</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href="/vault/portfolio/files">Try loading again</a>
      </section>
    );
  }
  const content = draft.data ? normalize((draft.data as { content: unknown }).content) : null;
  return <FilesManager ownerId={owner.id} initialFiles={library} draftUses={{ resume: content?.resume.file ?? "", photo: content?.photo.file ?? "" }} />;
}
