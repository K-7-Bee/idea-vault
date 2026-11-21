import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listEntries } from "@/lib/journal-public";

// Phase 4D: published journal entries, newest first, read on every request (see journal-public.ts).
// With nothing published the Journal doesn't exist: the not-found page with noindex (a soft 404,
// as for unknown project addresses).
export async function generateMetadata(): Promise<Metadata> {
  const entries = await listEntries();
  if (!entries?.length) return { title: "Journal", robots: { index: false, follow: false } };
  return { title: "Journal", description: "Short engineering notes and lessons from my projects." };
}

export default function JournalPage() {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="mx-auto min-h-[60vh] max-w-3xl px-6 py-12 sm:py-20" />}>
      <JournalList />
    </Suspense>
  );
}

async function JournalList() {
  const entries = await listEntries();
  if (entries === undefined) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <h1 className="font-nav text-3xl font-extrabold">The journal couldn&apos;t be loaded</h1>
        <p className="mt-4 text-pf-muted">Please try again in a moment.</p>
      </main>
    );
  }
  if (!entries.length) notFound();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">Journal</p>
      <h1 className="font-nav mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Notes from the bench</h1>
      <p className="mt-4 max-w-xl text-pf-muted">Short engineering notes and lessons from my projects.</p>
      <ol className="mt-10 grid gap-4" aria-label="Journal entries">
        {entries.map((e) => (
          <li key={e.slug} className="pf-card p-6">
            {e.entry_date && <p className="font-nav text-xs font-semibold uppercase tracking-[0.18em] text-pf-teal">{e.entry_date}</p>}
            <h2 className="font-nav mt-2 text-xl font-extrabold"><Link href={`/journal/${e.slug}`} className="underline-offset-4 hover:underline">{e.title}</Link></h2>
            {e.summary && <p className="mt-2 text-pf-muted">{e.summary}</p>}
            {e.project_title && <p className="mt-3 text-sm">Part of <span className="font-semibold">{e.project_title}</span></p>}
          </li>
        ))}
      </ol>
    </main>
  );
}
