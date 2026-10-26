// A circuit-board background for the hero: thin traces with 45° bends, pads, chips and a few
// slow pulses of light running along some traces. It's drawn once from a fixed seed, so the
// server and the browser always produce exactly the same picture.

const W = 1600;
const H = 920;
const GRID = 40;
const COLS = W / GRID;
const ROWS = H / GRID;

function random(seed: number) {
  // mulberry32: a tiny seeded random number generator
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
type Trace = { d: string; start: Pt; end: Pt };

function makeTraces(count: number): Trace[] {
  const rnd = random(2028);
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const inside = ([c, r]: Pt) => c >= 0 && c <= COLS && r >= 0 && r <= ROWS;
  const dirs: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const traces: Trace[] = [];

  while (traces.length < count) {
    let at: Pt = [int(0, COLS), int(0, ROWS)];
    let dir = dirs[int(0, 3)];
    const start = at;
    const pts: Pt[] = [at];

    for (let step = 0; step < int(3, 6); step++) {
      // straight run, then a 45° chamfer into a 90° turn
      const run = int(2, 7);
      const afterRun: Pt = [at[0] + dir[0] * run, at[1] + dir[1] * run];
      const side: Pt = dir[0] === 0 ? [rnd() < 0.5 ? 1 : -1, 0] : [0, rnd() < 0.5 ? 1 : -1];
      const k = int(1, 3);
      const afterBend: Pt = [afterRun[0] + (dir[0] + side[0]) * k, afterRun[1] + (dir[1] + side[1]) * k];
      if (!inside(afterRun)) break;
      pts.push(afterRun);
      if (!inside(afterBend)) {
        at = afterRun;
        break;
      }
      pts.push(afterBend);
      at = afterBend;
      dir = side;
    }

    if (pts.length < 3) continue;
    const d = pts.map(([c, r], i) => `${i ? "L" : "M"}${c * GRID} ${r * GRID}`).join(" ");
    traces.push({ d, start, end: pts[pts.length - 1] });
  }
  return traces;
}

function makeChips(): { x: number; y: number; w: number; h: number }[] {
  const rnd = random(77);
  const spots: [number, number][] = [[3, 3], [9, 14], [18, 5], [27, 16], [34, 4]];
  return spots.map(([c, r]) => ({
    x: (c + rnd() * 1.5) * GRID,
    y: (r + rnd() * 1.5) * GRID,
    w: 3 * GRID,
    h: 2 * GRID,
  }));
}

const traces = makeTraces(56);
const chips = makeChips();

export default function Circuit() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 text-pf-ink"
      style={{
        // Strong on the left, fading out under the headline so the text stays easy to read.
        maskImage: "linear-gradient(to right, black 0%, black 35%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.22) 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, black 0%, black 35%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.22) 100%)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
      >
        <g strokeOpacity="0.22" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
          {traces.map((t, i) => (
            <path key={i} d={t.d} />
          ))}
        </g>

        {/* Pads where traces begin and end */}
        <g strokeOpacity="0.4" strokeWidth="1.5">
          {traces.map((t, i) => (
            <g key={i}>
              <circle cx={t.start[0] * GRID} cy={t.start[1] * GRID} r="4" fill="#061321" />
              <circle cx={t.end[0] * GRID} cy={t.end[1] * GRID} r="4" fill="#061321" />
            </g>
          ))}
        </g>

        {/* Chips with pins */}
        <g strokeOpacity="0.35" strokeWidth="1.5">
          {chips.map((c, i) => (
            <g key={i}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="3" fill="#061321" />
              <rect x={c.x + 12} y={c.y + 12} width={c.w - 24} height={c.h - 24} strokeOpacity="0.5" />
              {[0, 1, 2, 3, 4].map((p) => (
                <g key={p}>
                  <line x1={c.x + 16 + p * 22} y1={c.y} x2={c.x + 16 + p * 22} y2={c.y - 12} />
                  <line x1={c.x + 16 + p * 22} y1={c.y + c.h} x2={c.x + 16 + p * 22} y2={c.y + c.h + 12} />
                </g>
              ))}
              {[0, 1, 2].map((p) => (
                <g key={p}>
                  <line x1={c.x} y1={c.y + 14 + p * 22} x2={c.x - 12} y2={c.y + 14 + p * 22} />
                  <line x1={c.x + c.w} y1={c.y + 14 + p * 22} x2={c.x + c.w + 12} y2={c.y + 14 + p * 22} />
                </g>
              ))}
            </g>
          ))}
        </g>

        {/* Light pulses running along some of the traces */}
        <g strokeWidth="2.5" strokeLinecap="round" className="drop-shadow-[0_0_6px_rgba(95,208,255,0.9)]">
          {traces.slice(0, 16).map((t, i) => (
            <path
              key={i}
              d={t.d}
              pathLength={100}
              className="pf-pulse"
              style={{ animationDuration: `${7 + (i % 5) * 1.7}s`, animationDelay: `${-i * 1.3}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
