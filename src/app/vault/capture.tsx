"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractTags, splitTags } from "@/lib/tags";
import { useRecorder } from "./use-recorder";
import {
  BUCKET,
  IDEA_COLUMNS,
  MAX_FILE_BYTES,
  formatSize,
  safeFileName,
  signFiles,
  withFileUrls,
  type FileRow,
  type Idea,
  type RawIdea,
} from "@/lib/ideas";

// An idea on screen; `uploading` is how many files are still going up.
type ViewIdea = Idea & { uploading?: number };

function countTags(lists: string[][]) {
  const counts: Record<string, number> = {};
  for (const tags of lists) for (const t of tags) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export default function Capture({
  initial,
  initialTags,
}: {
  initial: Idea[];
  initialTags: string[][];
}) {
  const [ideas, setIdeas] = useState<ViewIdea[]>(initial);
  const [tagCounts, setTagCounts] = useState(() => countTags(initialTags));
  const [text, setText] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const requestId = useRef(0);
  const firstRun = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtering = query.trim() !== "" || activeTag !== null;

  // Re-run the search whenever the search box or the chosen tag changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      let q = supabase
        .from("ideas")
        .select(IDEA_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(100);
      const term = query.trim();
      if (term) q = q.ilike("content", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      if (activeTag) q = q.contains("tags", [activeTag]);
      const { data, error } = await q;
      if (id !== requestId.current) return; // a newer search replaced this one
      if (error) setError(error.message);
      else {
        const withUrls = await withFileUrls(supabase, (data ?? []) as unknown as RawIdea[]);
        if (id === requestId.current) setIdeas(withUrls);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeTag]);

  function matchesFilters(idea: Idea) {
    const term = query.trim().toLowerCase();
    if (term && !idea.content.toLowerCase().includes(term)) return false;
    if (activeTag && !idea.tags.includes(activeTag)) return false;
    return true;
  }

  const recorder = useRecorder(
    (file) => addFiles([file]),
    (message) => setError(message),
  );

  function addFiles(list: Iterable<File> | null) {
    if (!list) return;
    const ok: File[] = [];
    const tooBig: string[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) tooBig.push(f.name);
      else ok.push(f);
    }
    setPending((p) => [...p, ...ok]);
    setError(
      tooBig.length
        ? `Too big (max ${formatSize(MAX_FILE_BYTES)}): ${tooBig.join(", ")}`
        : "",
    );
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadFiles(ideaId: string, files: File[]) {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    const rows: FileRow[] = [];
    const failures: string[] = [];

    for (const file of files) {
      if (!userId) {
        failures.push(`${file.name}: not logged in`);
        continue;
      }
      const path = `${userId}/${ideaId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        failures.push(`${file.name}: ${up.error.message}`);
        continue;
      }
      const rec = await supabase
        .from("idea_files")
        .insert({
          idea_id: ideaId,
          path,
          name: file.name,
          mime_type: file.type || null,
          size: file.size,
        })
        .select("id, path, name, mime_type, size")
        .single();
      if (rec.error || !rec.data) {
        await supabase.storage.from(BUCKET).remove([path]);
        failures.push(`${file.name}: ${rec.error?.message ?? "could not save"}`);
      } else {
        rows.push(rec.data as FileRow);
      }
    }

    const signed = await signFiles(supabase, rows);
    setIdeas((list) =>
      list.map((i) =>
        i.id === ideaId ? { ...i, files: [...i.files, ...signed], uploading: undefined } : i,
      ),
    );
    if (failures.length) setError(`Some files failed: ${failures.join("; ")}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    const files = pending;
    if (!content && files.length === 0) return;
    const tags = extractTags(content);

    // Show it instantly, then confirm with the database.
    const tempId = `temp-${Date.now()}`;
    const temp: ViewIdea = {
      id: tempId,
      content,
      status: "raw",
      tags,
      created_at: new Date().toISOString(),
      files: [],
      uploading: files.length || undefined,
    };
    if (matchesFilters(temp)) setIdeas((list) => [temp, ...list]);
    setTagCounts((c) => {
      const next = { ...c };
      for (const t of tags) next[t] = (next[t] ?? 0) + 1;
      return next;
    });
    setText("");
    setPending([]);
    setError("");

    const { data, error } = await createClient()
      .from("ideas")
      .insert({ content, tags })
      .select(IDEA_COLUMNS)
      .single();

    if (error || !data) {
      setIdeas((list) => list.filter((i) => i.id !== tempId));
      setTagCounts((c) => {
        const next = { ...c };
        for (const t of tags) next[t] = (next[t] ?? 1) - 1;
        return next;
      });
      setText(content);
      setPending(files);
      setError(error?.message ?? "Could not save. Try again.");
      return;
    }

    const saved = data as unknown as RawIdea;
    setIdeas((list) =>
      list.map((i) =>
        i.id === tempId ? { ...saved, files: [], uploading: files.length || undefined } : i,
      ),
    );
    if (files.length) await uploadFiles(saved.id, files);
  }

  const sortedTags = Object.entries(tagCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-3">
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(e);
          }}
          placeholder="What's the idea? Add #tags like #project"
          className="w-full resize-none rounded-lg border border-neutral-300 bg-white p-3 text-base text-black"
        />

        {pending.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {pending.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {f.name} <span className="text-neutral-500">{formatSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                  className="shrink-0 text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files ? [...e.target.files] : null)}
        />
        {recorder.recording && (
          <div className="flex items-center justify-between rounded-lg border border-red-300 p-3">
            <span className="font-medium text-red-600">
              ● Recording {Math.floor(recorder.seconds / 60)}:
              {String(recorder.seconds % 60).padStart(2, "0")}
            </span>
            <span className="flex gap-3">
              <button type="button" onClick={recorder.cancel} className="text-neutral-500">
                Cancel
              </button>
              <button type="button" onClick={recorder.stop} className="font-medium">
                Stop
              </button>
            </span>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
          >
            Attach
          </button>
          <button
            type="button"
            disabled={recorder.recording}
            onClick={recorder.start}
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base disabled:opacity-40"
          >
            Record
          </button>
          <button
            disabled={recorder.recording || (!text.trim() && pending.length === 0)}
            className="flex-1 rounded-lg bg-black px-3 py-3 text-base font-medium text-white disabled:opacity-40"
          >
            Save idea
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ideas"
          className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-base text-black"
        />
        {sortedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedTags.map(([tag, n]) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  activeTag === tag
                    ? "border-black bg-black text-white"
                    : "border-neutral-300"
                }`}
              >
                #{tag} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className={`rounded-lg border border-neutral-300 p-3 ${
              idea.id.startsWith("temp-") ? "opacity-60" : ""
            }`}
          >
            {idea.content && (
              <p className="whitespace-pre-wrap break-words">
                {splitTags(idea.content).map((part, i) =>
                  part.tag ? (
                    <button
                      key={i}
                      onClick={() => setActiveTag(part.tag!)}
                      className="font-medium text-blue-600"
                    >
                      {part.text}
                    </button>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </p>
            )}

            {idea.files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {idea.files.map((f) =>
                  f.url && f.mime_type?.startsWith("image/") ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.name}
                        className="h-24 w-24 rounded-lg object-cover"
                      />
                    </a>
                  ) : f.url && f.mime_type?.startsWith("audio/") ? (
                    <audio
                      key={f.id}
                      controls
                      preload="metadata"
                      src={f.url}
                      className="w-full"
                    />
                  ) : (
                    <a
                      key={f.id}
                      href={f.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-full truncate rounded-lg border border-neutral-300 px-3 py-2 text-sm text-blue-600"
                    >
                      {f.name} <span className="text-neutral-500">{formatSize(f.size)}</span>
                    </a>
                  ),
                )}
              </div>
            )}
            {idea.uploading ? (
              <p className="mt-2 text-sm text-neutral-500">
                Uploading {idea.uploading} file{idea.uploading > 1 ? "s" : ""}…
              </p>
            ) : null}

            <p className="mt-1 text-xs text-neutral-500">
              {new Date(idea.created_at).toLocaleString()}
            </p>
          </li>
        ))}
        {ideas.length === 0 && (
          <li className="text-neutral-500">
            {filtering ? "Nothing matches." : "No ideas yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
