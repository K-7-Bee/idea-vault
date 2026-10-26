import type { Metadata } from "next";
import { Bodoni_Moda } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import MobileMenu from "./mobile-menu";

// A sharp, high-contrast serif with hairline details for the big headlines.
const display = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
});

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

const label = "font-mono text-xs uppercase tracking-[0.25em]";
const button =
  "rounded-sm px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] transition-colors";

function Timeline({ title, items }: { title: string; items: Entry[] }) {
  return (
    <div>
      <h3 className={`${label} text-pf-muted`}>{title}</h3>
      <ul className="mt-5 border-t border-pf-line">
        {items.map((i) => (
          <li key={i.place} className="border-b border-pf-line py-5">
            <p className="font-serif-display text-2xl font-semibold">{i.place}</p>
            <p className="mt-1 text-pf-muted">{i.detail}</p>
            <p className={`${label} mt-2 text-[0.65rem] text-pf-muted`}>
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
      className={`${display.variable} relative min-h-screen overflow-x-clip bg-pf-bg text-pf-ink`}
    >
      <div className="pf-grain" aria-hidden />

      {/* Hero */}
      <section id="top" className="relative flex min-h-screen flex-col overflow-hidden">
        {/* The photo, tinted into the navy palette so the text stays readable. */}
        <Image
          src="/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[35%_center]"
        />
        <div aria-hidden className="absolute inset-0 bg-pf-bg/65 md:bg-pf-bg/10" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-transparent via-pf-bg/40 to-pf-bg/95 max-md:hidden"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-pf-bg/70 via-transparent to-pf-bg"
        />
        <div aria-hidden className="pf-glow absolute inset-0 mix-blend-soft-light" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <a href="#top" aria-label={`${NAME} — back to top`}>
            <Image src="/k-logo.png" alt="" width={56} height={56} priority className="h-14 w-14" />
          </a>
          <nav className={`${label} hidden gap-8 text-pf-ink sm:flex`}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-opacity hover:opacity-60">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={`mailto:${EMAIL}`}
              className={`${button} bg-pf-ink text-pf-bg hover:opacity-85`}
            >
              Get in touch
            </a>
            <MobileMenu links={NAV} />
          </div>
        </header>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-10 md:grid-cols-2"
        >
          <div className="hidden md:block" aria-hidden />
          <div>
            <p className={`${label} text-pf-ink [text-shadow:0_1px_10px_rgba(6,19,33,0.9)]`}>
              Engineering Science // Jeonbuk National University
            </p>
            <h1 className="font-serif-display mt-6 text-6xl font-semibold leading-[0.95] sm:text-7xl">
              Curiosity meets engineering.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#e4f5fa] [text-shadow:0_1px_12px_rgba(6,19,33,0.9)]">
              I&apos;m {NAME}, an engineering student who learns by building. I start with what
              I&apos;m curious about and make it real, one project at a time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#work" className={`${button} bg-pf-ink text-pf-bg hover:opacity-85`}>
                See my work
              </a>
              <a
                href="#about"
                className={`${button} border border-pf-ink/50 hover:border-pf-ink`}
              >
                About me
              </a>
            </div>
          </div>
        </div>

        <p
          aria-hidden
          className={`${label} absolute right-4 top-1/2 hidden -translate-y-1/2 text-[0.65rem] text-pf-ink/80 [writing-mode:vertical-rl] lg:block`}
        >
          Bangladesh → South Korea
        </p>

        <div
          aria-hidden
          className="font-serif-display relative z-10 select-none px-4 text-[clamp(4.5rem,19vw,17rem)] font-black uppercase leading-[0.78] tracking-[-0.03em] [text-shadow:0_0_60px_rgba(164,217,233,0.25)]"
        >
          Kaushik
        </div>
      </section>

      <main className="relative z-10 mx-auto max-w-6xl px-6">
        {/* About */}
        <section id="about" className="grid gap-8 border-t border-pf-line py-20 md:grid-cols-[1fr_2fr]">
          <h2 className={`${label} text-pf-muted`}>About</h2>
          <div className="max-w-2xl space-y-5 text-lg leading-relaxed">
            <p className="font-serif-display text-3xl font-medium leading-snug sm:text-4xl">
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
          <h2 className={`${label} text-pf-muted`}>Selected work</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {PROJECTS.map((p) => {
              const body = (
                <>
                  <p className={`${label} text-[0.65rem] text-pf-muted`}>{p.tech}</p>
                  <h3 className="font-serif-display mt-4 text-4xl font-semibold">{p.title}</h3>
                  <p className="mt-3 text-pf-muted">{p.description}</p>
                  <p className={`${label} mt-8`}>{p.cta ? `${p.cta} →` : "Innovation fair winner"}</p>
                </>
              );
              const card =
                "block h-full rounded-sm border border-pf-line p-7 transition-colors hover:border-pf-ink";
              return (
                <li key={p.title}>
                  {!p.href ? (
                    <div className="block h-full rounded-sm border border-pf-line p-7">{body}</div>
                  ) : p.internal ? (
                    <Link href={p.href} className={card}>
                      {body}
                    </Link>
                  ) : (
                    <a href={p.href} target="_blank" rel="noreferrer" className={card}>
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Journey */}
        <section id="journey" className="border-t border-pf-line py-20">
          <h2 className={`${label} text-pf-muted`}>Journey</h2>
          <div className="mt-10 grid gap-12 md:grid-cols-2">
            <Timeline title="Education" items={EDUCATION} />
            <Timeline title="Experience" items={EXPERIENCE} />
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="relative border-t border-pf-line py-24">
          <h2 className={`${label} text-pf-muted`}>Contact</h2>
          <p className="font-serif-display mt-6 max-w-3xl text-5xl font-semibold leading-tight sm:text-6xl">
            Let&apos;s build something.
          </p>
          <a
            href={`mailto:${EMAIL}`}
            className="mt-8 inline-block break-all border-b border-pf-ink pb-1 text-lg"
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

      <footer
        className={`${label} relative z-10 mx-auto flex max-w-6xl items-center justify-between border-t border-pf-line px-6 py-6 text-[0.65rem] text-pf-muted`}
      >
        <span>© {NAME}</span>
        <Link href="/login" className="transition-opacity hover:opacity-60">
          Vault login
        </Link>
      </footer>
    </div>
  );
}
