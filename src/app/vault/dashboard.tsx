import { DASHBOARD_STAGES, type VaultStats } from "@/lib/vault-stats";
import { STATUS_INFO } from "./status";

const card = "rounded-2xl border border-line bg-card p-5 shadow-sm";
const heading = "text-base font-semibold tracking-tight";

function StatCard({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  return (
    <div className={`${card} relative overflow-hidden`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums leading-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

// A small line chart of ideas captured per month. Drawn in SVG; the numbers are also listed for
// screen readers so nothing depends on seeing the line.
function ActivityChart({ months }: { months: VaultStats["months"] }) {
  const W = 560;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 28 };
  const max = Math.max(4, ...months.map((m) => m.count));
  const top = Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, months.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const line = months.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(months.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, top / 4, top / 2, (3 * top) / 4, top];

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id="vault-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
          </g>
        ))}
        <path d={area} fill="url(#vault-area)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {months.map((m, i) => (
          <g key={m.key}>
            <circle cx={x(i)} cy={y(m.count)} r="4.5" fill="var(--card)" stroke="var(--accent)" strokeWidth="2.5" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{m.label}</text>
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">
        Ideas captured per month: {months.map((m) => `${m.label} ${m.count}`).join(", ")}.
      </figcaption>
    </figure>
  );
}

function StageDonut({ stats }: { stats: VaultStats }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const parts = [
    ...DASHBOARD_STAGES.map((s) => ({ key: s, label: STATUS_INFO[s].label, color: STATUS_INFO[s].color, count: stats.byStage[s] })),
    ...(stats.other ? [{ key: "other", label: "Other", color: "var(--muted)", count: stats.other }] : []),
  ];
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
          {stats.total > 0 &&
            parts.map((p) => {
              const len = (p.count / stats.total) * C;
              const el = (
                <circle key={p.key} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16"
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none">{stats.total}</p>
            <p className="mt-1 text-xs text-muted">ideas</p>
          </div>
        </div>
      </div>
      <ul className="min-w-[10rem] flex-1 space-y-2.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-3">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="tabular-nums font-semibold">{p.count}</span>
            <span className="w-10 text-right tabular-nums text-muted">
              {stats.total ? Math.round((p.count / stats.total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard({ stats }: { stats: VaultStats }) {
  return (
    <section id="overview" aria-labelledby="overview-heading" className="mb-8 scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="overview-heading" className="text-2xl font-bold tracking-tight">Workspace overview</h2>
          <p className="mt-1 text-sm text-muted">Capture ideas and move them from raw to done. Figures refresh each time the vault loads.</p>
        </div>
        <a href="#ideas" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm shadow-accent/30 transition hover:brightness-105">
          + New idea
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ideas" value={stats.total} note={`+${stats.thisWeek} in the last 7 days`} color="var(--accent)" />
        <StatCard label="Exploring" value={stats.byStage.exploring} note={STATUS_INFO.exploring.blurb} color={STATUS_INFO.exploring.color} />
        <StatCard label="Building" value={stats.byStage.building} note={STATUS_INFO.building.blurb} color={STATUS_INFO.building.color} />
        <StatCard label="Done" value={stats.byStage.done} note={STATUS_INFO.done.blurb} color={STATUS_INFO.done.color} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className={card}>
          <h3 className={heading}>Idea activity</h3>
          <p className="mb-3 text-xs text-muted">Ideas captured per month, last 6 months (UTC)</p>
          <ActivityChart months={stats.months} />
        </div>
        <div className={card}>
          <h3 className={`${heading} mb-4`}>Ideas by stage</h3>
          <StageDonut stats={stats} />
        </div>
      </div>
    </section>
  );
}
