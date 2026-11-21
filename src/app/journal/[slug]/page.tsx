import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntry } from "@/lib/journal-public";
import { publicFileUrl } from "@/lib/profile-public";
import JournalView from "../journal-view";

type Props = { params: Promise<{ slug: string }> };

// Phase 4D: one published entry, read on every request, so unpublishing (or the linked project
// leaving the public site) shows on the very next request. Unknown addresses are a soft 404.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await getEntry((await params).slug);
  if (!entry) return { title: "Entry not found", robots: { index: false, follow: false } };
  const description = entry.summary || entry.body.slice(0, 160);
  return {
    title: entry.title,
    description,
    openGraph: { title: `${entry.title} · MD Kaushik Kamal`, description, type: "article" },
    twitter: { card: "summary", title: entry.title, description },
  };
}

export default function JournalEntryPage({ params }: Props) {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="mx-auto min-h-[60vh] max-w-3xl px-6 py-12 sm:py-20" />}>
      {params.then(({ slug }) => <Entry slug={slug} />)}
    </Suspense>
  );
}

async function Entry({ slug }: { slug: string }) {
  const entry = await getEntry(slug);
  if (entry === null) notFound();
  if (entry === undefined) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <Link href="/journal" className="text-sm text-pf-blue">← Journal</Link>
        <h1 className="font-nav mt-10 text-3xl font-extrabold">This entry couldn&apos;t be loaded</h1>
        <p className="mt-4 text-pf-muted">Please try again in a moment.</p>
      </main>
    );
  }
  const images = entry.images.flatMap((i) => { const src = publicFileUrl(i.file); return src ? [{ src, alt: i.alt }] : []; });
  return (
    <JournalView entry={{
      title: entry.title, summary: entry.summary, body: entry.body, entry_date: entry.entry_date, images,
      project: entry.project_slug && entry.project_title ? { href: `/projects/${entry.project_slug}`, title: entry.project_title } : null,
    }} />
  );
}
