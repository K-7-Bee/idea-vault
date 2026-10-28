"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// BYTE, a little robot that turns up once you scroll past the hero and hands out tips, and a
// secret terminal that opens with the ~ key, the header button or by asking BYTE.

export const OPEN_TERMINAL = "pf:terminal";

const TIPS = [
  "Did you know? Power is voltage times current: P = V × I.",
  "Try raising the resistance in the Ohm's law lab and watch the current drop.",
  "Press ~ to open the secret terminal. Type help when you're in.",
  "Click a part of the motor to find out what it does.",
  "Engineering is curiosity with measurements.",
  "Kaushik's waste-to-energy project won first prize at his innovation fair.",
];

type Line = { kind: "in" | "out"; text: string };

const WELCOME: Line[] = [
  { kind: "out", text: "KAUSHIK LAB v1.0" },
  { kind: "out", text: "Type 'help' to list commands." },
];

export default function Companion({
  email,
  links,
}: {
  email: string;
  links: { label: string; href: string }[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>(WELCOME);
  const [shown, setShown] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const tip = useRef(-1);
  const hide = useRef(0);
  const greeted = useRef(false);

  function say(text: string) {
    setBubble(text);
    clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setBubble(null), 7000);
  }

  function openTerminal() {
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  }

  function closeTerminal() {
    dialog.current?.close();
  }

  function jump(id: string) {
    closeTerminal();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const commands: Record<string, () => string | void> = {
    help: () =>
      "Commands: about, projects, lab, motor, ohm, journey, contact, socials, vault, robot, whoami, date, clear, exit",
    about: () =>
      "Engineering science student at Jeonbuk National University, with a diploma in electrical technology. Learns by building.",
    projects: () => "Waste-to-Energy Lighting (first prize) · Cha Restaurant website · Idea Vault app",
    lab: () => jump("lab"),
    motor: () => jump("lab"),
    ohm: () => jump("lab"),
    journey: () => jump("journey"),
    contact: () => {
      jump("contact");
      return email;
    },
    socials: () => links.map((l) => `${l.label}: ${l.href}`).join("\n"),
    vault: () => {
      closeTerminal();
      router.push("/login");
    },
    robot: () => {
      closeTerminal();
      greeted.current = true;
      setShown(true);
      say("BYTE reporting for duty!");
    },
    whoami: () => "visitor. Welcome to the lab.",
    date: () => new Date().toString(),
    sudo: () => "Nice try. This lab runs on curiosity, not root access.",
    clear: () => setLines([]),
    exit: () => closeTerminal(),
  };

  function run(e: React.FormEvent) {
    e.preventDefault();
    const raw = input.current?.value.trim() ?? "";
    if (input.current) input.current.value = "";
    if (!raw) return;
    const key = raw.toLowerCase().split(/\s+/)[0];
    if (key === "clear") return void setLines([]);
    const result = Object.hasOwn(commands, key) ? commands[key]() : `Unknown command: ${raw}. Try 'help'.`;
    setLines((l) => [...l, { kind: "in", text: raw }, ...(result ? [{ kind: "out" as const, text: result }] : [])]);
  }

  useEffect(() => {
    output.current?.scrollTo({ top: output.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "~" || e.key === "`") {
        e.preventDefault();
        openTerminal();
      }
    };
    const onOpen = () => openTerminal();
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_TERMINAL, onOpen);

    // BYTE turns up once the hero has scrolled away, so he doesn't cover the headline.
    const hero = document.getElementById("top");
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting || greeted.current) return;
      greeted.current = true;
      setShown(true);
      say("Hello! I'm BYTE. Click me for tips.");
    });
    if (hero) io.observe(hero);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_TERMINAL, onOpen);
      io.disconnect();
      clearTimeout(hide.current);
    };
  }, []);

  return (
    <>
      <div
        className={`fixed bottom-4 right-4 z-40 grid justify-items-end gap-2 transition-all duration-500 sm:bottom-6 sm:right-6 ${
          shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
        }`}
      >
        <p
          role="status"
          aria-live="polite"
          className={`max-w-56 rounded-2xl border border-pf-blue/40 bg-pf-bg/95 px-4 py-3 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition-opacity ${
            bubble ? "opacity-100" : "opacity-0"
          }`}
        >
          {bubble}
        </p>
        <button
          type="button"
          aria-label="Talk to BYTE the robot"
          onClick={() => {
            tip.current = (tip.current + 1) % TIPS.length;
            say(TIPS[tip.current]);
          }}
          className="pf-byte drop-shadow-[0_0_12px_rgba(96,181,255,0.35)]"
        >
          <svg viewBox="0 0 110 120" aria-hidden className="h-20 w-[4.5rem] sm:h-24 sm:w-[5.5rem]">
            <path d="M55 18V8" stroke="#60b5ff" strokeWidth="4" />
            <circle cx="55" cy="7" r="5" fill="#60b5ff" />
            <rect x="14" y="22" width="82" height="70" rx="22" fill="#3d434e" stroke="#60b5ff" strokeWidth="3" />
            <rect x="23" y="37" width="64" height="36" rx="13" fill="#1e2127" />
            <ellipse className="pf-eye" cx="42" cy="55" rx="8" ry="10" fill="#60b5ff" />
            <ellipse className="pf-eye" cx="69" cy="55" rx="8" ry="10" fill="#60b5ff" />
            <path d="M46 80q9 6 18 0" stroke="#76abae" strokeWidth="3" fill="none" />
            <path d="M30 93v15M80 93v15" stroke="#76abae" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={openTerminal}
          className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-pf-muted transition-colors hover:text-pf-blue"
        >
          <span className="sm:hidden">Open terminal</span>
          <span className="max-sm:hidden">Press ~ for terminal</span>
        </button>
      </div>

      <dialog
        ref={dialog}
        aria-label="Terminal"
        onClick={(e) => e.target === dialog.current && closeTerminal()}
        className="m-auto w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-pf-blue/60 bg-pf-deep p-0 text-pf-ink shadow-[0_0_60px_rgba(96,181,255,0.15)] backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between bg-pf-bg px-4 py-3 font-mono text-xs tracking-[0.2em]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pf-blue" />
            KAUSHIK LAB // TERMINAL
          </span>
          <button type="button" onClick={closeTerminal} aria-label="Close terminal" className="px-2 text-pf-muted hover:text-pf-ink">
            ✕
          </button>
        </div>
        <div
          ref={output}
          aria-live="polite"
          className="h-72 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-7"
        >
          {lines.map((l, i) =>
            l.kind === "in" ? (
              <p key={i} className="text-pf-ink">
                <span className="text-pf-teal">visitor@kaushik:~$</span> {l.text}
              </p>
            ) : (
              <p key={i} className="text-pf-blue">
                {l.text}
              </p>
            ),
          )}
        </div>
        <form onSubmit={run} className="flex items-center gap-2 border-t border-pf-line p-3 font-mono text-sm">
          <span className="text-pf-teal max-sm:hidden">visitor@kaushik:~$</span>
          <input
            ref={input}
            autoComplete="off"
            spellCheck={false}
            aria-label="Terminal command"
            className="min-w-0 flex-1 bg-transparent text-pf-ink outline-none"
          />
          <button type="submit" className="rounded-full border border-pf-line px-4 py-1.5 hover:border-pf-blue">
            Enter
          </button>
        </form>
      </dialog>
    </>
  );
}
