import Link from "next/link";
import { portfolioFonts } from "../portfolio/fonts";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${portfolioFonts} portfolio font-body min-h-screen bg-pf-bg text-pf-ink`}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-pf-line px-6 py-6">
        <Link href="/" className="font-script text-3xl">Kaushik</Link>
        <nav aria-label="Project navigation" className="flex flex-wrap gap-5 text-sm">
          <Link href="/projects">All projects</Link>
          <Link href="/#lab">Engineering lab</Link>
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
