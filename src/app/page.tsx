import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import MobileMenu from "./portfolio/mobile-menu";
import { portfolioFonts } from "./portfolio/fonts";
import heroBg from "./portfolio/hero-bg.png";
import { projects } from "@/lib/projects";

// Match the phone's browser bar to the sky at the top of the hero.
export const viewport: Viewport = { themeColor: "#1b4fb8" };

export const metadata: Metadata = {
  title: { absolute: "MD Kaushik Kamal — Portfolio" },
  description:
    "MD Kaushik Kamal, engineering science student at Jeonbuk National University with a diploma in electrical technology. Selected engineering and web projects, education and experience.",
};

const NAME = "MD Kaushik Kamal";
const EMAIL = "koushikkamal6@gmail.com";

// Journal is part of the planned navigation; it stays hidden until a real entry is published.
const NAV = [
  { label: "Home", href: "#top" },
  { label: "About", href: "#about" },
  { label: "Experience", href: "#experience" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

const LINKS = [
  { label: "GitHub", href: "https://github.com/K-7-Bee" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/md-kaushik-kamal-aa324a263" },
  { label: "Instagram", href: "https://www.instagram.com/kau_sh_ik_46" },
  { label: "Facebook", href: "https://www.facebook.com/share/19fzqecV1B/" },
];

// Only details already verified on the published portfolio. Dates and roles that have not been
// supplied are left out rather than guessed.
const HIGHLIGHTS = [
  { icon: "cap", title: "Bachelor (in progress)", detail: "Jeonbuk National University" },
  { icon: "case", title: "2 internships", detail: "Real-world experience" },
  { icon: "award", title: "First prize", detail: "Innovation fair" },
  { icon: "chip", title: "Electrical technology", detail: "Diploma, completed 2023" },
] as const;

type Entry = { when: string; title: string; detail: string; where: string; kind: "edu" | "work" | "award" };

const TIMELINE: Entry[] = [
  { when: "Expected 2028", title: "Bachelor · Engineering Science", detail: "Jeonbuk National University", where: "South Korea", kind: "edu" },
  { when: "2023", title: "Diploma · Electrical Technology", detail: "CCN Polytechnic Institute", where: "Bangladesh", kind: "edu" },
  { when: "2022", title: "Internship", detail: "Altech Aluminum", where: "Bangladesh", kind: "work" },
  { when: "2020", title: "Internship", detail: "Transformer factory", where: "Bangladesh", kind: "work" },
  { when: "Innovation fair", title: "First prize", detail: "Renewable energy from waste, with an automatic lighting system", where: "CCN Polytechnic Institute", kind: "award" },
];

const FOCUS = [
  "Engineering science coursework",
  "Circuits and electrical systems",
  "Practical web tools",
  "Documenting projects as I build them",
];

const DOT: Record<Entry["kind"], string> = {
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

export default function Home() {
  return (
    <div id="top" className={`${portfolioFonts} portfolio font-body relative min-h-screen overflow-x-clip bg-pf-bg text-pf-ink`}>
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
              {NAV.map((l) => (
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
            <MobileMenu links={NAV} />
          </div>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-14 pt-6 sm:px-8">
          <div className="pf-bracket max-w-xl px-6 py-7 sm:px-8">
            <p className={`${eyebrow} text-white/85`}>Engineering science · Electrical technology · Web</p>
            <h1 className="font-nav mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="pf-title-gradient">Curiosity meets</span>
              <br />
              engineering.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">
              I&apos;m {NAME}, an engineering science student at Jeonbuk National University
              exploring circuits, electrical systems and practical software through real projects.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#projects" className="font-nav inline-flex items-center gap-2 rounded-full bg-pf-aqua px-6 py-3 text-sm font-bold text-[#06283d] shadow-lg shadow-black/20 transition hover:brightness-105">
                View projects <Icon name="arrow" className="h-4 w-4" />
              </a>
              <a href="#about" className="font-nav inline-flex items-center rounded-full border border-white/70 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20">
                About me
              </a>
            </div>
          </div>
        </div>

        <ul className="relative z-10 grid grid-cols-2 gap-px border-t border-white/15 bg-[#0a2a5c]/55 backdrop-blur-md lg:grid-cols-4">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} className="flex items-center gap-3 px-5 py-4 sm:px-8">
              <Icon name={h.icon} className="h-7 w-7 shrink-0 text-pf-aqua" />
              <div className="min-w-0">
                <p className="font-nav text-sm font-bold leading-tight">{h.title}</p>
                <p className="text-xs text-white/75">{h.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <main id="main-content" tabIndex={-1} className="pf-sky relative">
        {/* About */}
        <section id="about" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-8 md:grid-cols-[1fr_1.6fr] md:items-center">
          <div>
            <p className={`${eyebrow} text-pf-blue`}>About</p>
            <h2 className="font-nav mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">I build what I&apos;m learning.</h2>
          </div>
          <div className="pf-card space-y-4 p-6 text-lg leading-relaxed text-pf-muted sm:p-8">
            <p>
              I&apos;m an engineering science student at Jeonbuk National University in South Korea,
              with a diploma in electrical technology from CCN Polytechnic Institute in Bangladesh.
            </p>
            <p>
              I explore what I&apos;m learning through circuits, practical web tools and documented
              projects, from a prize-winning waste-to-energy lighting system to software I use every day.
            </p>
          </div>
        </section>

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
        <section id="experience" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <p className={`${eyebrow} text-pf-blue`}>Experience</p>
          <h2 className="font-nav mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Experience &amp; education</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <ol className="pf-card p-6 sm:p-8">
              {TIMELINE.map((e, i) => (
                <li key={e.title + e.detail} className="relative grid grid-cols-[1.25rem_1fr] gap-x-4 pb-7 last:pb-0 sm:grid-cols-[1.25rem_8rem_1fr]">
                  {i < TIMELINE.length - 1 && <span aria-hidden className="absolute left-[0.55rem] top-5 h-full w-px bg-pf-line" />}
                  <span aria-hidden className={`relative mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${DOT[e.kind]}`} />
                  <p className="font-nav text-sm font-bold text-pf-ink max-sm:col-start-2">{e.when}</p>
                  <div className="max-sm:col-start-2">
                    <p className="font-nav font-bold">{e.title}</p>
                    <p className="text-pf-muted">{e.detail}</p>
                    <p className="mt-0.5 text-sm text-pf-muted">{e.where}</p>
                  </div>
                </li>
              ))}
            </ol>
            <aside className="pf-card p-6 sm:p-8">
              <h3 className="font-nav flex items-center gap-2 text-lg font-extrabold">
                <Icon name="chip" className="h-5 w-5 text-pf-blue" /> Current focus
              </h3>
              <ul className="mt-5 space-y-3">
                {FOCUS.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-pf-muted">
                    <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-pf-teal" /> {f}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8">
          <div className="pf-contact overflow-hidden rounded-[28px] p-8 text-white sm:p-12">
            <p className={`${eyebrow} text-pf-aqua`}>Contact</p>
            <h2 className="font-nav mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">Let&apos;s build something.</h2>
            <p className="mt-4 max-w-xl text-white/85">Open to engineering internship conversations and project collaboration.</p>
            <a href={`mailto:${EMAIL}`} className="font-nav mt-8 inline-flex max-w-full items-center gap-3 break-all rounded-full bg-white px-6 py-3 font-bold text-[#0a2540] transition hover:bg-pf-aqua">
              <Icon name="mail" className="h-5 w-5 shrink-0" /> {EMAIL}
            </a>
            <ul className="font-nav mt-8 flex flex-wrap gap-3 text-sm font-semibold">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-white/40 px-4 py-2 transition hover:bg-white/15">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="font-nav mx-auto flex max-w-7xl items-center justify-between border-t border-pf-line px-5 py-6 text-xs font-semibold text-pf-muted sm:px-8">
        <span>© {NAME}</span>
        <Link href="/login" className="transition-colors hover:text-pf-ink">Vault login</Link>
      </footer>
    </div>
  );
}
