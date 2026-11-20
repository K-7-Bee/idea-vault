import Link from "next/link";
import type { ShowcaseContent } from "@/lib/showcase";

// One published project, as visitors see it (Phase 4A). The Vault preview renders this same
// component from the saved draft, so the preview matches the public page.
export default function ShowcaseView({ content, preview = false }: { content: ShowcaseContent; preview?: boolean }) {
  const [cover, ...gallery] = content.images;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      {preview ? <span className="text-sm text-pf-muted">← All projects</span> : <Link href="/projects" className="text-sm text-pf-blue">← All projects</Link>}
      <article className="mt-10">
        <header className="max-w-3xl">
          {content.category && <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">{content.category}</p>}
          <h1 className="font-nav mt-5 break-words text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{content.title}</h1>
          <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-pf-muted">{content.summary}</p>
          {content.technologies.length > 0 && (
            <ul aria-label="Project topics and technologies" className="mt-6 flex flex-wrap gap-2">
              {content.technologies.map((tech) => <li key={tech} className="rounded-full border border-pf-line px-3 py-1.5 text-sm">{tech}</li>)}
            </ul>
          )}
        </header>
        {cover && (
          <figure className="mt-12 overflow-hidden rounded-3xl border border-pf-line bg-pf-glass">
            {/* Plain img: the public copies live in Supabase Storage, not in the Next image pipeline. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.src} alt={cover.alt} className="max-h-[32rem] w-full object-contain" decoding="async" />
          </figure>
        )}
        {content.sections.length > 0 && (
          <div className="mt-12 max-w-3xl space-y-10">
            {content.sections.map((section) => (
              <section key={section.key}>
                <h2 className="text-2xl font-semibold">{section.label}</h2>
                <p className="mt-4 whitespace-pre-line break-words leading-relaxed text-pf-muted">{section.body}</p>
              </section>
            ))}
          </div>
        )}
        {gallery.length > 0 && (
          <section aria-labelledby="gallery-heading" className="mt-12">
            <h2 id="gallery-heading" className="text-2xl font-semibold">Gallery</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((img) => (
                <li key={img.src} className="overflow-hidden rounded-2xl border border-pf-line bg-pf-glass">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                </li>
              ))}
            </ul>
          </section>
        )}
        {content.links.length > 0 && (
          <section aria-labelledby="links-heading" className="mt-12">
            <h2 id="links-heading" className="text-2xl font-semibold">Links</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {content.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-pf-blue px-5 py-2 text-sm text-pf-blue">
                    {link.label} ↗<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
