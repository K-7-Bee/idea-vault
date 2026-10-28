"use client";

import { useState } from "react";

// The nav links for small screens: a button that opens a full-width panel under the header.
export default function MobileMenu({ links }: { links: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-pf-line bg-pf-glass"
      >
        <span className="relative block h-3 w-5" aria-hidden>
          <span
            className={`absolute left-0 h-px w-5 bg-pf-ink transition-all ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 h-px w-5 bg-pf-ink transition-opacity ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`absolute left-0 h-px w-5 bg-pf-ink transition-all ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {open && (
        <nav
          id="mobile-menu"
          className="absolute inset-x-4 top-full z-20 rounded-[28px] border border-pf-line bg-pf-bg/95 px-6 py-2 backdrop-blur"
        >
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href} className="border-b border-pf-line last:border-b-0">
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="font-nav block py-4 text-sm font-semibold uppercase tracking-[0.25em]"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
