"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canvasForImage, describeDrawing, emptyDrawing } from "@/lib/drawing/format";
import { createAnnotation } from "@/lib/drawing/store";
import { isImage, thumbUrl, type ProjectFile } from "@/lib/project-files";
import type { Writer } from "../record-section";
import DrawingView from "./drawing-view";
import type { DrawingSummary } from "./sketch-strip";
import { Thumb } from "../thumb";

// Phase 7B: annotation layers on project images. The image file is never changed: the marks are a
// separate drawing (one per image) shown over it, and an export makes a new file.
export type Annotations = { forFile: (fileId: string) => DrawingSummary | undefined; start: (file: ProjectFile) => void; projectId: string };

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

export function useAnnotations({ ownerId, projectId, writer, drawings }: {
  ownerId: string; projectId: string; writer: Writer; drawings: DrawingSummary[];
}): Annotations {
  const router = useRouter();
  const forFile = (fileId: string) => drawings.find((d) => d.base_file_id === fileId);
  function start(file: ProjectFile) {
    const existing = forFile(file.id);
    if (existing) { router.push(`/vault/projects/${projectId}/drawings/${existing.id}`); return; }
    void writer.run(async (client) => {
      const size = await imageSize(thumbUrl(file)).catch(() => null);
      if (!size) {
        return { ok: false as const, reason: "failed" as const, message: `"${file.name}" couldn't be loaded from Google Drive, so it can't be annotated right now. Nothing was changed.` };
      }
      const result = await createAnnotation(client, ownerId, projectId, { baseFileId: file.id, data: emptyDrawing(canvasForImage(size.w, size.h)) });
      if (!result.ok) {
        return { ok: false as const, reason: "failed" as const, message: result.reason === "invalid"
          ? `"${file.name}" already has annotations (perhaps from another tab). Reload to open them.` : result.message };
      }
      return { ok: true as const, value: result.row };
    }, null, (row) => router.push(`/vault/projects/${projectId}/drawings/${row.id}`));
  }
  return { forFile, start, projectId };
}

const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

/** The Annotate / Edit annotations control for one image (nothing for other file types). */
export function AnnotateButton({ file, annotations, disabled }: { file: ProjectFile; annotations?: Annotations; disabled: boolean }) {
  if (!annotations || !isImage(file) || file.state !== "ok") return null;
  const existing = annotations.forFile(file.id);
  return existing ? (
    <Link href={`/vault/projects/${annotations.projectId}/drawings/${existing.id}`} className={`${small} inline-block justify-self-start`}
      aria-label={`Edit annotations on ${file.name}`}>Edit annotations</Link>
  ) : (
    <button type="button" className={`${small} justify-self-start`} disabled={disabled} onClick={() => annotations.start(file)}
      aria-label={`Annotate ${file.name}`}>Annotate</button>
  );
}

/** An image thumbnail with its annotation marks over it, a mark that it's annotated, and a toggle. */
export function AnnotatedThumb({ file, alt, className, annotations }: {
  file: ProjectFile; alt: string; className: string; annotations?: Annotations;
}) {
  const [show, setShow] = useState(true);
  const layer = annotations?.forFile(file.id);
  if (!layer || !layer.preview.items.length) return <Thumb file={file} alt={alt} className={className} />;
  return (
    <div className="relative">
      <Thumb file={file} alt={alt} className={className} />
      {show && (
        <DrawingView data={layer.preview} overlay label={`Annotations: ${describeDrawing(layer.preview, file.name)}`}
          className={`pointer-events-none absolute inset-0 h-full w-full ${className.includes("rounded-md") ? "rounded-md" : "rounded-lg"}`} />
      )}
      <button type="button" aria-pressed={show} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow((v) => !v); }}
        className="absolute left-1 top-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white"
        aria-label={show ? `Hide annotations on ${file.name}` : `Show annotations on ${file.name}`}>
        {show ? "Annotated" : "Original"}
      </button>
    </div>
  );
}
