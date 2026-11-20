import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { DRAFT_COLUMNS, draftContent, type ShowcaseDraft } from "@/lib/showcase";
import ProjectsFrame from "../../../../projects/frame";
import ShowcaseView from "../../../../projects/showcase-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phase 4A: the saved showcase draft rendered with the public page's own components. Owner only
// (the proxy guards /vault, and this checks again). Images come through the owner-checked Drive
// route; on the public page they come from the public copies made when publishing.
export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-6">Loading preview…</p>}>
      {params.then(({ id }) => <Preview id={id} />)}
    </Suspense>
  );
}

async function Preview({ id }: { id: string }) {
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) return <p role="alert" className="p-6">Unable to verify your account. <a href="/login">Log in again</a></p>;
  const draft = await supabase.from("project_showcases").select(DRAFT_COLUMNS).eq("project_id", id).eq("user_id", owner.id)
    .maybeSingle().then((r) => r, () => null);
  if (!draft || draft.error) return <p role="alert" className="p-6">Couldn&apos;t load the preview. Try again.</p>;
  if (!draft.data) notFound();
  const d = draft.data as unknown as ShowcaseDraft;
  return (
    <>
      <p role="status" className="sticky top-0 z-20 bg-[#061527] px-4 py-2 text-center text-sm text-white">
        Preview of the saved draft (version {d.version}). Not public. Links and navigation are turned off here.
      </p>
      <ProjectsFrame preview>
        <ShowcaseView preview content={draftContent(d, (fileId) => `/api/drive/file/${fileId}?size=thumb`)} />
      </ProjectsFrame>
    </>
  );
}
