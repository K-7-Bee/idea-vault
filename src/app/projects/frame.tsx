import Link from "next/link";
import { portfolioFonts } from "../portfolio/fonts";

// In the preview, navigation is inert text so the owner can't wander off the preview.
function FrameLink({ href, className, preview, children }: { href: string; className?: string; preview: boolean; children: React.ReactNode }) {
  return preview ? <span className={className}>{children}</span> : <Link href={href} className={className}>{children}</Link>;
}

// The public projects header and footer. Shared with the Vault's showcase preview so the preview
// looks exactly like the public page.
// Phase 4D: the Journal pages use this frame too, with a Journal link (journal).
export default function ProjectsFrame({ children, preview = false, journal = false }: { children: React.ReactNode; preview?: boolean; journal?: boolean }) {
  return (
    <div className={`${portfolioFonts} portfolio pf-sky font-body min-h-screen text-pf-ink`}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-pf-line px-6 py-6">
        <FrameLink href="/" preview={preview} className="font-nav text-lg font-extrabold tracking-tight">K <span className="text-pf-muted">/</span> Engineering</FrameLink>
        <nav aria-label="Project navigation" className="font-nav flex flex-wrap gap-5 text-sm font-semibold">
          <FrameLink href="/projects" preview={preview}>All projects</FrameLink>
          {journal && <FrameLink href="/journal" preview={preview}>Journal</FrameLink>}
          <FrameLink href="/#experience" preview={preview}>Experience</FrameLink>
          <FrameLink href="/#contact" preview={preview}>Contact</FrameLink>
        </nav>
      </header>
      {children}
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-pf-line px-6 py-8 text-sm text-pf-muted">
        <span>MD Kaushik Kamal · Learning by building.</span>
        <FrameLink href="/" preview={preview}>Back to portfolio →</FrameLink>
      </footer>
    </div>
  );
}
