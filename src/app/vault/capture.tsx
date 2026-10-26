"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractTags, splitTags } from "@/lib/tags";
import { useRecorder } from "./use-recorder";
import { useLocalValue } from "./use-local-value";
import { useOnline } from "./use-online";
import { addQueued, listQueued, removeQueued, type QueuedIdea } from "@/lib/outbox";
import { NetworkError, looksOffline, pushIdea } from "@/lib/sync";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET,
  IDEA_COLUMNS,
  MAX_FILE_BYTES,
  PAGE_SIZE,
  STATUSES,
  formatSize,
  safeFileName,
  signFiles,
  withFileUrls,
  type FileItem,
  type FileRow,
  type Idea,
  type RawIdea,
} from "@/lib/ideas";

// An idea on screen. `uploading` is how many files are still going up to an existing idea;
// `waiting` marks an idea saved on this device that hasn't reached the database yet.
type ViewIdea = Idea & {
  uploading?: number;
  waiting?: boolean;
  queuedFiles?: { name: string; size: number }[];
  syncError?: string;
};

function queuedToView(q: QueuedIdea): ViewIdea {
  return {
    id: q.id,
    content: q.content,
    status: "raw",
    tags: q.tags,
    created_at: q.created_at,
    files: [],
    waiting: true,
    queuedFiles: q.files.map((f) => ({ name: f.file.name, size: f.file.size })),
  };
}

// File links last an hour; renew them well before that.
const REFRESH_AFTER_MS = 45 * 60 * 1000;

// One page of ideas (newest first) matching the filters, starting after `before`.
function searchIdeas(
  supabase: SupabaseClient,
  f: { term: string; tag: string | null; status: string | null; before?: string },
) {
  let q = supabase
    .from("ideas")
    .select(IDEA_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (f.term) q = q.ilike("content", `%${f.term.replace(/[\\%_]/g, "\\$&")}%`);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.status) q = q.eq("status", f.status);
  if (f.before) q = q.lt("created_at", f.before);
  return q;
}

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
  const [text, setText] = useLocalValue("vault-draft", "");
  const [view, setView] = useLocalValue("vault-view", "list");
  const grid = view === "grid";
  const online = useOnline();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const requestId = useRef(0);
  const firstRun = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const editFileInput = useRef<HTMLInputElement>(null);
  const ideasRef = useRef(ideas);
  const signedAt = useRef(0);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const filtering = query.trim() !== "" || activeTag !== null || activeStatus !== null;

  // Re-run the search whenever the search box or the chosen tag changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await searchIdeas(supabase, {
        term: query.trim(),
        tag: activeTag,
        status: activeStatus,
      });
      if (id !== requestId.current) return; // a newer search replaced this one
      if (error) {
        setError(looksOffline(error.message) ? "You're offline. Search needs a connection." : error.message);
      } else {
        const withUrls = await withFileUrls(supabase, (data ?? []) as unknown as RawIdea[]);
        if (id === requestId.current) {
          // Ideas still waiting to sync aren't on the server yet; keep the ones that match.
          const term = query.trim().toLowerCase();
          const ids = new Set(withUrls.map((i) => i.id));
          const waiting = ideasRef.current.filter(
            (i) =>
              i.waiting &&
              !ids.has(i.id) &&
              (!term || i.content.toLowerCase().includes(term)) &&
              (!activeTag || i.tags.includes(activeTag)) &&
              (!activeStatus || i.status === activeStatus),
          );
          setIdeas([...waiting, ...withUrls]);
          setHasMore((data ?? []).length === PAGE_SIZE);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeTag, activeStatus]);

  async function loadMore() {
    const last = [...ideas].reverse().find((i) => !i.waiting);
    if (!last || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await searchIdeas(supabase, {
      term: query.trim(),
      tag: activeTag,
      status: activeStatus,
      before: last.created_at,
    });
    if (error) {
      setError(error.message);
    } else if (id === requestId.current) {
      const more = await withFileUrls(supabase, (data ?? []) as unknown as RawIdea[]);
      setIdeas((list) => {
        const seen = new Set(list.map((i) => i.id));
        return [...list, ...more.filter((i) => !seen.has(i.id))];
      });
      setHasMore((data ?? []).length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  // Keep file links fresh: renew them when you come back to the app or leave it open a long time.
  useEffect(() => {
    ideasRef.current = ideas;
  });

  useEffect(() => {
    signedAt.current = Date.now();

    async function refreshUrls() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - signedAt.current < REFRESH_AFTER_MS) return;
      // Don't cut off a voice note that is playing.
      if ([...document.querySelectorAll("audio")].some((a) => !a.paused)) return;
      const files = ideasRef.current.flatMap((i) => i.files);
      const previous = signedAt.current;
      signedAt.current = Date.now();
      if (files.length === 0) return;

      const fresh = await signFiles(createClient(), files);
      if (!fresh.some((f) => f.url)) {
        signedAt.current = previous; // couldn't reach the server; try again soon
        return;
      }
      const byId = new Map(fresh.map((f) => [f.id, f]));
      setIdeas((list) =>
        list.map((i) => ({
          ...i,
          files: i.files.map((f) => {
            const renewed = byId.get(f.id);
            return renewed?.url ? renewed : f;
          }),
        })),
      );
    }

    document.addEventListener("visibilitychange", refreshUrls);
    const timer = setInterval(refreshUrls, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", refreshUrls);
      clearInterval(timer);
    };
  }, []);

  // Ideas written on this device that haven't reached the database yet are sent from here.
  async function syncQueue() {
    if (syncing.current) {
      syncAgain.current = true; // something new was queued mid-sync; go round again after
      return;
    }
    syncing.current = true;
    try {
      const supabase = createClient();
      for (const item of await listQueued()) {
        try {
          const { idea, failures } = await pushIdea(supabase, item);
          // Keep the item queued if a file failed, so the file isn't lost; the next sync retries it.
          if (!failures.length) await removeQueued(item.id);
          setIdeas((list) => list.map((i) => (i.id === item.id ? idea : i)));
          if (failures.length) setError(`Some files failed: ${failures.join("; ")}`);
        } catch (e) {
          if (e instanceof NetworkError) break; // no connection yet; try again later
          const message = e instanceof Error ? e.message : "Could not sync.";
          setIdeas((list) =>
            list.map((i) => (i.id === item.id ? { ...i, syncError: message } : i)),
          );
        }
      }
    } catch {
      // the device queue isn't available; nothing to send
    } finally {
      syncing.current = false;
      if (syncAgain.current) {
        syncAgain.current = false;
        void syncRef.current();
      }
    }
  }

  useEffect(() => {
    syncRef.current = syncQueue;
  });

  // On opening: show ideas still waiting on this device, then try to send them.
  useEffect(() => {
    let cancelled = false;
    listQueued()
      .then((queued) => {
        if (cancelled || queued.length === 0) return;
        const have = new Set(ideasRef.current.map((i) => i.id));
        const fresh = queued.filter((q) => !have.has(q.id));
        if (fresh.length) {
          setIdeas((list) => [...fresh.map(queuedToView).reverse(), ...list]);
          setTagCounts((c) => {
            const next = { ...c };
            for (const q of fresh) for (const t of q.tags) next[t] = (next[t] ?? 0) + 1;
            return next;
          });
        }
        void syncRef.current();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Try again when the connection comes back, when you return to the app, and every 20 seconds.
  useEffect(() => {
    const run = () => void syncRef.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (ideasRef.current.some((i) => i.waiting)) run();
    }, 20000);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  async function discardQueued(idea: ViewIdea) {
    if (!confirm("Discard this idea? It was never saved to the vault.")) return;
    try {
      await removeQueued(idea.id);
    } catch {
      // already gone
    }
    setIdeas((list) => list.filter((i) => i.id !== idea.id));
    adjustTagCounts(idea.tags, []);
  }

  function matchesFilters(idea: Idea) {
    const term = query.trim().toLowerCase();
    if (term && !idea.content.toLowerCase().includes(term)) return false;
    if (activeTag && !idea.tags.includes(activeTag)) return false;
    if (activeStatus && idea.status !== activeStatus) return false;
    return true;
  }

  async function changeStatus(id: string, status: string) {
    const current = ideas.find((i) => i.id === id);
    const before = current?.status;
    if (!before || before === status || current?.waiting) return;
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    setError("");
    const { error } = await createClient().from("ideas").update({ status }).eq("id", id);
    if (error) {
      setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status: before } : i)));
      setError(error.message);
    }
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

  async function addToIdea(ideaId: string, list: FileList | null) {
    const files = list ? [...list] : [];
    if (editFileInput.current) editFileInput.current.value = "";
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES).map((f) => f.name);
    setError(
      tooBig.length ? `Too big (max ${formatSize(MAX_FILE_BYTES)}): ${tooBig.join(", ")}` : "",
    );
    if (ok.length === 0) return;
    setIdeas((all) => all.map((i) => (i.id === ideaId ? { ...i, uploading: ok.length } : i)));
    try {
      await uploadFiles(ideaId, ok);
    } catch (e) {
      setIdeas((all) => all.map((i) => (i.id === ideaId ? { ...i, uploading: undefined } : i)));
      setError(
        e instanceof Error && looksOffline(e.message)
          ? "You're offline. Adding files needs a connection."
          : e instanceof Error
            ? e.message
            : "Could not upload the files.",
      );
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    const files = pending;
    if (!content && files.length === 0) return;
    const tags = extractTags(content);

    // Every idea goes to the on-device outbox first, so it survives a dropped connection
    // or a closed app. It is then sent to the database as soon as possible.
    const item: QueuedIdea = {
      id: crypto.randomUUID(),
      content,
      tags,
      created_at: new Date().toISOString(),
      files: files.map((file) => ({ id: crypto.randomUUID(), file })),
    };
    try {
      await addQueued(item);
    } catch {
      setError("This browser couldn't store the idea on your device. Try again.");
      return;
    }

    const shown = queuedToView(item);
    if (matchesFilters(shown)) setIdeas((list) => [shown, ...list]);
    adjustTagCounts([], tags);
    setText("");
    setPending([]);
    setError("");
    await syncQueue();
  }

  function adjustTagCounts(removed: string[], added: string[]) {
    setTagCounts((c) => {
      const next = { ...c };
      for (const t of removed) next[t] = (next[t] ?? 1) - 1;
      for (const t of added) next[t] = (next[t] ?? 0) + 1;
      return next;
    });
  }

  function startEdit(idea: Idea) {
    setEditingId(idea.id);
    setExpandedId(idea.id);
    setEditText(idea.content);
    setError("");
  }

  async function saveEdit(idea: Idea) {
    const content = editText.trim();
    if (!content && idea.files.length === 0) {
      setError("An idea needs some text or a file. Delete it instead if you don't want it.");
      return;
    }
    const tags = extractTags(content);
    const old = { content: idea.content, tags: idea.tags };
    const apply = (c: string, t: string[]) =>
      setIdeas((list) => list.map((i) => (i.id === idea.id ? { ...i, content: c, tags: t } : i)));

    apply(content, tags);
    adjustTagCounts(old.tags, tags);
    setEditingId(null);
    setError("");

    const { error } = await createClient()
      .from("ideas")
      .update({ content, tags })
      .eq("id", idea.id);
    if (error) {
      apply(old.content, old.tags);
      adjustTagCounts(tags, old.tags);
      setError(error.message);
    }
  }

  async function deleteIdea(idea: Idea) {
    if (!confirm("Delete this idea and its files? This can't be undone.")) return;
    const index = ideas.findIndex((i) => i.id === idea.id);
    setIdeas((list) => list.filter((i) => i.id !== idea.id));
    adjustTagCounts(idea.tags, []);
    setError("");

    const supabase = createClient();
    // Deleting the idea also deletes its file records; the stored files are removed after.
    const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
    if (error) {
      setIdeas((list) => {
        const copy = [...list];
        copy.splice(Math.min(index, copy.length), 0, idea);
        return copy;
      });
      adjustTagCounts([], idea.tags);
      setError(error.message);
      return;
    }
    if (idea.files.length) {
      const removed = await supabase.storage.from(BUCKET).remove(idea.files.map((f) => f.path));
      if (removed.error) setError(`Idea deleted, but its files could not be removed: ${removed.error.message}`);
    }
  }

  async function deleteFile(idea: Idea, file: FileItem) {
    if (!idea.content && idea.files.length === 1) {
      setError("This is all that's in this idea. Delete the whole idea instead.");
      return;
    }
    if (!confirm(`Remove "${file.name}"?`)) return;
    setIdeas((list) =>
      list.map((i) =>
        i.id === idea.id ? { ...i, files: i.files.filter((f) => f.id !== file.id) } : i,
      ),
    );
    setError("");

    const supabase = createClient();
    const { error } = await supabase.from("idea_files").delete().eq("id", file.id);
    if (error) {
      setIdeas((list) =>
        list.map((i) => (i.id === idea.id ? { ...i, files: [...i.files, file] } : i)),
      );
      setError(error.message);
      return;
    }
    const removed = await supabase.storage.from(BUCKET).remove([file.path]);
    if (removed.error) setError(`File removed, but it could not be erased: ${removed.error.message}`);
  }

  const sortedTags = Object.entries(tagCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col gap-6">
      {!online && (
        <p role="status" className="rounded-lg border border-line p-3 text-sm text-muted">
          You&apos;re offline. New ideas are kept on this device and will sync automatically.
        </p>
      )}
      <form onSubmit={save} className="flex flex-col gap-3">
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !recorder.recording) save(e);
          }}
          placeholder="What's the idea? Add #tags like #project"
          className="w-full resize-none rounded-lg border border-line bg-field p-3 text-base text-ink"
        />

        {pending.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {pending.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                  className="shrink-0 text-danger"
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
          <div className="flex items-center justify-between rounded-lg border border-danger p-3">
            <span className="font-medium text-danger">
              ● Recording {Math.floor(recorder.seconds / 60)}:
              {String(recorder.seconds % 60).padStart(2, "0")}
            </span>
            <span className="flex gap-3">
              <button type="button" onClick={recorder.cancel} className="text-muted">
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
            className="rounded-lg border border-line px-3 py-3 text-base"
          >
            Attach
          </button>
          <button
            type="button"
            disabled={recorder.recording}
            onClick={recorder.start}
            className="rounded-lg border border-line px-3 py-3 text-base disabled:opacity-40"
          >
            Record
          </button>
          <button
            disabled={recorder.recording || (!text.trim() && pending.length === 0)}
            className="flex-1 rounded-lg bg-ink px-3 py-3 text-base font-medium text-on-ink disabled:opacity-40"
          >
            Save idea
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas"
            className="min-w-0 flex-1 rounded-lg border border-line bg-field p-3 text-base text-ink"
          />
          <div
            role="group"
            aria-label="View"
            className="flex shrink-0 overflow-hidden rounded-lg border border-line text-sm"
          >
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-3 ${view === v ? "bg-ink text-on-ink" : ""}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[null, ...STATUSES].map((s) => (
            <button
              key={s ?? "all"}
              onClick={() => setActiveStatus(s)}
              className={`rounded-full border px-3 py-1 text-sm ${
                activeStatus === s ? "border-ink bg-ink text-on-ink" : "border-line"
              }`}
            >
              {s ?? "all"}
            </button>
          ))}
        </div>
        {sortedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedTags.map(([tag, n]) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  activeTag === tag
                    ? "border-ink bg-ink text-on-ink"
                    : "border-line"
                }`}
              >
                #{tag} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={editFileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => editingId && addToIdea(editingId, e.target.files)}
      />

      <ul className={grid ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
        {ideas.map((idea) => {
          // In grid view ideas show as small cards; tap one to open it in full.
          const compact =
            grid &&
            !idea.waiting &&
            !idea.uploading &&
            expandedId !== idea.id &&
            editingId !== idea.id;
          if (compact) {
            const cover = idea.files.find((f) => f.url && f.mime_type?.startsWith("image/"));
            const open = () => setExpandedId(idea.id);
            return (
              <li
                key={idea.id}
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
                className="cursor-pointer overflow-hidden rounded-lg border border-line"
              >
                {cover?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.url} alt="" className="aspect-square w-full object-cover" />
                )}
                <div className="p-3">
                  {idea.content && (
                    <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">
                      {idea.content}
                    </p>
                  )}
                  {idea.files.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {idea.files.length} attachment{idea.files.length > 1 ? "s" : ""}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{new Date(idea.created_at).toLocaleDateString()}</span>
                    <span>{idea.status}</span>
                  </div>
                </div>
              </li>
            );
          }
          return (
          <li
            key={idea.id}
            className={`rounded-lg border border-line p-3 ${grid ? "col-span-2" : ""} ${
              idea.waiting ? "opacity-60" : ""
            }`}
          >
            {editingId === idea.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full resize-none rounded-lg border border-line bg-field p-3 text-base text-ink"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => saveEdit(idea)}
                    className="flex-1 rounded-lg bg-ink px-3 py-2 font-medium text-on-ink"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-line px-3 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : idea.content ? (
              <p className="whitespace-pre-wrap break-words">
                {splitTags(idea.content).map((part, i) =>
                  part.tag ? (
                    <button
                      key={i}
                      onClick={() => setActiveTag(part.tag!)}
                      className="font-medium text-link"
                    >
                      {part.text}
                    </button>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </p>
            ) : null}

            {editingId === idea.id && idea.files.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {idea.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                    </span>
                    <button onClick={() => deleteFile(idea, f)} className="shrink-0 text-danger">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {editingId === idea.id && (
              <button
                onClick={() => editFileInput.current?.click()}
                className="mt-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                Add files
              </button>
            )}

            {idea.files.length > 0 && editingId !== idea.id && (
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
                      className="max-w-full truncate rounded-lg border border-line px-3 py-2 text-sm text-link"
                    >
                      {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                    </a>
                  ),
                )}
              </div>
            )}
            {idea.uploading ? (
              <p className="mt-2 text-sm text-muted">
                Uploading {idea.uploading} file{idea.uploading > 1 ? "s" : ""}…
              </p>
            ) : null}

            {idea.waiting && idea.queuedFiles && idea.queuedFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {idea.queuedFiles.map((f, i) => (
                  <span
                    key={i}
                    className="max-w-full truncate rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                  </span>
                ))}
              </div>
            )}
            {idea.waiting &&
              (idea.syncError ? (
                <p className="mt-2 text-sm text-danger">
                  Couldn&apos;t save this one: {idea.syncError}{" "}
                  <button onClick={() => discardQueued(idea)} className="underline">
                    Discard
                  </button>
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {online ? "Saving…" : "Waiting for a connection. It will sync by itself."}
                </p>
              ))}

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {new Date(idea.created_at).toLocaleString()}
              </p>
              <select
                value={idea.status}
                disabled={idea.waiting}
                onChange={(e) => changeStatus(idea.id, e.target.value)}
                aria-label="Status"
                className="rounded-full border border-line bg-field px-3 py-1 text-sm text-ink"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {editingId !== idea.id && !idea.waiting && !idea.uploading && (
              <div className="mt-1 flex gap-5 text-sm">
                <button onClick={() => startEdit(idea)} className="py-2 text-link">
                  Edit
                </button>
                <button onClick={() => deleteIdea(idea)} className="py-2 text-danger">
                  Delete
                </button>
                {grid && (
                  <button onClick={() => setExpandedId(null)} className="py-2 text-muted">
                    Close
                  </button>
                )}
              </div>
            )}
          </li>
          );
        })}
        {ideas.length === 0 && (
          <li className="text-muted">
            {filtering ? "Nothing matches." : "No ideas yet."}
          </li>
        )}
      </ul>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="rounded-lg border border-line px-3 py-3 text-base disabled:opacity-40"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
