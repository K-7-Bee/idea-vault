import Link from "next/link";
import { paragraphs } from "@/lib/journal";

// Phase 4D: one journal entry, as visitors see it. The Vault preview renders the saved draft with
// this same component (images through private signed links, links inert).
export type JournalViewContent = {
  title: string;
  summary: string;
  body: string;
  entry_date: string;
  images: { src: string; alt: string }[];
  project: { href: string; title: string } | null;
};

export default function JournalView({ entry, preview = false }: { entry: JournalViewContent; preview?: boolean }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      {preview ? <span className="text-sm text-pf-blue">← Journal</span> : <Link href="/journal" className="text-sm text-pf-blue">← Journal</Link>}
      <article className="mt-10">
        <header>
          {entry.entry_date && <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">{entry.entry_date}</p>}
          <h1 className="font-nav mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{entry.title}</h1>
          {entry.summary && <p className="mt-5 text-lg leading-relaxed text-pf-muted">{entry.summary}</p>}
          {entry.project && (
            <p className="mt-5 text-sm">
              Part of{" "}
              {preview
                ? <span className="font-semibold text-pf-blue">{entry.project.title}</span>
                : <Link href={entry.project.href} className="font-semibold text-pf-blue underline-offset-4 hover:underline">{entry.project.title}</Link>}
            </p>
          )}
        </header>
        <div className="mt-10 space-y-5 text-lg leading-relaxed">
          {paragraphs(entry.body).map((p, k) => <p key={k} className="whitespace-pre-line">{p}</p>)}
        </div>
        {entry.images.length > 0 && (
          <ul aria-label="Images" className="mt-12 grid gap-6 sm:grid-cols-2">
            {entry.images.map((img) => (
              <li key={img.src} className="pf-card overflow-hidden">
                {/* Public copies re-encoded at publish (or private preview links), so next/image isn't used. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </article>
    </main>
  );
}
