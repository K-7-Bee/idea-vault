"use client";

import { useEffect, useRef, useState } from "react";

// A battery and one resistor. Move the sliders and the current, power and the flow around the
// loop update straight away. The moving dots show flow as an idea, not real electron speed.

const LOOP: [number, number][] = [[90, 40], [310, 40], [310, 120], [90, 120], [90, 40]];
const SIDES = [220, 80, 220, 80];
const PERIMETER = SIDES.reduce((a, b) => a + b, 0);
const DOTS = 8;

function pointAt(distance: number): [number, number] {
  let s = ((distance % PERIMETER) + PERIMETER) % PERIMETER;
  for (let i = 0; i < SIDES.length; i++) {
    if (s <= SIDES[i]) {
      const k = s / SIDES[i];
      const [x1, y1] = LOOP[i];
      const [x2, y2] = LOOP[i + 1];
      return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
    }
    s -= SIDES[i];
  }
  return LOOP[0];
}

export default function OhmLab() {
  const [volts, setVolts] = useState(12);
  const [ohms, setOhms] = useState(100);
  const amps = volts / ohms;
  const watts = (volts * volts) / ohms;

  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const ampsRef = useRef(amps);
  useEffect(() => {
    ampsRef.current = amps;
  }, [amps]);

  useEffect(() => {
    const place = (offset: number) =>
      dots.current.forEach((d, i) => {
        const [x, y] = pointAt(offset + (i * PERIMETER) / DOTS);
        d?.setAttribute("cx", String(x));
        d?.setAttribute("cy", String(y));
      });
    place(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let offset = 0;
    let last = 0;
    let frameId = 0;
    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000 || 0, 0.05);
      last = t;
      offset += dt * ampsRef.current * 170;
      place(offset);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // The resistor glows brighter the more power it turns into heat (57.6 W is the most here).
  const glow = Math.min(watts / 57.6, 1);

  const slider = "mt-2 w-full accent-[var(--pf-blue)]";
  const row = "mt-5 flex items-baseline justify-between text-sm";

  return (
    <div>
      <svg
        viewBox="0 0 400 160"
        role="img"
        aria-label={`A ${volts} volt battery driving ${amps.toFixed(3)} amps through a ${ohms} ohm resistor`}
        className="h-48 w-full rounded-2xl border border-pf-line bg-pf-deep"
      >
        <path d={`M${LOOP.map((p) => p.join(" ")).join(" L")}`} fill="none" stroke="#76abae" strokeWidth="3" />
        <rect
          x="280"
          y="25"
          width="60"
          height="30"
          rx="6"
          fill="#1e2127"
          stroke="#60b5ff"
          strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 ${4 + glow * 14}px rgba(96, 181, 255, ${0.2 + glow * 0.7}))` }}
        />
        <path d="M288 40h6l4-7 6 14 6-14 6 14 4-7h6" fill="none" stroke="#eeeeee" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="75" y="64" width="30" height="33" fill="#1e2127" />
        <path d="M75 72h30M83 88h14" stroke="#eeeeee" strokeWidth="3" />
        <text x="52" y="85" fill="#76abae" fontSize="13">{volts} V</text>
        <text x="348" y="44" fill="#60b5ff" fontSize="12">{ohms} Ω</text>
        {Array.from({ length: DOTS }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              dots.current[i] = el;
            }}
            r="4.5"
            fill="#eeeeee"
            opacity={volts === 0 ? 0 : 0.9}
          />
        ))}
      </svg>

      <label htmlFor="volts" className={row}>
        Voltage <output className="font-mono text-pf-blue">{volts} V</output>
      </label>
      <input id="volts" type="range" min={0} max={24} step={1} value={volts} onChange={(e) => setVolts(+e.target.value)} className={slider} />

      <label htmlFor="ohms" className={row}>
        Resistance <output className="font-mono text-pf-blue">{ohms} Ω</output>
      </label>
      <input id="ohms" type="range" min={10} max={1000} step={10} value={ohms} onChange={(e) => setOhms(+e.target.value)} className={slider} />

      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          ["Current", `${amps.toFixed(3)} A`],
          ["Power", `${watts.toFixed(2)} W`],
        ].map(([name, value]) => (
          <div key={name} className="rounded-2xl border border-pf-line bg-pf-glass p-4">
            <p className="font-nav text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-pf-teal">{name}</p>
            <p className="mt-1 font-mono text-2xl text-pf-blue">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-sm leading-relaxed text-pf-muted">
        Ideal DC model: I = V / R, P = V² / R. Not a hardware safety calculator.
      </p>
    </div>
  );
}
