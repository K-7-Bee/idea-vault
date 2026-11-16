"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "Dashboard", href: "/vault", match: (p: string) => p === "/vault" },
  { label: "Ideas", href: "/vault#ideas", match: (p: string) => p.startsWith("/vault/ideas") },
  { label: "Projects", href: "/vault/projects", match: (p: string) => p.startsWith("/vault/projects") },
  { label: "Engineering Lab", href: "/vault/lab", match: (p: string) => p.startsWith("/vault/lab") },
  { label: "Story Studio", href: "/vault/story", match: (p: string) => p.startsWith("/vault/story") },
  { label: "Archive", href: "/vault/archive", match: (p: string) => p.startsWith("/vault/archive") },
];

type Variant = "sidebar" | "bar";

// The current path is only known at request time on dynamic routes, so the shell renders
// <NavList pathname="" /> as a Suspense fallback and this fills in the highlight.
export default function NavLinks({ variant }: { variant: Variant }) {
  return <NavList variant={variant} pathname={usePathname() ?? ""} />;
}

export function NavList({ variant, pathname }: { variant: Variant; pathname: string }) {
  if (variant === "bar") {
    return (
      <>
        {LINKS.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 ${active ? "bg-card text-foreground" : "text-muted hover:bg-card hover:text-foreground"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </>
    );
  }
  return (
    <ul className="space-y-1 text-sm font-medium">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 transition ${
                active ? "bg-accent text-on-accent shadow-sm shadow-accent/30" : "text-foreground hover:bg-accent-soft"
              }`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
