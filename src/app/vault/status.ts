// Each status is a folder with its own colour and a little personality.
export const STATUS_INFO: Record<string, { color: string; label: string; blurb: string }> = {
  raw: { color: "var(--status-raw)", label: "Raw", blurb: "Fresh sparks" },
  exploring: { color: "var(--status-exploring)", label: "Exploring", blurb: "Poking at it" },
  building: { color: "var(--status-building)", label: "Building", blurb: "On the workbench" },
  done: { color: "var(--status-done)", label: "Done", blurb: "Shipped!" },
};

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_INFO).map(([s, info]) => [s, info.color]),
);
