import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { DRAFT_COLUMNS, asDraft } from "@/lib/profile";
import HomeView from "../../../../portfolio/home-view";

// Phase 4B: the saved profile draft rendered with the public homepage's own component. Owner only
// (the proxy guards /vault, and this checks again).
export default function ProfilePreviewPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading preview…</p>}>
      <Preview />
    </Suspense>
  );
}

async function Preview() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) return <p role="alert" className="p-6">Unable to verify your account. <a href="/login">Log in again</a></p>;
  const draft = await supabase.from("profile_drafts").select(DRAFT_COLUMNS).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
  if (!draft || draft.error) return <p role="alert" className="p-6">Couldn&apos;t load the preview. Try again.</p>;
  if (!draft.data) {
    return <p role="alert" className="p-6">There&apos;s no saved draft yet. <a className="underline" href="/vault/portfolio/profile">Open the profile editor</a> and save one.</p>;
  }
  const d = asDraft(draft.data as never);
  return (
    <>
      <p role="status" className="sticky top-0 z-50 bg-[#061527] px-4 py-2 text-center text-sm text-white">
        Preview of the saved profile draft (version {d.version}). Not public until you publish.
      </p>
      <HomeView content={d.content} />
    </>
  );
}
