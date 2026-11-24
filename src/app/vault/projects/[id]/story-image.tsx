"use client";

import { useRef } from "react";
import { imagesFor, projectFileView, type ImageOwner, type ProjectFile } from "@/lib/project-files";
import { Thumb } from "./thumb";
import { AnnotateButton, AnnotatedThumb, type Annotations } from "./drawings/annotate";
import type { FileActions } from "./file-actions";

const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

export { Thumb };

// Images on one character (portrait) or structure item (16:9 frame): the main image large, others
// in a strip with "Make main" and "Remove" (the Drive file is kept), and Add image (upload or link
// from Drive) attached in one step.
export default function StoryImages({ owner, label, files, actions, canAdd, disabled, shape, annotations }: {
  owner: ImageOwner; label: string; files: ProjectFile[]; actions: FileActions; canAdd: boolean; disabled: boolean;
  shape: "portrait" | "frame";
  // Phase 7B: annotation layers over these images.
  annotations?: Annotations;
}) {
  const input = useRef<HTMLInputElement>(null);
  const images = imagesFor(files, owner);
  const [main, ...others] = images;
  const link = owner.kind === "character" ? { characterId: owner.id } : { unitId: owner.id };
  const box = shape === "portrait" ? "aspect-[3/4] w-full max-w-[12rem]" : "aspect-video w-full";

  return (
    <div className="mb-2 grid gap-2">
      {main ? (
        <>
          <a href={projectFileView(main).href} target="_blank" rel="noreferrer" className={box} aria-label={`Open ${main.name}`}>
            <AnnotatedThumb file={main} alt={`${label}: ${main.name}`} className="h-full w-full rounded-lg" annotations={annotations} />
          </a>
          <div className="flex flex-wrap gap-1.5">
            <AnnotateButton file={main} annotations={annotations} disabled={disabled} />
            <button type="button" className={`${small} text-danger`} disabled={disabled} onClick={() => actions.unlink(main)}
              aria-label={`Remove ${main.name} from ${label}`}>Remove</button>
          </div>
        </>
      ) : (
        <div aria-hidden className={`${box} rounded-lg border border-dashed border-line bg-background`} />
      )}
      {others.length > 0 && (
        <ul aria-label={`More images of ${label}`} className="flex flex-wrap gap-2">
          {others.map((f) => (
            <li key={f.id} className="grid w-20 gap-1">
              <a href={projectFileView(f).href} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`}>
                <AnnotatedThumb file={f} alt={`${label}: ${f.name}`} className="aspect-square w-20 rounded-md" annotations={annotations} />
              </a>
              <AnnotateButton file={f} annotations={annotations} disabled={disabled} />
              {canAdd && (
                <button type="button" className={small} disabled={disabled} onClick={() => actions.makeMain(f)}
                  aria-label={`Make ${f.name} the main image of ${label}`}>Make main</button>
              )}
              <button type="button" className={`${small} text-danger`} disabled={disabled} onClick={() => actions.unlink(f)}
                aria-label={`Remove ${f.name} from ${label}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="flex flex-wrap gap-1.5">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden aria-label={`Images for ${label}`}
            onChange={(e) => { const chosen = e.target.files ? [...e.target.files] : []; e.target.value = ""; actions.upload(chosen, link); }} />
          <button type="button" className={small} disabled={disabled} onClick={() => input.current?.click()}
            aria-label={`Add image to ${label}`}>+ Add image</button>
          <button type="button" className={small} disabled={disabled} onClick={() => actions.linkFromDrive(link, "images")}
            aria-label={`Link image from Drive to ${label}`}>Link from Drive</button>
        </div>
      )}
    </div>
  );
}
