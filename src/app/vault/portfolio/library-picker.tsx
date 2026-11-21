"use client";

import { useId, useRef } from "react";
import { sizeLabel, type LibraryKind } from "@/lib/library";
import type { LibraryItem } from "@/lib/library-server";

const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

// A button that opens the device's file chooser. The input itself is visually hidden but labelled,
// so it stays reachable for assistive technology and for tests.
export function UploadButton({ kind, disabled, onFile, label = "Upload from this device" }: {
  kind?: LibraryKind; disabled?: boolean; onFile: (file: File) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const accept = kind === "pdf" ? "application/pdf,.pdf" : kind === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp";
  return (
    <>
      <button type="button" className={small} disabled={disabled} onClick={() => input.current?.click()}>{label}</button>
      <input ref={input} type="file" accept={accept} aria-label={label} className="sr-only" tabIndex={-1} disabled={disabled}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }} />
    </>
  );
}

// Phase 4C: choose a file from the private library, or upload one (an identical file already in
// the library is reused rather than stored again). Nothing here makes a file public.
export default function LibraryPicker({ kind, items, label, disabled, onPick, onUpload }: {
  kind: LibraryKind;
  items: LibraryItem[];
  label: string;
  disabled?: boolean;
  onPick: (item: LibraryItem) => void;
  onUpload: (file: File) => Promise<LibraryItem | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const list = items.filter((f) => f.kind === kind);
  const what = kind === "pdf" ? "PDF" : "image";
  const pick = (item: LibraryItem) => { onPick(item); dialog.current?.close(); };

  return (
    <>
      <button type="button" className={small} disabled={disabled} onClick={() => dialog.current?.showModal()}>{label}</button>
      <dialog ref={dialog} aria-labelledby={heading}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-5 text-foreground backdrop:bg-black/50">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <h4 id={heading} className="text-lg font-semibold">Choose {kind === "pdf" ? "a PDF" : "an image"} from your library</h4>
            <button type="button" className={small} onClick={() => dialog.current?.close()}>Close</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton kind={kind} disabled={disabled} label={`Upload a new ${what}`}
              onFile={(file) => { void onUpload(file).then((item) => { if (item) pick(item); }); }} />
            <span className="text-xs text-muted">Up to 10 MB. Uploads stay private until you publish.</span>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted">No {what}s in your library yet.</p>
          ) : (
            <ul className="grid max-h-[50vh] gap-2 overflow-y-auto" aria-label={`${what}s in your library`}>
              {list.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
                  {item.kind === "image" && item.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    : <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-background text-xs font-semibold">{item.kind === "pdf" ? "PDF" : "IMG"}</span>}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="text-xs text-muted">{sizeLabel(item.bytes)}</span>
                  </span>
                  <button type="button" className={small} onClick={() => pick(item)}>Use<span className="sr-only"> {item.name}</span></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
