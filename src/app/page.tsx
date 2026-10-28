import type { Metadata, Viewport } from "next";
import { Galada, Inter, Manrope } from "next/font/google";
import Link from "next/link";
import Companion from "./portfolio/companion";
import Hero from "./portfolio/hero";
import MotorExplorer from "./portfolio/motor-explorer";
import OhmLab from "./portfolio/ohm-lab";

// A brush script for the big headlines, Manrope for navigation and labels, Inter for reading.
const script = Galada({ variable: "--font-galada", subsets: ["latin"], weight: "400" });
const navFont = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Match the phone's browser bar to the slate page.
export const viewport: Viewport = { themeColor: "#31363f" };

export const metadata: Metadata = {
  title: "MD Kaushik Kamal — Portfolio",
  description:
    "Engineering science student building things to learn. Projects, education and experience.",
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

const PROJECTS: {
  title: string;
  description: string;
  tech: string;
  href?: string;
  cta?: string;
  internal?: boolean;
}[] = [
  {
    title: "Waste-to-Energy Lighting",
    description:
      "First-prize project at the CCN Polytechnic Institute innovation fair: renewable energy generated from waste, paired with an automatic lighting system.",
    tech: "Renewable energy · Automatic lighting",
  },
  {
    title: "Cha Restaurant",
    description:
      "A website for a friend's tea restaurant, built and shipped live for a real business.",
    tech: "Web · Vercel",
    href: "https://cha-restaurant.vercel.app",
    cta: "Visit site",
  },
  {
    title: "Idea Vault",
    description:
      "A private, offline-capable app for capturing ideas with tags, photos, files and voice notes.",
    tech: "Next.js · Supabase · Tailwind · PWA",
    href: "/vault",
    cta: "Open vault",
    internal: true,
  },
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
const card = "rounded-[28px] border border-pf-line bg-pf-glass p-7";

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
      className={`${script.variable} ${navFont.variable} ${inter.variable} portfolio font-body relative min-h-screen overflow-x-clip bg-pf-bg text-pf-ink`}
    >
      <div className="pf-grain" aria-hidden />

      <Hero name={NAME} links={NAV} />

      <main className="relative z-10 mx-auto max-w-6xl px-6">
        {/* About */}
        <section id="about" className="grid gap-8 border-t border-pf-line py-20 md:grid-cols-[1fr_2fr]">
          <h2 className={`${label} text-pf-teal`}>About</h2>
          <div className="max-w-2xl space-y-5 text-lg leading-relaxed">
            <p className="font-script text-4xl leading-snug sm:text-5xl">
              I build what I&apos;m learning.
            </p>
            <p className="text-pf-muted">
              I&apos;m studying engineering science, and before that I earned a diploma in
              electrical technology. I don&apos;t know everything, but I&apos;m curious about how
              things work, and the best way I&apos;ve found to learn something is to build with it.
            </p>
          </div>
        </section>

        {/* Work */}
        <section id="work" className="border-t border-pf-line py-20">
          <h2 className={`${label} text-pf-teal`}>Selected work</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {PROJECTS.map((p) => {
              const body = (
                <>
                  <p className={`${label} text-[0.65rem] text-pf-teal`}>{p.tech}</p>
                  <h3 className="font-script mt-4 text-4xl">{p.title}</h3>
                  <p className="mt-3 text-pf-muted">{p.description}</p>
                  <p className={`${label} mt-8 text-pf-blue`}>
                    {p.cta ? `${p.cta} →` : "Innovation fair winner"}
                  </p>
                </>
              );
              const link = `${card} block h-full transition hover:-translate-y-1 hover:border-pf-blue`;
              return (
                <li key={p.title}>
                  {!p.href ? (
                    <div className={`${card} block h-full`}>{body}</div>
                  ) : p.internal ? (
                    <Link href={p.href} className={link}>
                      {body}
                    </Link>
                  ) : (
                    <a href={p.href} target="_blank" rel="noreferrer" className={link}>
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
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
            <article className={`${card} min-w-0`}>
              <p className={`${label} text-[0.65rem] text-pf-blue`}>01 // Mechanical</p>
              <h3 className="font-script mt-3 text-4xl">Motor explorer</h3>
              <p className="mb-6 mt-2 text-pf-muted">Drag to turn it, scroll or pinch to zoom, and click a part.</p>
              <MotorExplorer />
            </article>
            <article className={`${card} min-w-0`}>
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
          <p className="font-script mt-6 max-w-3xl text-6xl leading-tight sm:text-7xl">
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
