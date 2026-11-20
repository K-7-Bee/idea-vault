"use client";

import { useRef, useState } from "react";
import { UNAVAILABLE_TEXT, isImage, projectFileMeta, projectFileView, type ProjectFile } from "@/lib/project-files";
import type { Row } from "@/lib/workspace";
import type { Writer } from "./record-section";
import { NO_LINK, type FileActions, type Link } from "./file-actions";
import { Thumb } from "./story-image";

const button = "rounded-xl border border-line px-3 py-2 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

type Kind = "entry" | "component" | "character" | "unit";
type Choice = { kind: Kind; id: string; label: string };
const COLUMN: Record<Kind, keyof ProjectFile> = { entry: "entry_id", component: "component_id", character: "character_id", unit: "unit_id" };
const LINK_KEY: Record<Kind, keyof Link> = { entry: "entryId", component: "componentId", character: "characterId", unit: "unitId" };

function choiceValue(file: ProjectFile) {
  const kind = (Object.keys(COLUMN) as Kind[]).find((k) => file[COLUMN[k]]);
  return kind ? `${kind}:${String(file[COLUMN[kind]])}` : "";
}
function parseChoice(value: string): Link {
  const [kind, id] = value.split(":") as [Kind | "", string];
  return kind ? { ...NO_LINK, [LINK_KEY[kind]]: id } : NO_LINK;
}
const UNIT_LABEL: Record<string, string> = { season: "Season", episode: "Episode", scene: "Scene", shot: "Shot" };

// Phase 3C/3D: files on a project, kept in the owner's Google Drive. Uploads go to Projects/<title>;
// linked files stay where they are. Unlinking never deletes anything from Drive. Story projects
// also get an image-first Gallery, filterable by character or structure item.
export default function ProjectFiles({ files, entries, components, characters, units, writer, driveUploads, actions }: {
  files: ProjectFile[]; entries: Row[]; components: Row[]; characters: Row[]; units: Row[];
  writer: Writer; driveUploads: boolean; actions: FileActions;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [attachTo, setAttachTo] = useState("");
  const story = characters.length > 0 || units.length > 0 || files.some((f) => f.character_id || f.unit_id);
  const [view, setView] = useState<"list" | "gallery">("list");
  const [filter, setFilter] = useState("");
  const disabled = writer.busy || !writer.online;
  const choices: Choice[] = [
    ...entries.map((e) => ({ kind: "entry" as const, id: e.id, label: `Notebook: ${String(e.title ?? "Untitled")}` })),
    ...components.map((c) => ({ kind: "component" as const, id: c.id, label: `Component: ${String(c.name ?? "Untitled")}` })),
    ...characters.map((c) => ({ kind: "character" as const, id: c.id, label: `Character: ${String(c.name ?? "Untitled")}` })),
    ...units.map((u) => ({ kind: "unit" as const, id: u.id, label: `${UNIT_LABEL[String(u.kind)] ?? "Item"}: ${String(u.title ?? "Untitled")}` })),
  ];
  const labelFor = (file: ProjectFile) => choices.find((c) => `${c.kind}:${c.id}` === choiceValue(file))?.label ?? null;
  const images = files.filter(isImage);
  const shown = filter ? images.filter((f) => choiceValue(f) === filter) : images;

  const picker = (value: string, onChange: (v: string) => void, extra: { label: string; className: string; disabled?: boolean }) => (
    <select value={value} disabled={extra.disabled} onChange={(e) => onChange(e.target.value)}
      aria-label={extra.label} className={extra.className}>
      <option value="">The project (no record)</option>
      {choices.map((c) => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.label}</option>)}
    </select>
  );

  return (
    <section aria-labelledby="files-heading" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="files-heading" className="text-lg font-semibold">Files</h3>
          <p className="mt-1 text-sm text-muted">
            Kept in your Google Drive. Uploads go to <span className="font-medium">Projects/</span> inside your Vault folder; files linked from
            Drive stay where they are. Unlinking never deletes anything from Drive.
          </p>
        </div>
        {story && (
          <div role="group" aria-label="Files view" className="flex gap-1 rounded-xl border border-line p-1 text-sm">
            {(["list", "gallery"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 ${view === v ? "bg-accent text-on-accent" : "hover:bg-background"}`}>
                {v === "list" ? "List" : "Gallery"}
              </button>
            ))}
          </div>
        )}
      </div>

      {driveUploads ? (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Attach new files to</span>
            {picker(attachTo, setAttachTo, { label: "Attach new files to", className: "rounded-xl border border-line bg-background px-3 py-2" })}
          </label>
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" multiple hidden aria-label="Files to upload"
              onChange={(e) => { const chosen = e.target.files ? [...e.target.files] : []; e.target.value = ""; actions.upload(chosen, parseChoice(attachTo)); }} />
            <button type="button" className={button} disabled={disabled} onClick={() => input.current?.click()}>Upload files</button>
            <button type="button" className={button} disabled={disabled} onClick={() => actions.linkFromDrive(parseChoice(attachTo))}>Link from Google Drive</button>
            {files.length > 0 && <button type="button" className={button} disabled={disabled} onClick={actions.checkFiles}>Check files</button>}
          </div>
          {actions.progress && <p role="status" className="text-sm text-muted">{actions.progress}</p>}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Adding files is turned off. Linked files remain available.</p>
      )}

      {view === "gallery" ? (
        <section aria-label="Gallery" className="grid gap-3">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Gallery filter"
              className="rounded-xl border border-line bg-background px-3 py-1.5">
              <option value="">All images</option>
              {choices.filter((c) => c.kind === "character" || c.kind === "unit").map((c) => (
                <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.label}</option>
              ))}
            </select>
          </label>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">
              {images.length ? "No images here yet." : "No images yet. Add one from a character or a scene/shot card, or upload here."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((file) => {
                const record = labelFor(file);
                return (
                  <li key={file.id} className="grid content-start gap-1 rounded-xl border border-line bg-card p-2">
                    <a href={projectFileView(file).href} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`}>
                      <Thumb file={file} alt={file.name} className="aspect-square w-full rounded-lg" />
                    </a>
                    <p className="break-words text-xs font-medium">{file.name}</p>
                    <p className="text-xs text-muted">{record ?? "Not attached"}{file.is_main ? " · Main image" : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : files.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">No files yet.</p>
      ) : (
        <ul className="grid gap-3">
          {files.map((file) => {
            const fileView = projectFileView(file);
            const record = labelFor(file);
            return (
              <li key={file.id} className="rounded-xl border border-line bg-card p-3 shadow-sm">
                {file.state === "ok" && fileView.preview === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileView.href} alt={file.name} className="mb-2 max-h-48 rounded-lg border border-line object-contain" />
                )}
                {file.state === "ok" && fileView.preview === "audio" && <audio controls preload="none" src={fileView.href} className="mb-2 w-full" />}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a href={fileView.href} target="_blank" rel="noreferrer" className="min-w-0 break-words font-medium underline-offset-4 hover:underline">
                    {file.name}
                  </a>
                  <span className="text-xs text-muted">
                    {projectFileMeta(file)}{fileView.opensInDrive ? " · Open in Google Drive" : ""}
                  </span>
                </div>
                {file.state === "unavailable" && (
                  <p role="status" className="mt-1 text-sm text-danger">
                    Unavailable in Drive: {UNAVAILABLE_TEXT[file.state_reason ?? "missing"]}. The link is kept; unlink it if it&apos;s no longer needed.
                  </p>
                )}
                {record && <p className="mt-1 text-xs text-muted">Attached to {record}{file.is_main ? " · Main image" : ""}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-muted">Attach to</span>
                    {picker(choiceValue(file), (v) => actions.attach(file, parseChoice(v)),
                      { label: `Attach ${file.name} to`, disabled, className: "max-w-[14rem] rounded-lg border border-line bg-background px-2 py-1" })}
                  </label>
                  <button type="button" className={`${small} text-danger`} disabled={disabled} onClick={() => actions.unlink(file)}>Unlink</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
