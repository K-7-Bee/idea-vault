import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFT_COLUMNS, asDraft, filesUsed, type ProfileContent } from "@/lib/profile";
import { LIBRARY_BUCKET, LIBRARY_COLUMNS, type LibraryFile } from "@/lib/library";
import HomeView, { type HomeMedia } from "../../../../portfolio/home-view";

// Phase 4B: the saved profile draft rendered with the public homepage's own component. Owner only
// (the proxy guards /vault, and this checks again). Phase 4C: the draft's résumé and photo are shown
// from the private library through short-lived signed links; nothing is copied to the public site.
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
  const media = await previewMedia(supabase, owner.id, d.content);
  return (
    <>
      <p role="status" className="sticky top-0 z-50 bg-[#061527] px-4 py-2 text-center text-sm text-white">
        Preview of the saved profile draft (version {d.version}). Not public until you publish.
      </p>
      {media.missing && (
        <p role="alert" className="bg-[#7a1d1d] px-4 py-2 text-center text-sm text-white">
          {media.missing} Choose it again in the profile editor.
        </p>
      )}
      <HomeView content={d.content} media={media.links} />
    </>
  );
}

const SIGNED_SECONDS = 10 * 60;

async function previewMedia(supabase: SupabaseClient, ownerId: string, content: ProfileContent): Promise<{ links: HomeMedia; missing: string | null }> {
  const used = filesUsed(content);
  if (!used.length) return { links: {}, missing: null };
  const rows = await supabase.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", ownerId).in("id", used.map((u) => u.id)).then((r) => r, () => null);
  const files = rows && !rows.error && Array.isArray(rows.data) ? rows.data as LibraryFile[] : [];
  const links: HomeMedia = {};
  let missing: string | null = null;
  for (const { part, id } of used) {
    const file = files.find((f) => f.id === id);
    const signed = file
      ? await supabase.storage.from(LIBRARY_BUCKET).createSignedUrl(file.path, SIGNED_SECONDS, part === "resume" ? { download: content.resume.name || true } : undefined).then((r) => r, () => null)
      : null;
    const url = signed && !signed.error ? signed.data?.signedUrl : undefined;
    if (!url) { missing = `The ${part === "resume" ? "résumé" : "photo"} file couldn't be loaded from your library.`; continue; }
    if (part === "resume") links.resumeHref = url; else links.photoSrc = url;
  }
  return { links, missing };
}
