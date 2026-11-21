"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLibraryFile, sizeLabel, uploadToLibrary } from "@/lib/library";
import type { LibraryItem } from "@/lib/library-server";
import { LockedNotice, useVaultWriter } from "../../use-vault-writer";
import { UploadButton } from "../library-picker";
import { requestProfileFileCleanup } from "../orphan-cleanup";

const small = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

// Phase 4C: upload, see where each file is used, and delete files nothing uses.
export default function FilesManager({ ownerId, initialFiles, draftUses }: {
  ownerId: string; initialFiles: LibraryItem[]; draftUses: { resume: string; photo: string };
}) {
  const { run, busy, message, setMessage, online, locked, retry, region } = useVaultWriter(ownerId);
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [deleting, setDeleting] = useState<string | null>(null);
  const disabled = busy || !online;
  const total = files.reduce((sum, f) => sum + f.bytes, 0);

  // Public copies the published profile stopped using are removed when this page opens, so their
  // library files can be deleted. Reload the list if anything changed.
  useEffect(() => {
    void requestProfileFileCleanup().then((removed) => { if (removed > 0) router.refresh(); });
  }, [router]);
  // A refresh brings a new list from the server; take it (React's "adjust state on prop change").
  const [shown, setShown] = useState(initialFiles);
  if (shown !== initialFiles) { setShown(initialFiles); setFiles(initialFiles); }

  const uses = (f: LibraryItem) => [
    ...(draftUses.resume === f.id ? ["Résumé in the draft"] : []),
    ...(draftUses.photo === f.id ? ["Photo in the draft"] : []),
    ...(f.public_path ? ["On your public site"] : []),
  ];

  async function upload(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await run((client) => uploadToLibrary(client, ownerId, file.name, bytes), null, ({ file: row, existing }) => {
      const item: LibraryItem = { ...row, thumb: row.kind === "image" ? URL.createObjectURL(file) : null };
      setFiles((list) => list.some((f) => f.id === item.id) ? list : [item, ...list]);
      setMessage({ text: existing ? `"${row.name}" is already in your library; nothing was stored twice.` : `"${row.name}" added to your library. It stays private.`, error: false });
    });
  }

  function remove(file: LibraryItem) {
    void run((client) => deleteLibraryFile(client, ownerId, file), `"${file.name}" deleted from your library.`, () => {
      setFiles((list) => list.filter((f) => f.id !== file.id));
      setDeleting(null);
    });
  }

  return (
    <>
      {locked && <LockedNotice retry={retry} />}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined} className="grid gap-6">
        <div>
          <a href="/vault/portfolio" className="text-sm text-muted underline underline-offset-4">← Portfolio</a>
          <h2 className="mt-2 text-2xl font-bold">Files</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            A private library of PDFs and images (JPEG, PNG or WebP, up to 10 MB each). Choose them for your résumé and photo in the
            {" "}<a href="/vault/portfolio/profile" className="underline underline-offset-4">profile editor</a>. A file becomes public only when you
            publish a profile that uses it. Uploading the same file twice keeps one copy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4">
          <UploadButton disabled={disabled} onFile={(file) => void upload(file)} />
          <span className="text-sm text-muted">{files.length} {files.length === 1 ? "file" : "files"} · {sizeLabel(total)}</span>
          {message && (
            <p role={message.error ? "alert" : "status"} className={`basis-full text-sm ${message.error ? "text-danger" : "text-muted"}`}>
              {message.text} <button type="button" className="ml-2 text-muted underline" onClick={() => setMessage(null)}>Dismiss</button>
            </p>
          )}
        </div>

        {files.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No files yet. Upload a résumé PDF or a photo to start.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Library files">
            {files.map((f) => {
              const used = uses(f);
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3">
                  {f.kind === "image" && f.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    : <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-background text-xs font-semibold">{f.kind === "pdf" ? "PDF" : "IMG"}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-xs text-muted">{f.kind === "pdf" ? "PDF" : "Image"} · {sizeLabel(f.bytes)} · added {when(f.created_at)}</p>
                    {used.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-1" aria-label={`Where ${f.name} is used`}>
                        {used.map((u) => <li key={u} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold">{u}</li>)}
                      </ul>
                    )}
                  </div>
                  {used.length > 0 ? (
                    <p className="text-xs text-muted">
                      {f.public_path ? "Take it off the profile and publish to delete it." : "Remove it from the draft to delete it."}
                    </p>
                  ) : deleting === f.id ? (
                    <div className="flex gap-2" role="group" aria-label={`Confirm deleting ${f.name}`}>
                      <button type="button" className={`${small} border-danger text-danger`} disabled={disabled} onClick={() => remove(f)}>Delete permanently</button>
                      <button type="button" className={small} onClick={() => setDeleting(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className={small} disabled={disabled} onClick={() => setDeleting(f.id)}>Delete<span className="sr-only"> {f.name}</span></button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
