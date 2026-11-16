// Read-only summaries for the Vault dashboard, computed from the idea index the page already loads.
// Counts use the stored stage values exactly (migration 005: exploring/analyzing/building/completed).

export const DASHBOARD_STAGES = ["exploring", "analyzing", "building", "completed"] as const;
export type DashboardStage = (typeof DASHBOARD_STAGES)[number];

export type IdeaMeta = { status: string; created_at: string };

export type VaultStats = {
  total: number;
  thisWeek: number;
  byStage: Record<DashboardStage, number>;
  // Unknown statuses are counted separately so totals always reconcile.
  other: number;
  // Oldest first. Months are calendar months in UTC.
  months: { key: string; label: string; count: number }[];
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTH_LABEL = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

export function vaultStats(rows: IdeaMeta[], now: Date, monthCount = 6): VaultStats {
  const byStage = { exploring: 0, analyzing: 0, building: 0, completed: 0 } as Record<DashboardStage, number>;
  let other = 0;
  let thisWeek = 0;

  const months: VaultStats["months"] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: d.toISOString().slice(0, 7), label: MONTH_LABEL.format(d), count: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  for (const row of rows) {
    if ((DASHBOARD_STAGES as readonly string[]).includes(row.status)) byStage[row.status as DashboardStage]++;
    else other++;

    const time = new Date(row.created_at).getTime();
    if (Number.isNaN(time)) continue;
    if (time > now.getTime() - WEEK && time <= now.getTime()) thisWeek++;
    const index = monthIndex.get(new Date(time).toISOString().slice(0, 7));
    if (index !== undefined) months[index].count++;
  }

  return { total: rows.length, thisWeek, byStage, other, months };
}
