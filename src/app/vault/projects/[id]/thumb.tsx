"use client";

import { useState } from "react";
import { UNAVAILABLE_TEXT, thumbUrl, type ProjectFile } from "@/lib/project-files";

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
