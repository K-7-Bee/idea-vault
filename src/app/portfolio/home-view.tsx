import Image from "next/image";
import Link from "next/link";
import EmailLink from "./email-link";
import MobileMenu from "./mobile-menu";
import { portfolioFonts } from "./fonts";
import heroBg from "./hero-bg.png";
import { projects } from "@/lib/projects";
import type { EntryKind, ProfileContent, TimelineEntry } from "@/lib/profile";

// Phase 4B: the public homepage, drawn from profile content. The public page renders the published
// profile (or the seed before the first publish); the Vault preview renders the saved draft with
// this same component. Sections with nothing in them are left out, along with their menu link.

const DOT: Record<EntryKind, string> = {
  edu: "bg-pf-blue",
  work: "bg-pf-petal-deep",
  award: "bg-pf-teal",
};

// Each project gets a drawn cover instead of a stock photo; real photos come with published snapshots.
const COVER: Record<string, string> = {
  "Electrical engineering": "from-[#0b3a6e] via-[#1a659e] to-[#80ffe8]",
  "Web development": "from-[#5b3a8c] via-[#83bcff] to-[#eccbd9]",
  "Personal software": "from-[#0a2540] via-[#004e89] to-[#97d2fb]",
};

const eyebrow = "font-nav text-[0.7rem] font-bold uppercase tracking-[0.22em]";

function Icon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    cap: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /></>,
    case: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" /></>,
    award: <><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
    web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9V7M12 17v-2" /></>,
    check: <path d="M5 12l4 4 10-10" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}

const PROJECT_ICON: Record<string, string> = {
  "Electrical engineering": "bolt",
  "Web development": "web",
  "Personal software": "vault",
};

// Optional details on an entry (tools, responsibilities, outcomes); nothing is shown when empty.
function EntryDetails({ entry }: { entry: TimelineEntry }) {
  if (!entry.tools.length && !entry.responsibilities.length && !entry.outcomes.length) return null;
  return (
    <div className="mt-3 space-y-3 text-sm text-pf-muted">
      {entry.tools.length > 0 && (
        <ul aria-label="Tools" className="flex flex-wrap gap-2">
          {entry.tools.map((t) => <li key={t} className="rounded-full border border-pf-line px-2.5 py-0.5 text-xs font-semibold text-pf-ink">{t}</li>)}
        </ul>
      )}
      {entry.responsibilities.length > 0 && (
        <div>
          <p className="font-nav text-xs font-bold uppercase tracking-wider text-pf-ink">What I did</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{entry.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {entry.outcomes.length > 0 && (
        <div>
          <p className="font-nav text-xs font-bold uppercase tracking-wider text-pf-ink">What I learned</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{entry.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

const paragraphs = (value: string) => value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

// publishedAt marks which published version this page shows (it is public anyway), so the publish
// route can confirm the new version is live.
// Phase 4C: media gives the résumé link and photo address for this rendering (the public copies on
// the homepage, private signed links in the preview). Without it, neither is shown.
export type HomeMedia = { resumeHref?: string; photoSrc?: string };

export default function HomeView({ content: c, publishedAt, media = {} }: { content: ProfileContent; publishedAt?: string; media?: HomeMedia }) {
  const photo = media.photoSrc && c.photo.alt ? { src: media.photoSrc, alt: c.photo.alt } : null;
  const resumeHref = c.resume.file ? media.resumeHref : undefined;
  const hasAbout = Boolean(c.about.heading || c.about.paragraphs.length || photo);
  const hasExperience = Boolean(c.timeline.length || c.focus.length || c.certificates.length);
  const hasEmail = Boolean(c.contact.email.user && c.contact.email.domain);
  // Journal is part of the planned navigation; it stays hidden until a real entry is published.
  const nav = [
    { label: "Home", href: "#top" },
    ...(hasAbout ? [{ label: "About", href: "#about" }] : []),
    ...(hasExperience ? [{ label: "Experience", href: "#experience" }] : []),
    { label: "Projects", href: "#projects" },
    { label: "Contact", href: "#contact" },
  ];
  const intro = paragraphs(c.hero.intro);

  return (
    <div id="top" data-published={publishedAt || undefined} className={`${portfolioFonts} portfolio font-body relative min-h-screen overflow-x-clip bg-pf-bg text-pf-ink`}>
      {/* Hero */}
      <section aria-label="Introduction" className="relative isolate flex min-h-[640px] flex-col overflow-hidden text-white sm:min-h-[min(92svh,860px)]">
        <Image
          src={heroBg}
          alt=""
          fill
          preload
          placeholder="blur"
          sizes="100vw"
          className="-z-20 object-cover object-[72%_center]"
        />
        <div aria-hidden className="pf-scrim absolute inset-0 -z-10" />

        <header className="relative z-30 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href="#top" className="font-nav flex items-center gap-3 text-lg font-bold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/15 backdrop-blur">
              <Image src="/k-mark.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            </span>
            <span>K <span className="text-white/60">/</span> Engineering</span>
          </a>
          <nav aria-label="Sections" className="hidden xl:block">
            <ul className="font-nav flex items-center gap-8 text-sm font-semibold">
              {nav.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-white/85 transition-colors hover:text-white">{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-3">
            <a href="#contact" className="font-nav hidden rounded-full bg-pf-aqua px-5 py-2.5 text-sm font-bold text-[#06283d] shadow-lg shadow-black/15 transition hover:brightness-105 sm:inline-flex">
              Get in touch
            </a>
            <MobileMenu links={nav} />
          </div>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-14 pt-6 sm:px-8">
          <div className="pf-bracket max-w-xl px-6 py-7 sm:px-8">
            {c.hero.eyebrow && <p className={`${eyebrow} text-white/85`}>{c.hero.eyebrow}</p>}
            <h1 className="font-nav mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              {c.hero.accent && <span className="pf-title-gradient">{c.hero.accent}</span>}
              {c.hero.accent && c.hero.headline && <br />}
              {c.hero.headline}
            </h1>
            {intro.map((p) => (
              <p key={p} className="mt-5 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">{p}</p>
            ))}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#projects" className="font-nav inline-flex items-center gap-2 rounded-full bg-pf-aqua px-6 py-3 text-sm font-bold text-[#06283d] shadow-lg shadow-black/20 transition hover:brightness-105">
                View projects <Icon name="arrow" className="h-4 w-4" />
              </a>
              {hasAbout && (
                <a href="#about" className="font-nav inline-flex items-center rounded-full border border-white/70 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20">
                  About me
                </a>
              )}
              {resumeHref && (
                <a href={resumeHref} className="font-nav inline-flex items-center rounded-full border border-white/70 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20">
                  Résumé <span className="sr-only">(PDF)</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {c.highlights.length > 0 && (
          <ul className="relative z-10 grid grid-cols-2 gap-px border-t border-white/15 bg-[#0a2a5c]/55 backdrop-blur-md lg:grid-cols-4">
            {c.highlights.map((h) => (
              <li key={h.title + h.detail} className="flex items-center gap-3 px-5 py-4 sm:px-8">
                <Icon name={h.icon} className="h-7 w-7 shrink-0 text-pf-aqua" />
                <div className="min-w-0">
                  <p className="font-nav text-sm font-bold leading-tight">{h.title}</p>
                  {h.detail && <p className="text-xs text-white/75">{h.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <main id="main-content" tabIndex={-1} className="pf-sky relative">
        {/* About */}
        {hasAbout && (
          <section id="about" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-8 md:grid-cols-[1fr_1.6fr] md:items-center">
            <div>
              <p className={`${eyebrow} text-pf-blue`}>About</p>
              {c.about.heading && <h2 className="font-nav mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{c.about.heading}</h2>}
              {photo && (
                // A public copy re-encoded at publish (or a private preview link), so next/image isn't used.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async"
                  className="mt-6 aspect-[4/5] w-44 rounded-2xl object-cover shadow-lg shadow-black/10 sm:w-56" />
              )}
            </div>
            {c.about.paragraphs.length > 0 && (
              <div className="pf-card space-y-4 p-6 text-lg leading-relaxed text-pf-muted sm:p-8">
                {c.about.paragraphs.flatMap(paragraphs).map((p) => <p key={p}>{p}</p>)}
              </div>
            )}
          </section>
        )}

        {/* Projects */}
        <section id="projects" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={`${eyebrow} text-pf-blue`}>Projects</p>
              <h2 className="font-nav mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Selected work</h2>
            </div>
            <Link href="/projects" className="font-nav inline-flex items-center gap-2 text-sm font-bold text-pf-blue hover:underline">
              Explore all projects <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
          <ul className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.slug}>
                <Link href={`/projects/${project.slug}`} className="group pf-card flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-xl">
                  <div className={`relative flex h-40 items-end bg-gradient-to-br p-5 ${COVER[project.category] ?? COVER["Personal software"]}`}>
                    <Icon name={PROJECT_ICON[project.category] ?? "chip"} className="absolute right-5 top-5 h-14 w-14 text-white/35" />
                    <span className="font-nav rounded-full bg-white/90 px-3 py-1 text-[0.7rem] font-bold text-[#0a2540]">{project.category}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-nav text-xl font-extrabold leading-tight">{project.title}</h3>
                    <p className="mb-6 mt-2 leading-relaxed text-pf-muted">{project.summary}</p>
                    <span className="font-nav mt-auto inline-flex items-center gap-2 text-sm font-bold text-pf-blue">
                      Read the case study <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Experience & education */}
        {hasExperience && (
          <section id="experience" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <p className={`${eyebrow} text-pf-blue`}>Experience</p>
            <h2 className="font-nav mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Experience &amp; education</h2>
            <div className={`mt-8 grid gap-6 ${c.timeline.length ? "lg:grid-cols-[1.7fr_1fr]" : ""}`}>
              {c.timeline.length > 0 && (
                <ol className="pf-card p-6 sm:p-8">
                  {c.timeline.map((e, i) => (
                    <li key={`${i}-${e.title}-${e.detail}`} className="relative grid grid-cols-[1.25rem_1fr] gap-x-4 pb-7 last:pb-0 sm:grid-cols-[1.25rem_8rem_1fr]">
                      {i < c.timeline.length - 1 && <span aria-hidden className="absolute left-[0.55rem] top-5 h-full w-px bg-pf-line" />}
                      <span aria-hidden className={`relative mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${DOT[e.kind]}`} />
                      <p className="font-nav text-sm font-bold text-pf-ink max-sm:col-start-2">{e.when}</p>
                      <div className="max-sm:col-start-2">
                        <p className="font-nav font-bold">{e.title}</p>
                        {e.detail && <p className="text-pf-muted">{e.detail}</p>}
                        {e.where && <p className="mt-0.5 text-sm text-pf-muted">{e.where}</p>}
                        <EntryDetails entry={e} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {(c.focus.length > 0 || c.certificates.length > 0) && (
                <div className="grid content-start gap-6">
                  {c.focus.length > 0 && (
                    <aside className="pf-card p-6 sm:p-8">
                      <h3 className="font-nav flex items-center gap-2 text-lg font-extrabold">
                        <Icon name="chip" className="h-5 w-5 text-pf-blue" /> Current focus
                      </h3>
                      <ul className="mt-5 space-y-3">
                        {c.focus.map((f) => (
                          <li key={f} className="flex items-start gap-3 text-pf-muted">
                            <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-pf-teal" /> {f}
                          </li>
                        ))}
                      </ul>
                    </aside>
                  )}
                  {c.certificates.length > 0 && (
                    <aside className="pf-card p-6 sm:p-8">
                      <h3 className="font-nav flex items-center gap-2 text-lg font-extrabold">
                        <Icon name="award" className="h-5 w-5 text-pf-blue" /> Certificates
                      </h3>
                      <ul className="mt-5 space-y-4">
                        {c.certificates.map((x) => (
                          <li key={x.name + x.issuer} className="text-pf-muted">
                            <p className="font-nav font-bold text-pf-ink">
                              {x.href
                                ? <a href={x.href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{x.name} ↗</a>
                                : x.name}
                            </p>
                            {(x.issuer || x.when) && <p className="text-sm">{[x.issuer, x.when].filter(Boolean).join(" · ")}</p>}
                          </li>
                        ))}
                      </ul>
                    </aside>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Contact */}
        <section id="contact" className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8">
          <div className="pf-contact overflow-hidden rounded-[28px] p-8 text-white sm:p-12">
            <p className={`${eyebrow} text-pf-aqua`}>Contact</p>
            {c.contact.heading && <h2 className="font-nav mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">{c.contact.heading}</h2>}
            {paragraphs(c.contact.text).map((p) => <p key={p} className="mt-4 max-w-xl text-white/85">{p}</p>)}
            {hasEmail && (
              <EmailLink
                user={c.contact.email.user}
                domain={c.contact.email.domain}
                icon={<Icon name="mail" className="h-5 w-5 shrink-0" />}
                className="font-nav mt-8 inline-flex max-w-full items-center gap-3 break-all rounded-full bg-white px-6 py-3 font-bold text-[#0a2540] transition hover:bg-pf-aqua"
              />
            )}
            {resumeHref && (
              <p className="mt-6">
                <a href={resumeHref} className="font-nav inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-sm font-bold transition hover:bg-white/15">
                  Download my résumé <span className="sr-only">(PDF)</span>
                </a>
              </p>
            )}
            {c.links.length > 0 && (
              <ul className="font-nav mt-8 flex flex-wrap gap-3 text-sm font-semibold">
                {c.links.map((l) => (
                  <li key={l.label + l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-white/40 px-4 py-2 transition hover:bg-white/15">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="font-nav mx-auto flex max-w-7xl items-center justify-between border-t border-pf-line px-5 py-6 text-xs font-semibold text-pf-muted sm:px-8">
        <span>© {c.name}</span>
        <Link href="/login" className="transition-colors hover:text-pf-ink">Vault login</Link>
      </footer>
    </div>
  );
}
