// Each status is a folder with its own colour and a little personality.
export const STATUS_INFO: Record<string, { color: string; label: string; blurb: string }> = {
  exploring: { color: "var(--status-exploring)", label: "Exploring", blurb: "Fresh sparks" },
  analyzing: { color: "var(--status-analyzing)", label: "Analyzing", blurb: "Poking at it" },
  building: { color: "var(--status-building)", label: "Building", blurb: "On the workbench" },
  completed: { color: "var(--status-completed)", label: "Completed", blurb: "Shipped!" },
};

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_INFO).map(([s, info]) => [s, info.color]),
);
