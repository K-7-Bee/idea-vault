import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { ENTRY_COLUMNS, LIBRARY_ID, asEntry, caseStudyTitle } from "@/lib/journal";
import { LIBRARY_BUCKET, LIBRARY_COLUMNS, type LibraryFile } from "@/lib/library";
import ProjectsFrame from "../../../../../projects/frame";
import JournalView from "../../../../../journal/journal-view";

// Phase 4D: the saved draft rendered with the public entry component, behind the owner check.
// Images come from the private library through short-lived signed links; the project is shown
// exactly as visitors would see it (named only while it is public).
const SIGNED_SECONDS = 10 * 60;

export default function JournalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-6">Loading preview…</p>}>
      {params.then(({ id }) => <Preview id={id} />)}
    </Suspense>
  );
}

async function Preview({ id }: { id: string }) {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) return <p role="alert" className="p-6">Unable to verify your account. <a href="/login">Log in again</a></p>;
  if (!LIBRARY_ID.test(id)) return <p role="alert" className="p-6">Entry not found.</p>;
  const row = await supabase.from("journal_entries").select(ENTRY_COLUMNS).eq("id", id).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
  if (!row || row.error) return <p role="alert" className="p-6">Couldn&apos;t load the preview. Try again.</p>;
  if (!row.data) return <p role="alert" className="p-6">Entry not found.</p>;
  const entry = asEntry(row.data as Record<string, unknown>);

  const ids = entry.images.map((i) => i.file);
  const files = ids.length
    ? await supabase.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", owner.id).in("id", ids).then((r) => (!r.error && Array.isArray(r.data) ? r.data as LibraryFile[] : []), () => [])
    : [];
  const images: { src: string; alt: string }[] = [];
  let missing = false;
  for (const img of entry.images) {
    const file = files.find((f) => f.id === img.file);
    const signed = file ? await supabase.storage.from(LIBRARY_BUCKET).createSignedUrl(file.path, SIGNED_SECONDS).then((r) => r, () => null) : null;
    const src = signed && !signed.error ? signed.data?.signedUrl : undefined;
    if (src) images.push({ src, alt: img.alt }); else missing = true;
  }

  let project: { href: string; title: string } | null = null;
  if (entry.case_study) {
    const title = caseStudyTitle(entry.case_study);
    if (title) project = { href: `/projects/${entry.case_study}`, title };
  } else if (entry.project_id) {
    const live = await supabase.from("showcases").select("slug, title").eq("project_id", entry.project_id).limit(1).then((r) => r, () => null);
    const s = live && !live.error && Array.isArray(live.data) ? live.data[0] as { slug: string; title: string } | undefined : undefined;
    if (s) project = { href: `/projects/${s.slug}`, title: s.title };
  }

  return (
    <>
      <p role="status" className="sticky top-0 z-50 bg-[#061527] px-4 py-2 text-center text-sm text-white">
        Preview of the saved journal entry (version {entry.version}). Not public until you publish.
        {entry.project_id && !project ? " The linked project isn't public, so it isn't named." : ""}
      </p>
      {missing && <p role="alert" className="bg-[#7a1d1d] px-4 py-2 text-center text-sm text-white">An image couldn&apos;t be loaded from your library. Remove it or choose another.</p>}
      <ProjectsFrame preview journal>
        <JournalView preview entry={{ title: entry.title || "Untitled entry", summary: entry.summary, body: entry.body, entry_date: entry.entry_date, images, project }} />
      </ProjectsFrame>
    </>
  );
}
