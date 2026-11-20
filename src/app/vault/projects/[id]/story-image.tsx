"use client";

import { useRef, useState } from "react";
import { UNAVAILABLE_TEXT, imagesFor, projectFileView, thumbUrl, type ImageOwner, type ProjectFile } from "@/lib/project-files";
import type { FileActions } from "./file-actions";

const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

// A Drive image preview with a placeholder: shown while the record is fine but the picture isn't
// (unavailable in Drive, or it failed to load). The card and its text never depend on it.
export function Thumb({ file, className, alt }: { file: ProjectFile; className: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (file.state === "unavailable" || failed) {
    const reason = file.state === "unavailable" ? UNAVAILABLE_TEXT[file.state_reason ?? "missing"] : "Couldn't load from Google Drive";
    return (
      <div role="img" aria-label={`Image unavailable: ${file.name}`} title={file.name}
        className={`${className} flex flex-col items-center justify-center gap-1 border border-dashed border-line bg-background p-2 text-center text-xs text-muted`}>
        <span aria-hidden className="text-lg">▨</span>
        <span>Image unavailable</span>
        <span>{reason}</span>
      </div>
    );
  }
  return (
    // Previews stream through the Vault's owner-checked route; next/image can't proxy those.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbUrl(file)} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)}
      className={`${className} border border-line bg-background object-cover`} />
  );
}

// Images on one character (portrait) or structure item (16:9 frame): the main image large, others
// in a strip with "Make main", and Add image (upload or link from Drive) attached in one step.
export default function StoryImages({ owner, label, files, actions, canAdd, disabled, shape }: {
  owner: ImageOwner; label: string; files: ProjectFile[]; actions: FileActions; canAdd: boolean; disabled: boolean;
  shape: "portrait" | "frame";
}) {
  const input = useRef<HTMLInputElement>(null);
  const images = imagesFor(files, owner);
  const [main, ...others] = images;
  const link = owner.kind === "character" ? { characterId: owner.id } : { unitId: owner.id };
  const box = shape === "portrait" ? "aspect-[3/4] w-full max-w-[12rem]" : "aspect-video w-full";

  return (
    <div className="mb-2 grid gap-2">
      {main ? (
        <a href={projectFileView(main).href} target="_blank" rel="noreferrer" className={box} aria-label={`Open ${main.name}`}>
          <Thumb file={main} alt={`${label}: ${main.name}`} className="h-full w-full rounded-lg" />
        </a>
      ) : (
        <div aria-hidden className={`${box} rounded-lg border border-dashed border-line bg-background`} />
      )}
      {others.length > 0 && (
        <ul aria-label={`More images of ${label}`} className="flex flex-wrap gap-2">
          {others.map((f) => (
            <li key={f.id} className="grid w-20 gap-1">
              <a href={projectFileView(f).href} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`}>
                <Thumb file={f} alt={`${label}: ${f.name}`} className="aspect-square w-20 rounded-md" />
              </a>
              {canAdd && (
                <button type="button" className={small} disabled={disabled} onClick={() => actions.makeMain(f)}
                  aria-label={`Make ${f.name} the main image of ${label}`}>Make main</button>
              )}
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
