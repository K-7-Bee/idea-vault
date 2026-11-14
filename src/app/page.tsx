import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Companion from "./portfolio/companion";
import Hero from "./portfolio/hero";
import MotorExplorer from "./portfolio/motor-explorer";
import OhmLab from "./portfolio/ohm-lab";
import { portfolioFonts } from "./portfolio/fonts";
import { projects } from "@/lib/projects";

// Match the phone's browser bar to the slate page.
export const viewport: Viewport = { themeColor: "#31363f" };

export const metadata: Metadata = {
  title: { absolute: "MD Kaushik Kamal — Portfolio" },
  description:
    "MD Kaushik Kamal, engineering science student at Jeonbuk National University with a background in electrical technology. Explore engineering projects, web tools, and interactive experiments.",
};

const NAME = "MD Kaushik Kamal";
const EMAIL = "koushikkamal6@gmail.com";

const NAV = [
  { label: "About", href: "#about" },
  { label: "Work", href: "#work" },
  { label: "Lab", href: "#lab" },
  { label: "Journey", href: "#journey" },
  { label: "Contact", href: "#contact" },
];

const LINKS = [
  { label: "GitHub", href: "https://github.com/K-7-Bee" },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/md-kaushik-kamal-aa324a263",
  },
  { label: "Instagram", href: "https://www.instagram.com/kau_sh_ik_46" },
  { label: "Facebook", href: "https://www.facebook.com/share/19fzqecV1B/" },
];

type Entry = { place: string; detail: string; where: string; when?: string };

const EDUCATION: Entry[] = [
  {
    place: "Jeonbuk National University",
    detail: "Bachelor · Engineering Science",
    where: "South Korea",
    when: "In progress · expected 2028",
  },
  {
    place: "CCN Polytechnic Institute",
    detail: "Diploma · Electrical Technology",
    where: "Bangladesh",
    when: "Completed 2023",
  },
];

const EXPERIENCE: Entry[] = [
  {
    place: "Altech Aluminum",
    detail: "Internship",
    where: "Bangladesh",
    when: "2022",
  },
  {
    place: "Transformer factory",
    detail: "Internship",
    where: "Bangladesh",
    when: "2020",
  },
  {
    place: "Innovation Fair · First prize",
    detail: "Renewable energy from waste, with an automatic lighting system",
    where: "CCN Polytechnic Institute, Bangladesh",
  },
];

const label = "font-nav text-xs font-semibold uppercase tracking-[0.25em]";
const card = "rounded-[28px] border border-pf-line bg-pf-glass p-5 sm:p-7";

function Timeline({ title, items }: { title: string; items: Entry[] }) {
  return (
    <div>
      <h3 className={`${label} text-pf-blue`}>{title}</h3>
      <ul className="mt-5 border-t border-pf-line">
        {items.map((i) => (
          <li key={i.place} className="border-b border-pf-line py-5">
            <p className="text-xl font-semibold">{i.place}</p>
            <p className="mt-1 text-pf-muted">{i.detail}</p>
            <p className={`${label} mt-2 text-[0.65rem] text-pf-teal`}>
              {[i.when, i.where].filter(Boolean).join(" // ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <div
      className={`${portfolioFonts} portfolio font-body relative min-h-screen overflow-x-clip bg-pf-bg text-pf-ink`}
    >
      <div className="pf-grain" aria-hidden />

      <Hero name={NAME} links={NAV} />

      <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto max-w-6xl px-6">
        {/* About */}
        <section id="about" className="grid gap-8 border-t border-pf-line py-20 md:grid-cols-[1fr_2fr]">
          <h2 className={`${label} text-pf-teal`}>About</h2>
          <div className="max-w-2xl space-y-5 text-lg leading-relaxed">
            <p className="font-script text-4xl leading-snug sm:text-5xl">
              I build what I&apos;m learning.
            </p>
            <p className="text-pf-muted">
              I&apos;m an engineering science student at Jeonbuk National University in South
              Korea, with a diploma in electrical technology from CCN Polytechnic Institute in
              Bangladesh. I explore what I&apos;m learning through circuits, simulations, and
              practical web tools.
            </p>
          </div>
        </section>

        {/* Work */}
        <section id="work" className="border-t border-pf-line py-20">
          <h2 className={`${label} text-pf-teal`}>Selected work</h2>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-2xl leading-relaxed text-pf-muted">Explore the idea, the implementation, and what is documented so far.</p>
            <Link href="/projects" className="text-sm font-semibold text-pf-blue">All projects →</Link>
          </div>
          <ul className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.slug}>
                <Link href={`/projects/${project.slug}`} className={`${card} flex h-full flex-col transition hover:-translate-y-1 hover:border-pf-blue`}>
                  <p className={`${label} text-[0.65rem] text-pf-teal`}>{project.category}</p>
                  <h3 className="mt-4 text-2xl font-semibold leading-tight">{project.title}</h3>
                  <p className="mb-6 mt-3 leading-relaxed text-pf-muted">{project.summary}</p>
                  <p className="mt-auto text-sm font-semibold text-pf-blue">Explore project →</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Lab */}
        <section id="lab" className="border-t border-pf-line py-20">
          <h2 className={`${label} text-pf-teal`}>Lab</h2>
          <p className="font-script mt-6 text-4xl sm:text-5xl">Play with the engineering.</p>
          <p className="mt-4 max-w-2xl text-pf-muted">
            Two small experiments from what I&apos;ve studied: turn a motor over in 3D, and push a
            circuit around to see Ohm&apos;s law at work.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article id="motor-explorer" tabIndex={-1} className={`${card} min-w-0`}>
              <p className={`${label} text-[0.65rem] text-pf-blue`}>01 // Mechanical</p>
              <h3 className="font-script mt-3 text-4xl">Motor explorer</h3>
              <p className="mb-6 mt-2 text-pf-muted">Drag to turn it, scroll or pinch to zoom, or choose a part below.</p>
              <MotorExplorer />
            </article>
            <article id="ohm-lab" tabIndex={-1} className={`${card} min-w-0`}>
              <p className={`${label} text-[0.65rem] text-pf-blue`}>02 // Electrical</p>
              <h3 className="font-script mt-3 text-4xl">Ohm&apos;s law lab</h3>
              <p className="mb-6 mt-2 text-pf-muted">A battery and one resistor. Move the sliders.</p>
              <OhmLab />
            </article>
          </div>
        </section>

        {/* Journey */}
        <section id="journey" className="border-t border-pf-line py-20">
          <h2 className={`${label} text-pf-teal`}>Journey</h2>
          <div className="mt-10 grid gap-12 md:grid-cols-2">
            <Timeline title="Education" items={EDUCATION} />
            <Timeline title="Experience" items={EXPERIENCE} />
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="relative border-t border-pf-line py-24">
          <h2 className={`${label} text-pf-teal`}>Contact</h2>
          <p className="font-script mt-6 max-w-3xl text-5xl leading-tight sm:text-7xl">
            Let&apos;s build something.
          </p>
          <a
            href={`mailto:${EMAIL}`}
            className="mt-8 inline-block break-all border-b border-pf-blue pb-1 text-lg transition-colors hover:text-pf-blue"
          >
            {EMAIL}
          </a>
          <ul className={`${label} mt-10 flex flex-wrap gap-x-8 gap-y-3`}>
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-opacity hover:opacity-60"
                >
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Companion email={EMAIL} links={LINKS} />

      <footer
        className={`${label} relative z-10 mx-auto flex max-w-6xl max-sm:pb-40 items-center justify-between border-t border-pf-line px-6 py-6 text-[0.65rem] text-pf-muted`}
      >
        <span>© {NAME}</span>
        <Link href="/login" className="transition-opacity hover:opacity-60">
          Vault login
        </Link>
      </footer>
    </div>
  );
}
