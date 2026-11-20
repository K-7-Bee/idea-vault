"use client";

import { useRef, useState } from "react";
import { DRIVE_MAX_BYTES, formatSize } from "@/lib/ideas";
import { DriveOffline, DriveUnavailable, uploadToDrive } from "@/lib/drive/upload";
import { PickerUnavailable, pickFromDrive, type PickerConfig } from "@/lib/drive/picker";
import { UNAVAILABLE_TEXT, projectFileMeta, projectFileView, type ProjectFile } from "@/lib/project-files";
import type { Outcome, Row } from "@/lib/workspace";
import type { Writer } from "./record-section";

const button = "rounded-xl border border-line px-3 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";
const RECONNECT = "Google Drive isn't connected. Connect or reconnect it in Settings, then try again. Nothing was sent.";

type Choice = { kind: "entry" | "component"; id: string; label: string };

function choiceValue(file: Pick<ProjectFile, "entry_id" | "component_id">) {
  return file.entry_id ? `entry:${file.entry_id}` : file.component_id ? `component:${file.component_id}` : "";
}
function parseChoice(value: string): { entryId: string | null; componentId: string | null } {
  const [kind, id] = value.split(":");
  return { entryId: kind === "entry" ? id : null, componentId: kind === "component" ? id : null };
}
const failed = (message: string): Outcome<never> => ({ ok: false, reason: "failed", message });

async function api<T>(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
}

// Phase 3C: files on a project, kept in the owner's Google Drive. Uploads go to Projects/<title>;
// linked files stay where they are. Unlinking never deletes anything from Drive.
export default function ProjectFiles({ ownerId, projectId, files, setFiles, entries, components, writer, driveUploads, picker }: {
  ownerId: string; projectId: string; files: ProjectFile[]; setFiles: (change: (files: ProjectFile[]) => ProjectFile[]) => void;
  entries: Row[]; components: Row[]; writer: Writer; driveUploads: boolean; picker: PickerConfig;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [attachTo, setAttachTo] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const disabled = writer.busy || !writer.online;
  const choices: Choice[] = [
    ...entries.map((e) => ({ kind: "entry" as const, id: e.id, label: `Notebook: ${String(e.title ?? "Untitled")}` })),
    ...components.map((c) => ({ kind: "component" as const, id: c.id, label: `Component: ${String(c.name ?? "Untitled")}` })),
  ];
  const labelFor = (file: ProjectFile) => choices.find((c) => `${c.kind}:${c.id}` === choiceValue(file))?.label ?? null;

  function upload(list: FileList | null) {
    const chosen = list ? [...list] : [];
    if (input.current) input.current.value = "";
    if (!chosen.length) return;
    const tooBig = chosen.filter((f) => f.size > DRIVE_MAX_BYTES).map((f) => f.name);
    if (tooBig.length) {
      writer.setMessage({ text: `Too big (max ${formatSize(DRIVE_MAX_BYTES)}): ${tooBig.join(", ")}. Nothing was sent.`, error: true });
      return;
    }
    const link = parseChoice(attachTo);
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

  function linkFromDrive() {
    const link = parseChoice(attachTo);
    void writer.run(async () => {
      const token = await api<{ token?: string }>("/api/drive/picker-token", "POST");
      if (!token.ok || !token.body.token) return failed(RECONNECT);
      let ids: string[];
      try {
        ids = await pickFromDrive(picker, token.body.token, "files");
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
      if (already) parts.push(`${already} already linked.`);
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

  function attach(file: ProjectFile, value: string) {
    void writer.run(async () => {
      const result = await api<{ file: ProjectFile }>(`/api/drive/project-files/${file.id}`, "PATCH", parseChoice(value));
      return result.ok ? { ok: true, value: result.body.file } : failed("The file couldn't be attached. Refresh and try again.");
    }, "Saved.", (row) => setFiles((current) => current.map((f) => (f.id === row.id ? row : f))));
  }

  function unlink(file: ProjectFile) {
    if (!window.confirm(`Unlink "${file.name}" from this project? It stays in your Google Drive.`)) return;
    void writer.run(async () => {
      const result = await api(`/api/drive/project-files/${file.id}`, "DELETE");
      return result.ok ? { ok: true, value: file.id } : failed("The file couldn't be unlinked. Try again.");
    }, `Unlinked "${file.name}". It is still in your Google Drive.`, (id) => setFiles((current) => current.filter((f) => f.id !== id)));
  }

  return (
    <section aria-labelledby="files-heading" className="grid gap-4">
      <div>
        <h3 id="files-heading" className="text-lg font-semibold">Files</h3>
        <p className="mt-1 text-sm text-muted">
          Kept in your Google Drive. Uploads go to <span className="font-medium">Projects/</span> inside your Vault folder; files linked from
          Drive stay where they are. Unlinking never deletes anything from Drive.
        </p>
      </div>

      {driveUploads ? (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Attach new files to</span>
            <select value={attachTo} onChange={(e) => setAttachTo(e.target.value)} className="rounded-xl border border-line bg-background px-3 py-2">
              <option value="">The project (no record)</option>
              {choices.map((c) => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" multiple hidden aria-label="Files to upload" onChange={(e) => upload(e.target.files)} />
            <button type="button" className={button} disabled={disabled} onClick={() => input.current?.click()}>Upload files</button>
            <button type="button" className={button} disabled={disabled} onClick={linkFromDrive}>Link from Google Drive</button>
            {files.length > 0 && <button type="button" className={button} disabled={disabled} onClick={checkFiles}>Check files</button>}
          </div>
          {progress && <p role="status" className="text-sm text-muted">{progress}</p>}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Adding files is turned off. Linked files remain available.</p>
      )}

      {files.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">No files yet.</p>
      ) : (
        <ul className="grid gap-3">
          {files.map((file) => {
            const view = projectFileView(file);
            const record = labelFor(file);
            return (
              <li key={file.id} className="rounded-xl border border-line bg-card p-3 shadow-sm">
                {file.state === "ok" && view.preview === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={view.href} alt={file.name} className="mb-2 max-h-48 rounded-lg border border-line object-contain" />
                )}
                {file.state === "ok" && view.preview === "audio" && <audio controls preload="none" src={view.href} className="mb-2 w-full" />}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a href={view.href} target="_blank" rel="noreferrer" className="min-w-0 break-words font-medium underline-offset-4 hover:underline">
                    {file.name}
                  </a>
                  <span className="text-xs text-muted">
                    {projectFileMeta(file)}{view.opensInDrive ? " · Open in Google Drive" : ""}
                  </span>
                </div>
                {file.state === "unavailable" && (
                  <p role="status" className="mt-1 text-sm text-danger">
                    Unavailable in Drive: {UNAVAILABLE_TEXT[file.state_reason ?? "missing"]}. The link is kept; unlink it if it&apos;s no longer needed.
                  </p>
                )}
                {record && <p className="mt-1 text-xs text-muted">Attached to {record}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-muted">Attach to</span>
                    <select value={choiceValue(file)} disabled={disabled} onChange={(e) => attach(file, e.target.value)}
                      aria-label={`Attach ${file.name} to`} className="max-w-[14rem] rounded-lg border border-line bg-background px-2 py-1">
                      <option value="">The project (no record)</option>
                      {choices.map((c) => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className={`${small} text-danger`} disabled={disabled} onClick={() => unlink(file)}>Unlink</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
