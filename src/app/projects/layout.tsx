import Link from "next/link";
import { portfolioFonts } from "../portfolio/fonts";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${portfolioFonts} portfolio pf-sky font-body min-h-screen text-pf-ink`}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-pf-line px-6 py-6">
        <Link href="/" className="font-nav text-lg font-extrabold tracking-tight">K <span className="text-pf-muted">/</span> Engineering</Link>
        <nav aria-label="Project navigation" className="font-nav flex flex-wrap gap-5 text-sm font-semibold">
          <Link href="/projects">All projects</Link>
          <Link href="/#experience">Experience</Link>
          <Link href="/#contact">Contact</Link>
        </nav>
      </header>
      {children}
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-pf-line px-6 py-8 text-sm text-pf-muted">
        <span>MD Kaushik Kamal · Learning by building.</span>
        <Link href="/">Back to portfolio →</Link>
      </footer>
    </div>
  );
}
