import type { Metadata, Viewport } from "next";
import Clock from "./clock";
import { portfolioFonts } from "../portfolio/fonts";
import SearchForm from "./search-form";
import { QUICK_LINKS } from "@/lib/start-page";

// A personal browser start page: set https://<your-site>/start as Opera's startup page.

export const metadata: Metadata = {
  title: "Start",
  description: "Kaushik's browser start page with Google search and quick links.",
  robots: { index: false, follow: false },
  // Replace the portfolio's sharing details inherited from the root layout.
  openGraph: { title: "Start", description: "Kaushik's browser start page with Google search and quick links.", type: "website" },
  twitter: { card: "summary", title: "Start", description: "Kaushik's browser start page with Google search and quick links." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#31363f" },
  ],
};

export default function StartPage() {
  return (
    <div className={`${portfolioFonts} startpage font-body relative flex min-h-screen flex-col overflow-hidden`}>
      <div className="sp-glow" aria-hidden="true" />
      <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <h1 className="sr-only">Start page</h1>
        <Clock />

        <SearchForm />

        <nav aria-label="Quick links" className="mt-10 w-full">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="sp-tile flex items-center gap-2 rounded-2xl px-3 py-3 sm:gap-3 sm:px-4 text-sm font-medium">
                  <span aria-hidden="true" className="sp-initial grid h-8 w-8 shrink-0 place-items-center rounded-full font-nav text-sm font-bold">
                    {link.label[0]}
                  </span>
                  <span className="truncate">{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
