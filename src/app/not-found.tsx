import type { Metadata } from "next";
import Link from "next/link";
import ProjectsFrame from "./projects/frame";

// Phase 6D: the site's own 404 page (it replaces Next's built-in one, which had no main landmark,
// so "Skip to main content" led nowhere). Status codes are unchanged; Next adds noindex itself.
export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <ProjectsFrame>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">404</p>
        <h1 className="font-nav mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">Page not found</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pf-muted">
          This address doesn&apos;t lead to anything here. It may have moved, or it may not be published yet.
        </p>
        <div className="font-nav mt-10 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/" className="rounded-full bg-pf-deep px-5 py-3 text-white transition hover:brightness-110">Go to the homepage</Link>
          <Link href="/projects" className="rounded-full border border-pf-line px-5 py-3 text-pf-ink transition hover:border-pf-blue">See all projects</Link>
        </div>
      </main>
    </ProjectsFrame>
  );
}
