import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, projects } from "@/lib/projects";
import { publishedContent } from "@/lib/showcase";
import { getShowcase, publicSupabaseUrl } from "@/lib/showcase-public";
import ShowcaseView from "../showcase-view";

type Props = { params: Promise<{ slug: string }> };

// The hand-written case studies are built ahead of time. Any other address is a project published
// from the Vault (Phase 4A), read from the public snapshot on every request and never cached, so it
// disappears as soon as it is unpublished. With Cache Components a request-time page starts with a
// 200 status, so an unpublished address shows the not-found page with a noindex tag (a "soft 404").
export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug;
  const project = getProject(slug);
  if (project) {
    return {
      title: project.title,
      description: project.summary,
      openGraph: { title: `${project.title} · MD Kaushik Kamal`, description: project.summary, type: "article" },
      twitter: { card: "summary", title: project.title, description: project.summary },
    };
  }
  const showcase = await getShowcase(slug);
  if (!showcase) return { title: "Project not found", robots: { index: false, follow: false } };
  return {
    title: showcase.title,
    description: showcase.summary,
    openGraph: { title: `${showcase.title} · MD Kaushik Kamal`, description: showcase.summary, type: "article" },
    twitter: { card: "summary", title: showcase.title, description: showcase.summary },
  };
}

export default function ProjectPage({ params }: Props) {
  return (
    <Suspense fallback={<main id="main-content" tabIndex={-1} className="mx-auto min-h-[60vh] max-w-6xl px-6 py-12 sm:py-20" />}>
      {params.then(({ slug }) => <ProjectBody slug={slug} />)}
    </Suspense>
  );
}

function ProjectBody({ slug }: { slug: string }) {
  const project = getProject(slug);
  if (!project) return <PublishedProject slug={slug} />;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <Link href="/projects" className="text-sm text-pf-blue">← All projects</Link>
      <article className="mt-10">
        <header className="max-w-3xl">
          <p className="font-nav text-xs font-semibold uppercase tracking-[0.2em] text-pf-teal">{project.category}</p>
          <h1 className="font-nav mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{project.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-pf-muted">{project.overview}</p>
          <ul aria-label="Project topics and technologies" className="mt-6 flex flex-wrap gap-2">
            {project.technologies.map((tech) => <li key={tech} className="rounded-full border border-pf-line px-3 py-1.5 text-sm">{tech}</li>)}
          </ul>
          {project.externalLink && <a href={project.externalLink.href} target="_blank" rel="noreferrer" className="mt-7 inline-flex min-h-11 items-center rounded-full border border-pf-blue px-5 py-2 text-sm text-pf-blue">{project.externalLink.label} ↗<span className="sr-only"> (opens in a new tab)</span></a>}
        </header>
        <section aria-labelledby="flow-heading" className="mt-12 pf-card p-6 sm:p-8">
          <h2 id="flow-heading" className="text-xl font-semibold">{project.slug === "idea-vault" ? "From capture to storage" : "The project at a glance"}</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {project.flow.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-pf-line bg-pf-glass p-5">
                <span aria-hidden="true" className="font-mono text-sm text-pf-blue">0{index + 1}{index < 2 ? " →" : ""}</span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-pf-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>
        <div className="mt-12 max-w-3xl space-y-10">
          {project.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-semibold">{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-4 leading-relaxed text-pf-muted">{paragraph}</p>)}
            </section>
          ))}
        </div>
      </article>
      <aside aria-label="Other projects" className="mt-14 border-t border-pf-line pt-8">
        <h2 className="text-xl font-semibold">Keep exploring</h2>
        <ul className="mt-4 flex flex-wrap gap-5">
          {projects.filter((p) => p.slug !== project.slug).map((p) => <li key={p.slug}><Link href={`/projects/${p.slug}`} className="text-pf-blue">{p.title} →</Link></li>)}
        </ul>
      </aside>
    </main>
  );
}

async function PublishedProject({ slug }: { slug: string }) {
  const showcase = await getShowcase(slug);
  if (showcase === null) notFound();
  if (showcase === undefined) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
        <Link href="/projects" className="text-sm text-pf-blue">← All projects</Link>
        <h1 className="font-nav mt-10 text-3xl font-extrabold">This project couldn&apos;t be loaded</h1>
        <p className="mt-4 text-pf-muted">Please try again in a moment.</p>
      </main>
    );
  }
  return <ShowcaseView content={publishedContent(showcase, publicSupabaseUrl())} />;
}
