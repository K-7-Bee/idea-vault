"use client";

import { useEffect } from "react";

// Removes public image copies left behind when a project left the public site from the editor
// (the database drops the snapshot itself; stored files need this). Silent and best-effort.
export function requestImageCleanup() {
  void fetch("/api/showcase/cleanup", { method: "POST" }).catch(() => {});
}

export default function OrphanCleanup() {
  useEffect(() => { requestImageCleanup(); }, []);
  return null;
}
