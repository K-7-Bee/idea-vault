"use client";

import { useState } from "react";
import { DRIVE_MAX_BYTES, formatSize } from "@/lib/ideas";
import { DriveOffline, DriveUnavailable, uploadToDrive } from "@/lib/drive/upload";
import { PickerUnavailable, pickFromDrive, type PickerConfig } from "@/lib/drive/picker";
import type { ProjectFile } from "@/lib/project-files";
import type { Outcome } from "@/lib/workspace";
import type { Writer } from "./record-section";

// Project file actions shared by the Files tab (3C) and story image cards (3D). Every action runs
// through the workspace writer (signed-in check, one at a time, online only).

export type Link = { entryId?: string | null; componentId?: string | null; characterId?: string | null; unitId?: string | null };
export const NO_LINK: Required<Link> = { entryId: null, componentId: null, characterId: null, unitId: null };

export const RECONNECT = "Google Drive isn't connected. Connect or reconnect it in Settings, then try again. Nothing was sent.";
const failed = (message: string): Outcome<never> => ({ ok: false, reason: "failed", message });

async function api<T>(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
}

export type FileActions = ReturnType<typeof useFileActions>;

export function useFileActions({ ownerId, projectId, writer, picker, setFiles }: {
  ownerId: string; projectId: string; writer: Writer; picker: PickerConfig;
  setFiles: (change: (files: ProjectFile[]) => ProjectFile[]) => void;
}) {
  const [progress, setProgress] = useState<string | null>(null);

  function upload(chosen: File[], link: Link = NO_LINK) {
    if (!chosen.length) return;
    const tooBig = chosen.filter((f) => f.size > DRIVE_MAX_BYTES).map((f) => f.name);
    if (tooBig.length) {
      writer.setMessage({ text: `Too big (max ${formatSize(DRIVE_MAX_BYTES)}): ${tooBig.join(", ")}. Nothing was sent.`, error: true });
      return;
    }
    void writer.run(async () => {
      const added: ProjectFile[] = [];
      try {
        for (const file of chosen) {
          const row = await uploadToDrive<ProjectFile>({ ownerId, projectId, fileId: crypto.randomUUID(), file, ...link }, {
            onProgress: (sent, total) => setProgress(sent >= total ? null : `Uploading ${file.name} to Google Drive… ${Math.floor((sent / total) * 100)}%`),
          });
          added.push(row);
        }
        return { ok: true, value: added };
      } catch (error) {
        if (added.length) setFiles((current) => [...added, ...current]);
        const text = error instanceof DriveUnavailable ? RECONNECT
          : error instanceof DriveOffline ? "The connection dropped. Files already uploaded are listed; choose the rest again to retry."
          : error instanceof Error ? error.message : "The upload couldn't finish.";
        return failed(added.length ? `${added.length} uploaded. ${text}` : text);
      } finally {
        setProgress(null);
      }
    }, `Uploaded to Google Drive: ${chosen.map((f) => f.name).join(", ")}.`, (added) => setFiles((current) => [...added, ...current]));
  }

  function linkFromDrive(link: Link = NO_LINK, mode: "files" | "images" = "files") {
    void writer.run(async () => {
      const token = await api<{ token?: string }>("/api/drive/picker-token", "POST");
      if (!token.ok || !token.body.token) return failed(RECONNECT);
      let ids: string[];
      try {
        ids = await pickFromDrive(picker, token.body.token, mode);
      } catch (error) {
        return failed(error instanceof PickerUnavailable ? error.message : "The Google Drive picker couldn't open.");
      }
      if (!ids.length) return { ok: true, value: { linked: [] as ProjectFile[], skipped: [] as { reason: string }[] } };
      const result = await api<{ linked: ProjectFile[]; skipped: { id: string; reason: string }[] }>("/api/drive/project-files", "POST",
        { projectId, driveFileIds: ids, ...link });
      if (!result.ok) return failed(result.body.error === "disabled" ? "Linking Drive files is turned off." : RECONNECT);
      return { ok: true, value: result.body };
    }, null, ({ linked, skipped }) => {
      setFiles((current) => [...linked, ...current]);
      const already = skipped.filter((s) => s.reason === "already_linked").length;
      const other = skipped.length - already;
      const parts = [linked.length ? `Linked ${linked.length} file${linked.length === 1 ? "" : "s"} from Google Drive.` : "Nothing new was linked."];
      if (already) parts.push(`${already} already linked to this project (use "Attach to" in Files to move it here).`);
      if (other) parts.push(`${other} couldn't be linked (folders, trashed files, or files the Vault can't see).`);
      writer.setMessage({ text: parts.join(" "), error: other > 0 });
    });
  }

  function checkFiles() {
    void writer.run(async () => {
      const result = await api<{ files: ProjectFile[]; unchecked: number; renamed?: number; problems?: { name: string; reason: string }[] }>(
        "/api/drive/project-files/check", "POST", { projectId });
      if (result.ok) return { ok: true, value: result.body };
      const reason = result.body.error;
      return failed(reason === "not_connected" || reason === "reconnect" ? RECONNECT
        : `Check files failed (${reason ?? `HTTP ${result.status}`}). Nothing was changed. Try again in a minute.`);
    }, null, ({ files: fresh, unchecked, renamed = 0, problems = [] }) => {
      setFiles(() => fresh);
      const gone = fresh.filter((f) => f.state === "unavailable").length;
      const parts = [`Checked with Google Drive. ${gone ? `${gone} unavailable.` : "All files are available."}`];
      if (renamed) parts.push(`${renamed} name${renamed === 1 ? "" : "s"} updated from Drive.`);
      if (unchecked) parts.push(`${unchecked} couldn't be checked: ${problems.map((p) => `${p.name} (${p.reason})`).join(", ")}.`);
      // The result stays until dismissed, so it can't be missed.
      writer.setMessage({ text: parts.join(" "), error: gone > 0 || unchecked > 0, keep: true });
    });
  }

  function attach(file: ProjectFile, link: Link) {
    void writer.run(async () => {
      const result = await api<{ file: ProjectFile }>(`/api/drive/project-files/${file.id}`, "PATCH", { ...NO_LINK, ...link });
      return result.ok ? { ok: true, value: result.body.file } : failed("The file couldn't be attached. Refresh and try again.");
    }, "Saved.", (row) => setFiles((current) => current.map((f) => (f.id === row.id ? row : f))));
  }

  function makeMain(file: ProjectFile) {
    void writer.run(async () => {
      const result = await api<{ files: ProjectFile[] }>(`/api/drive/project-files/${file.id}`, "PATCH", { main: true });
      if (result.ok) return { ok: true, value: result.body.files };
      return failed(result.body.error === "busy" ? "Another change was saving at the same time. Try again."
        : "The main image couldn't be changed. Refresh and try again.");
    }, `"${file.name}" is now the main image.`, (fresh) => setFiles(() => fresh));
  }

  function unlink(file: ProjectFile) {
    if (!window.confirm(`Remove "${file.name}" from this project? The file itself stays in your Google Drive.`)) return;
    void writer.run(async () => {
      const result = await api(`/api/drive/project-files/${file.id}`, "DELETE");
      if (result.status === 409 && result.body.error === "annotated") {
        return failed(`"${file.name}" has annotations. Open it with "Edit annotations" and choose "Delete annotations" first; nothing was removed.`);
      }
      return result.ok ? { ok: true, value: file.id } : failed("The file couldn't be removed. Try again.");
    }, `Removed "${file.name}" from this project. It is still in your Google Drive.`, (id) => setFiles((current) => current.filter((f) => f.id !== id)));
  }

  return { progress, upload, linkFromDrive, checkFiles, attach, makeMain, unlink };
}
