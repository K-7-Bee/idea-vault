import LogoutButton from "./logout-button";
import { SparkIcon } from "./icons";
import { Suspense } from "react";
import NavLinks, { NavList } from "./nav-links";

// From the final master prompt's private navigation. None of these modules exist yet, so they are
// shown as planned rather than as links that lead nowhere.
const PLANNED = [
  "Engineering Lab",
  "Story Studio",
  "Project Library",
  "Portfolio Manager",
  "Learning / Career",
  "Integrations",
  "Settings",
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm shadow-accent/30">
        <SparkIcon />
      </span>
      <div>
        <h1 className="text-lg font-extrabold uppercase leading-none tracking-tight">Idea Vault 3.0</h1>
        <p className="mt-1 text-xs text-muted">Private workspace</p>
      </div>
    </div>
  );
}

export function VaultTopBar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-4 sm:px-6 xl:hidden">
      <Brand />
      <nav aria-label="Workspace" className="flex items-center gap-1 text-sm font-medium">
        <Suspense fallback={<NavList variant="bar" pathname="" />}><NavLinks variant="bar" /></Suspense>
      </nav>
      <LogoutButton />
    </header>
  );
}

export default function VaultSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-card/60 px-4 py-6 backdrop-blur xl:flex">
      <div className="px-2"><Brand /></div>
      <nav aria-label="Workspace" className="mt-8">
        <Suspense fallback={<NavList variant="sidebar" pathname="" />}><NavLinks variant="sidebar" /></Suspense>
        <h2 className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-muted">Planned modules</h2>
        <ul className="space-y-1 text-sm">
          {PLANNED.map((label) => (
            <li key={label} className="flex items-center justify-between rounded-xl px-3 py-2 text-muted">
              <span>{label}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] uppercase tracking-wide">Planned</span>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Kaushik</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--status-done)]" /> Workspace owner
          </p>
        </div>
        <div className="shrink-0 [&_button]:whitespace-nowrap">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
