// Settings for the browser start page at /start. Edit QUICK_LINKS to change the shortcuts.

export const SEARCH_URL = "https://www.google.com/search";

export type QuickLink = { label: string; href: string };

export const QUICK_LINKS: QuickLink[] = [
  { label: "Gmail", href: "https://mail.google.com" },
  { label: "YouTube", href: "https://www.youtube.com" },
  { label: "GitHub", href: "https://github.com/K-7-Bee" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/md-kaushik-kamal-aa324a263" },
  { label: "Idea Vault", href: "/vault" },
  { label: "Portfolio", href: "/" },
];

/** Greeting for a local hour (0–23). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

/** True when a search has nothing in it but spaces, so it isn't worth sending to Google. */
export function isBlankQuery(query: string): boolean {
  return query.trim() === "";
}
