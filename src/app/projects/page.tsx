import type { Metadata } from "next";
import Link from "next/link";
import { projects } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Engineering and web projects by MD Kaushik Kamal: waste-to-energy lighting, Cha Restaurant, and Idea Vault.",
  openGraph: { title: "Projects · MD Kaushik Kamal", description: "Explore waste-to-energy lighting, Cha Restaurant, and Idea Vault.", type: "website" },
  twitter: { card: "summary", title: "Projects · MD Kaushik Kamal", description: "Engineering projects and practical web tools." },
};

export default function ProjectsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
      <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">Selected work</p>
      <h1 className="font-nav mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">From curiosity to a project.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pf-muted">Electrical engineering, practical websites, and personal tools. Explore the ideas behind each project and what is documented so far.</p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <li key={project.slug}>
            <Link href={`/projects/${project.slug}`} className="pf-card block h-full p-6 transition hover:-translate-y-1 hover:shadow-xl sm:p-8">
              <p className="text-sm text-pf-teal">{project.category}</p>
              <h2 className="mt-4 text-2xl font-semibold">{project.title}</h2>
              <p className="mt-3 leading-relaxed text-pf-muted">{project.summary}</p>
              <p className="mt-6 text-sm font-semibold text-pf-blue">Explore project →</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
