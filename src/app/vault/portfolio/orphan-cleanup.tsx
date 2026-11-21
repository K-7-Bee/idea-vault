"use client";

import { useEffect } from "react";

// Removes public image copies left behind when a project left the public site from the editor
// (the database drops the snapshot itself; stored files need this). Silent and best-effort.
export function requestImageCleanup() {
  void fetch("/api/showcase/cleanup", { method: "POST" }).catch(() => {});
}

// Phase 4C: the same for public copies of library files the published profile no longer uses.
export function requestProfileFileCleanup(): Promise<number> {
  return fetch("/api/profile/cleanup", { method: "POST" })
    .then((r) => r.ok ? r.json() : null).then((b: { removed?: number } | null) => b?.removed ?? 0).catch(() => 0);
}

export default function OrphanCleanup() {
  useEffect(() => { requestImageCleanup(); void requestProfileFileCleanup(); }, []);
  return null;
}
