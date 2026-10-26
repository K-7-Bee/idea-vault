"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The interactive hero: the photo drifts and the content tilts slightly with the pointer,
// a soft light follows it, and lightning strikes where you click or tap (and now and then on
// its own). Everything is switched off for people who prefer reduced motion.

type Point = { x: number; y: number };
type Path = { pts: Point[]; width: number };
type Bolt = { paths: Path[]; born: number; at: Point };

const LIFE_MS = 700;

// A jagged line from a to b: repeatedly bend the middle of each piece sideways, by less each time.
function jagged(a: Point, b: Point, spread: number): Point[] {
  let pts = [a, b];
  let offset = spread;
  for (let round = 0; round < 6; round++) {
    const next: Point[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (Math.random() - 0.5) * 2 * offset;
      next.push({ x: (p.x + q.x) / 2 - (dy / len) * bend, y: (p.y + q.y) / 2 + (dx / len) * bend }, q);
    }
    pts = next;
    offset *= 0.55;
  }
  return pts;
}

// A main bolt from `from` to `to`, with thinner branches splitting off it.
function makeBolt(from: Point, to: Point): Path[] {
  const paths: Path[] = [];
  const grow = (a: Point, b: Point, width: number, depth: number) => {
    const pts = jagged(a, b, Math.hypot(b.x - a.x, b.y - a.y) * 0.14);
    paths.push({ pts, width });
    if (depth >= 2) return;
    for (let i = 8; i < pts.length - 8; i++) {
      if (Math.random() > 0.05) continue;
      const p = pts[i];
      const angle = Math.atan2(b.y - a.y, b.x - a.x) + (Math.random() - 0.5) * 1.6;
      const length = (60 + Math.random() * 140) / (depth + 1);
      grow(p, { x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length }, width * 0.55, depth + 1);
    }
  };
  grow(from, to, 2.4, 0);
  return paths;
}

export default function HeroStage({
  background,
  children,
}: {
  background: ReactNode;
  children: ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = section.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = el.clientWidth;
      height = el.clientHeight;
      cv.width = width * dpr;
      cv.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const bolts: Bolt[] = [];
    let frameId = 0;

    function frame(now: number) {
      ctx!.clearRect(0, 0, width, height);
      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i];
        const age = (now - bolt.born) / LIFE_MS;
        if (age >= 1) {
          bolts.splice(i, 1);
          continue;
        }
        // Quick flicker at the start, then a smooth fade.
        const fade = (1 - age) ** 2 * (age < 0.25 ? 0.6 + Math.random() * 0.4 : 1);

        const glow = ctx!.createRadialGradient(bolt.at.x, bolt.at.y, 0, bolt.at.x, bolt.at.y, 260);
        glow.addColorStop(0, `rgba(164, 217, 233, ${0.22 * fade})`);
        glow.addColorStop(1, "rgba(164, 217, 233, 0)");
        ctx!.fillStyle = glow;
        ctx!.fillRect(bolt.at.x - 260, bolt.at.y - 260, 520, 520);

        ctx!.lineJoin = "round";
        for (const { pts, width: w } of bolt.paths) {
          ctx!.beginPath();
          ctx!.moveTo(pts[0].x, pts[0].y);
          for (const p of pts) ctx!.lineTo(p.x, p.y);
          ctx!.shadowColor = `rgba(95, 208, 255, ${fade})`;
          ctx!.shadowBlur = 18;
          ctx!.strokeStyle = `rgba(164, 217, 233, ${0.85 * fade})`;
          ctx!.lineWidth = w * 2;
          ctx!.stroke();
          ctx!.shadowBlur = 0;
          ctx!.strokeStyle = `rgba(240, 252, 255, ${fade})`;
          ctx!.lineWidth = w * 0.7;
          ctx!.stroke();
        }
      }
      frameId = bolts.length ? requestAnimationFrame(frame) : 0;
    }

    function strike(x: number, y: number) {
      const from = { x: x + (Math.random() - 0.5) * width * 0.25, y: -10 };
      bolts.push({ paths: makeBolt(from, { x, y }), born: performance.now(), at: { x, y } });
      if (!frameId) frameId = requestAnimationFrame(frame);
    }

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element).closest("a, button")) return;
      const rect = el.getBoundingClientRect();
      strike(e.clientX - rect.left, e.clientY - rect.top);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--px", String(x - 0.5));
      el.style.setProperty("--py", String(y - 0.5));
      el.style.setProperty("--sx", `${x * 100}%`);
      el.style.setProperty("--sy", `${y * 100}%`);
    };

    const onPointerLeave = () => {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);

    // Now and then, a strike on its own while the hero is on screen.
    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    io.observe(el);
    let timer = 0;
    const idle = () => {
      if (onScreen && !document.hidden) {
        strike(width * (0.1 + Math.random() * 0.5), height * (0.35 + Math.random() * 0.25));
      }
      timer = window.setTimeout(idle, 5000 + Math.random() * 4000);
    };
    timer = window.setTimeout(idle, 2500);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      observer.disconnect();
      io.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <section
      ref={section}
      id="top"
      className="relative flex min-h-screen flex-col overflow-hidden [perspective:1200px]"
    >
      {/* The photo drifts opposite to the pointer, which gives the page some depth. */}
      <div
        aria-hidden
        className="absolute -inset-8 transition-transform duration-300 ease-out"
        style={{
          transform:
            "translate3d(calc(var(--px, 0) * -28px), calc(var(--py, 0) * -18px), 0) scale(1.04)",
        }}
      >
        {background}
      </div>

      {/* A soft light that follows the pointer. */}
      <div
        aria-hidden
        className="absolute inset-0 mix-blend-screen max-md:hidden"
        style={{
          background:
            "radial-gradient(480px circle at var(--sx, 70%) var(--sy, 40%), rgba(164,217,233,0.14), transparent 60%)",
        }}
      />

      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-[5]" />

      <div
        className="relative z-10 flex flex-1 flex-col transition-transform duration-300 ease-out"
        style={{
          transform:
            "rotateY(calc(var(--px, 0) * 3deg)) rotateX(calc(var(--py, 0) * -2deg))",
        }}
      >
        {children}
      </div>
    </section>
  );
}
