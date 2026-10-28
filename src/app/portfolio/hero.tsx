"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OPEN_TERMINAL } from "./companion";
import MobileMenu from "./mobile-menu";

// The portfolio hero: the lightning K floats in the middle and tilts toward the pointer,
// electronic parts drift around it and dodge the cursor, and screws tumble down behind it.
// The two chapter cards switch the colour theme: the K spins, and the parts are pulled into
// the middle, swapped for the other chapter's parts and thrown back out.

type Theme = "teal" | "blue";

const ICONS = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  resistor: <path d="M2 12h4l1.5-3 3 6 3-6 3 6 1.5-3h4" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  plug: <path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0V7zM12 17v5" />,
  capacitor: <path d="M2 12h8M14 12h8M10 5v14M14 5v14" />,
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  wave: <path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0c1.2-2.9 2.5-4.2 5-3" />,
  diode: <path d="M2 12h6M16 12h6M8 6v12l8-6-8-6zM16 6v12" />,
} satisfies Record<string, ReactNode>;

type Icon = keyof typeof ICONS;

const CHAPTERS: { theme: Theme; place: string; detail: string; when: string; icon: Icon }[] = [
  { theme: "teal", place: "Bangladesh", detail: "Diploma · Electrical", when: "2023", icon: "bolt" },
  { theme: "blue", place: "South Korea", detail: "BSc · Engineering Science", when: "2028", icon: "atom" },
];

// Each chapter's parts, one per slot below.
const PARTS: Record<Theme, Icon[]> = {
  teal: ["bolt", "resistor", "bulb", "plug", "capacitor", "bolt", "resistor", "bulb", "capacitor"],
  blue: ["chip", "atom", "gear", "wave", "diode", "chip", "atom", "wave", "gear"],
};

// The first six float in front of the text, the last three behind the K.
const SLOTS = [
  { top: "25%", left: "30%", size: 120 },
  { top: "62%", left: "42%", size: 64 },
  { top: "28%", left: "64%", size: 132 },
  { top: "14%", left: "48%", size: 84 },
  { top: "76%", left: "22%", size: 72 },
  { top: "60%", left: "68%", size: 104 },
  { top: "16%", left: "38%", size: 56, opacity: 0.7 },
  { top: "52%", left: "56%", size: 48, opacity: 0.6 },
  { top: "80%", left: "35%", size: 52, opacity: 0.7 },
];
const FRONT = 6;
const FLOAT_SECONDS = [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10];

const SWITCH_MS = 1700;

// A falling flat-head screw, side-on: countersunk head with the Phillips recess, a threaded
// shank and a point. The steel gradient is defined once in the hero's markup.
const THREADS = Array.from({ length: 9 }, (_, i) => `M8 ${13 + i * 4.4}l8 3`).join("");
const SCREW = `<svg viewBox="0 0 24 60"><path d="M0 1h24l-8 8H8z" fill="url(#pf-steel)"/><path d="M10.5 1h3v3h-3z" fill="#3b414a"/><path d="M8 9h8v38l-4 11-4-11z" fill="url(#pf-steel)"/><path d="${THREADS}" stroke="#4a515b" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const backOut = (s: number) => (t: number) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

function tween(ms: number, ease: (t: number) => number, update: (k: number) => void, done?: () => void) {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / ms, 1);
    update(ease(t));
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function floatAt(i: number, seconds: number) {
  const phase = (seconds + i * 0.7) * ((Math.PI * 2) / FLOAT_SECONDS[i % FLOAT_SECONDS.length]);
  return { y: Math.sin(phase) * 15, angle: Math.cos(phase) * 6 };
}

function Glyph({ icon, className }: { icon: Icon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {ICONS[icon]}
    </svg>
  );
}

function Disc({ icon, accent }: { icon: Icon; accent: boolean }) {
  return (
    <span
      className={`grid h-full w-full place-items-center rounded-full border border-pf-ink/15 bg-[radial-gradient(circle_at_30%_25%,rgba(238,238,238,0.22),rgba(238,238,238,0.04)_60%)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${
        accent ? "text-[var(--hero-accent)]" : "text-pf-ink"
      }`}
    >
      <Glyph icon={icon} className="h-1/2 w-1/2" />
    </span>
  );
}

const nav = "font-nav text-xs uppercase tracking-[0.25em]";

export default function Hero({
  name,
  links,
}: {
  name: string;
  links: { label: string; href: string }[];
}) {
  const [active, setActive] = useState<Theme>("blue");
  const [shown, setShown] = useState<Theme>("blue");

  const heroRef = useRef<HTMLElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const screwsRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<(HTMLDivElement | null)[]>([]);
  const switchTo = useRef<(theme: Theme) => void>(null);
  const busy = useRef(false);

  useEffect(() => {
    const hero = heroRef.current;
    const tilt = tiltRef.current;
    const front = frontRef.current;
    const back = backRef.current;
    const screws = screwsRef.current;
    if (!hero || !tilt || !front || !back || !screws) return;
    const parts = partsRef.current.filter((p): p is HTMLDivElement => !!p);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      switchTo.current = setShown;
      return;
    }

    const state = parts.map(() => ({ rx: 0, ry: 0, angle: Math.random() * 360, baseX: 0, baseY: 0 }));
    const mouse = { x: 0, y: 0, px: -9999, py: -9999 };
    const eased = { x: 0, y: 0 };
    let spin = 0;
    let blur = 0;
    let switching = false;

    const place = (i: number, seconds: number) => {
      const s = state[i];
      const f = floatAt(i, seconds);
      return `translate(${s.rx + s.baseX}px, ${s.ry + s.baseY + f.y}px) rotate(${s.angle + f.angle}deg)`;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouse.x = e.clientX / window.innerWidth - 0.5;
      mouse.y = e.clientY / window.innerHeight - 0.5;
      mouse.px = e.clientX;
      mouse.py = e.clientY;
    };
    window.addEventListener("pointermove", onMove);

    let visible = true;
    let frameId = 0;

    function frame() {
      const seconds = performance.now() / 1000;
      eased.x += (mouse.x - eased.x) * 0.05;
      eased.y += (mouse.y - eased.y) * 0.05;

      tilt!.style.transform = `rotateY(${eased.x * 40 + spin}deg) rotateX(${-eased.y * 20}deg)`;
      tilt!.style.filter = blur > 0.1 ? `blur(${blur}px)` : "";
      front!.style.transform = `translate(${eased.x * 60}px, ${eased.y * 60}px)`;
      back!.style.transform = `translate(${eased.x * -30}px, ${eased.y * -30}px)`;

      // Each part is pushed away from a nearby pointer, and spins faster the closer it is.
      if (!switching) {
        parts.forEach((el, i) => {
          const s = state[i];
          const r = el.getBoundingClientRect();
          const dx = mouse.px - (r.left + r.width / 2);
          const dy = mouse.py - (r.top + r.height / 2);
          const distance = Math.hypot(dx, dy) || 1;
          let targetX = 0;
          let targetY = 0;
          let speed = 1;
          if (distance < 400) {
            const force = (400 - distance) / 400;
            targetX = (dx / distance) * force * -80;
            targetY = (dy / distance) * force * -80;
            speed = 1 + force * 5;
          }
          s.rx += (targetX - s.rx) * 0.1;
          s.ry += (targetY - s.ry) * 0.1;
          s.angle += 0.2 * speed;
          el.style.transform = place(i, seconds);
        });
      }

      frameId = visible ? requestAnimationFrame(frame) : 0;
    }
    frameId = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frameId) frameId = requestAnimationFrame(frame);
    });
    io.observe(hero);

    // Screws drop from above the hero, spinning as they fall, and fade out at the bottom.
    const screwTimer = window.setInterval(() => {
      if (!visible || document.hidden) return;
      // Fewer screws on narrow screens, so phones get the same density as desktops.
      if (Math.random() > screws.clientWidth / 1200) return;
      const s = document.createElement("span");
      const size = Math.random() * 28 + 34;
      const seconds = Math.random() * 5 + 5;
      const start = Math.random() * 360;
      const turn = (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 540 + 180);
      s.className = "pf-screw";
      s.innerHTML = SCREW;
      s.style.width = `${size * 0.4}px`;
      s.style.height = `${size}px`;
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDuration = `${seconds}s`;
      s.style.setProperty("--fall", `${screws.clientHeight + 140}px`);
      s.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
      s.style.setProperty("--r0", `${start}deg`);
      s.style.setProperty("--r1", `${start + turn}deg`);
      s.style.setProperty("--o", `${Math.random() * 0.35 + 0.45}`);
      screws.appendChild(s);
      window.setTimeout(() => s.remove(), seconds * 1000);
    }, 450);

    switchTo.current = (theme) => {
      switching = true;
      busy.current = true;

      // Spin up with a motion blur, then settle with a little overshoot.
      tween(600, (t) => t * t, (k) => ((spin = 360 * k), (blur = 15 * k)), () =>
        tween(1500, backOut(0.7), (k) => ((spin = 360 + 360 * k), (blur = 15 * (1 - k))), () => {
          spin = 0;
          blur = 0;
        }),
      );

      // Pull every part into the K, swap them at the middle, then throw them back out.
      window.setTimeout(() => setShown(theme), 500);
      const k = tilt.getBoundingClientRect();
      const cx = k.left + k.width / 2;
      const cy = k.top + k.height / 2;
      const seconds = performance.now() / 1000;
      let left = parts.length;

      parts.forEach((el, i) => {
        const s = state[i];
        const now = floatAt(i, seconds);
        const end = floatAt(i, seconds + SWITCH_MS / 1000);
        const r = el.getBoundingClientRect();
        const toX = cx - (r.left + r.width / 2) + s.rx + s.baseX;
        const toY = cy - (r.top + r.height / 2) + s.ry + s.baseY + now.y;
        const nextX = (Math.random() - 0.5) * 200;
        const nextY = (Math.random() - 0.5) * 200;
        const inside = `translate(${toX}px, ${toY}px) rotate(${s.angle + 45}deg) scale(0.1)`;

        const anim = el.animate(
          [
            { transform: el.style.transform, opacity: 1, easing: "cubic-bezier(0.55, 0.085, 0.68, 0.53)" },
            { offset: 500 / SWITCH_MS, transform: inside, opacity: 0 },
            { offset: 800 / SWITCH_MS, transform: inside, opacity: 0, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            {
              transform: `translate(${nextX}px, ${nextY + end.y}px) rotate(${s.angle + 90 + end.angle}deg) scale(1)`,
              opacity: 1,
            },
          ],
          { duration: SWITCH_MS, fill: "forwards" },
        );
        anim.onfinish = () => {
          Object.assign(s, { rx: 0, ry: 0, baseX: nextX, baseY: nextY, angle: s.angle + 90 });
          el.style.transform = place(i, performance.now() / 1000);
          anim.cancel();
          if (--left === 0) {
            switching = false;
            busy.current = false;
          }
        };
      });
    };

    return () => {
      window.removeEventListener("pointermove", onMove);
      io.disconnect();
      clearInterval(screwTimer);
      cancelAnimationFrame(frameId);
      screws.replaceChildren();
    };
  }, []);

  function choose(theme: Theme) {
    if (busy.current || theme === active) return;
    setActive(theme);
    switchTo.current?.(theme);
  }

  const part = (i: number) => {
    const slot = SLOTS[i];
    return (
      <div
        key={i}
        ref={(el) => {
          partsRef.current[i] = el;
        }}
        className="absolute"
        style={{ top: slot.top, left: slot.left, width: slot.size, height: slot.size }}
      >
        <span className="block h-full w-full" style={{ opacity: slot.opacity }}>
          <Disc icon={PARTS[shown][i]} accent={i % 3 === 0} />
        </span>
      </div>
    );
  };

  const other = active === "blue" ? "teal" : "blue";

  return (
    <section
      ref={heroRef}
      id="top"
      data-theme={active}
      className="pf-hero relative isolate flex min-h-svh flex-col overflow-hidden lg:h-svh lg:min-h-[680px]"
    >
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <linearGradient id="pf-steel" x1="0" x2="1">
            <stop offset="0" stopColor="#6f7884" />
            <stop offset="0.45" stopColor="#d9dee3" />
            <stop offset="1" stopColor="#5d6570" />
          </linearGradient>
        </defs>
      </svg>
      <div ref={screwsRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" />

      <header className="relative z-30 flex w-full items-center justify-between px-[4%] py-6 lg:py-8">
        <a href="#top" aria-label={`${name}, back to top`} className="flex items-center gap-2">
          <Image src="/k-mark.png" alt="" width={44} height={44} loading="eager" className="h-11 w-11" />
          <span className="font-script text-2xl">Kaushik</span>
        </a>
        <nav
          aria-label="Sections"
          className="hidden gap-1 rounded-full border border-pf-ink/20 bg-pf-ink/[0.08] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(238,238,238,0.1)] backdrop-blur-xl sm:flex"
        >
          {links.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className={`font-nav rounded-full px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--hero-accent)] hover:text-pf-bg ${
                i === 0 ? "bg-[var(--hero-accent)] text-pf-bg" : "text-pf-muted"
              }`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open the terminal"
            title="Terminal (~)"
            onClick={() => window.dispatchEvent(new Event(OPEN_TERMINAL))}
            className="grid h-11 w-11 place-items-center rounded-full border border-pf-line bg-pf-glass font-mono text-sm transition-colors hover:border-[var(--hero-accent)] hover:text-[var(--hero-accent)]"
          >
            &gt;_
          </button>
          <a
            href="#contact"
            className="hidden rounded-full bg-black/35 px-7 py-3.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-black/55 sm:block"
          >
            Get in touch
          </a>
          <MobileMenu links={links} />
        </div>
      </header>

      {/* Parts that float behind the K. */}
      <div ref={backRef} aria-hidden className="pointer-events-none absolute inset-0 -z-[5] max-lg:hidden">
        {SLOTS.slice(FRONT).map((_, i) => part(FRONT + i))}
      </div>

      <div className="relative flex flex-1 flex-col gap-10 px-[4%] pb-10 lg:flex-row lg:justify-between lg:gap-0 lg:pb-12">
        <div className="relative z-10 flex flex-col gap-7 lg:pt-6">
          <h1 className="pf-title">
            Curiosity
            <br />
            meets
            {/* On large screens the last word sits in the right-hand column instead. */}
            <span className="lg:sr-only">
              <br />
              engineering
            </span>
          </h1>
          <p className="max-w-[26rem] text-lg leading-relaxed text-pf-muted">
            I&apos;m {name}, an engineering student who learns by building. I start with what
            I&apos;m curious about and make it real, one project at a time.
          </p>
          <a
            href="#work"
            className="flex w-fit items-center gap-6 rounded-full bg-black/35 py-1.5 pl-6 pr-1.5 font-bold transition hover:-translate-y-1 hover:bg-black/55"
          >
            See my work
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--hero-accent)] pb-0.5 text-2xl font-black leading-none text-pf-bg">
              +
            </span>
          </a>
          <div className="flex items-center gap-4 lg:mt-auto">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-pf-line bg-pf-glass text-[var(--hero-accent)]">
              <Glyph icon="bolt" className="h-6 w-6" />
            </span>
            <span className="flex flex-col">
              <span className={`${nav} text-[0.65rem] text-pf-muted`}>Innovation fair</span>
              <span className="text-sm font-semibold">First prize · Waste-to-energy</span>
            </span>
          </div>
        </div>

        {/* The K: it fades in, bobs gently and tilts toward the pointer. */}
        <div className="pf-enter pointer-events-none relative grid place-items-center lg:absolute lg:inset-0 lg:z-[1]">
          <div className="pf-float [perspective:1000px]">
            <div
              aria-hidden
              className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,var(--hero-accent)_0%,transparent_68%)] opacity-35 blur-3xl"
            />
            <div ref={tiltRef} className="[transform-style:preserve-3d]">
              <Image
                src="/k-mark.png"
                alt=""
                width={768}
                height={768}
                sizes="(min-width: 1024px) 40vw, 78vw"
                loading="eager"
                fetchPriority="high"
                className="h-[min(78vw,360px)] w-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)] lg:h-[min(64vh,40vw)]"
              />
            </div>
          </div>
        </div>

        {/* Parts that float in front of everything, on large screens. */}
        <div
          ref={frontRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 max-lg:hidden"
        >
          {SLOTS.slice(0, FRONT).map((_, i) => part(i))}
        </div>

        <div className="relative z-10 flex flex-col items-center gap-10 lg:w-[420px] lg:items-end lg:justify-between lg:pt-6 lg:text-right">
          <div className="flex flex-col items-center gap-6 lg:items-end">
            <p className={`${nav} text-[0.65rem] text-pf-muted`}>Choose a chapter</p>
            <div className="flex gap-4 pt-16">
              {CHAPTERS.map((c) => (
                <button
                  key={c.theme}
                  type="button"
                  aria-pressed={active === c.theme}
                  onClick={() => choose(c.theme)}
                  className={`group relative flex w-[140px] flex-col items-center gap-5 rounded-[28px] border bg-pf-glass px-4 pb-4 pt-20 text-center backdrop-blur-md transition-all duration-400 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:border-pf-ink/40 hover:bg-pf-ink/10 ${
                    active === c.theme ? "border-[var(--hero-accent)]" : "border-pf-line"
                  }`}
                >
                  <span
                    className={`absolute -top-12 left-1/2 h-28 w-28 -translate-x-1/2 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-6 group-hover:-rotate-12 group-hover:scale-110 ${
                      active === c.theme ? "" : "brightness-75"
                    }`}
                  >
                    <span
                      className={`grid h-full w-full place-items-center rounded-full border border-pf-ink/15 bg-pf-bg bg-blend-overlay shadow-[0_20px_35px_rgba(0,0,0,0.45)] ${
                        c.theme === "blue"
                          ? "bg-[linear-gradient(rgba(96,181,255,0.25),rgba(96,181,255,0.25))] text-pf-blue"
                          : "bg-[linear-gradient(rgba(118,171,174,0.25),rgba(118,171,174,0.25))] text-pf-teal"
                      }`}
                    >
                      <Glyph icon={c.icon} className="h-1/2 w-1/2" />
                    </span>
                  </span>
                  <span className="flex flex-col text-xs">
                    <span className="font-semibold">{c.place}</span>
                    <span className="text-pf-muted">{c.detail}</span>
                    <span className="text-pf-muted">{c.when}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              {(["Previous chapter", "Next chapter"] as const).map((label, i) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={() => choose(other)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-pf-line bg-pf-glass transition-colors hover:bg-pf-ink/10"
                >
                  {i ? "→" : "←"}
                </button>
              ))}
            </div>
          </div>
          <p aria-hidden className="pf-title text-right max-lg:hidden">
            engineering
          </p>
        </div>
      </div>
    </section>
  );
}
