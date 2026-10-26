"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractTags, splitTags } from "@/lib/tags";
import { useRecorder } from "./use-recorder";
import { useLocalValue } from "./use-local-value";
import { useOnline } from "./use-online";
import { addQueued, listQueued, removeQueued, type QueuedIdea } from "@/lib/outbox";
import { NetworkError, looksOffline, pushIdea } from "@/lib/sync";
import {
  BoardIcon,
  ChipIcon,
  ClipIcon,
  CloudOffIcon,
  DiceIcon,
  FileIcon,
  FlameIcon,
  GridIcon,
  ListIcon,
  MicIcon,
  PencilIcon,
  SearchIcon,
  SparkIcon,
  TrashIcon,
} from "./icons";
import { STATUS_COLOR, STATUS_INFO } from "./status";
import { CHEERS, PROMPTS } from "./sparks";
import { serif } from "./fonts";
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

// Just enough about each idea to count folders and work out the streak.
type Meta = { id: string; status: string; created_at: string };

// Days in a row (ending today, or yesterday if nothing yet today) with at least one idea.
function dayStreak(dates: string[]) {
  const days = new Set(dates.map((d) => new Date(d).toDateString()));
  const day = new Date();
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (days.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

// Sparks flying out of the save button, spread evenly round a circle.
const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const reach = i % 2 ? 70 : 46;
  return {
    dx: `${Math.round(Math.cos(angle) * reach)}px`,
    dy: `${Math.round(Math.sin(angle) * reach)}px`,
    color: ["var(--accent)", "var(--status-exploring)", "var(--status-building)", "var(--status-done)"][i % 4],
  };
});

function countTags(lists: string[][]) {
  const counts: Record<string, number> = {};
  for (const tags of lists) for (const t of tags) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export default function Capture({
  initial,
  initialTags,
  initialMeta,
}: {
  initial: Idea[];
  initialTags: string[][];
  initialMeta: Meta[];
}) {
  const [ideas, setIdeas] = useState<ViewIdea[]>(initial);
  const [tagCounts, setTagCounts] = useState(() => countTags(initialTags));
  const [meta, setMeta] = useState(() => new Map(initialMeta.map((m) => [m.id, m])));
  const [cheer, setCheer] = useState<{ key: number; text: string } | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(() => initial.length % PROMPTS.length);
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
  const composer = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const cheerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
          setIdeas(withUrls);
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
          await removeQueued(item.id);
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
          for (const q of fresh) track(q.id, { status: "raw", created_at: q.created_at });
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

  // Press "/" anywhere (outside a text box) to jump to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      searchInput.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearTimeout(cheerTimer.current), []);

  // Keep the folder index in step with what happens on screen. `null` removes the idea.
  function track(id: string, entry: Omit<Meta, "id"> | null) {
    setMeta((m) => {
      const next = new Map(m);
      if (entry) next.set(id, { id, ...entry });
      else next.delete(id);
      return next;
    });
  }

  function takeSpark() {
    const prompt = PROMPTS[promptIndex];
    setText(text.trim() ? `${text.trimEnd()}\n${prompt} ` : `${prompt} `);
    setPromptIndex((i) => (i + 1) % PROMPTS.length);
    composer.current?.focus();
  }

  function shuffleSpark() {
    setPromptIndex((i) => (i + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length);
  }

  async function discardQueued(idea: ViewIdea) {
    if (!confirm("Discard this idea? It was never saved to the vault.")) return;
    try {
      await removeQueued(idea.id);
    } catch {
      // already gone
    }
    setIdeas((list) => list.filter((i) => i.id !== idea.id));
    adjustTagCounts(idea.tags, []);
    track(idea.id, null);
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
    track(id, { status, created_at: current.created_at });
    setError("");
    const { error } = await createClient().from("ideas").update({ status }).eq("id", id);
    if (error) {
      setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status: before } : i)));
      track(id, { status: before, created_at: current.created_at });
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
    await uploadFiles(ideaId, ok);
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
    track(item.id, { status: "raw", created_at: item.created_at });
    setFreshId(item.id);
    const pick = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    setCheer({ key: Date.now(), text: `${pick} That's idea #${meta.size + 1}.` });
    clearTimeout(cheerTimer.current);
    cheerTimer.current = setTimeout(() => setCheer(null), 2400);
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
    track(idea.id, null);
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
      track(idea.id, { status: idea.status, created_at: idea.created_at });
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

  const metaList = [...meta.values()];
  const statusCounts: Record<string, number> = {};
  for (const m of metaList) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = metaList.filter((m) => new Date(m.created_at).getTime() > weekAgo).length;
  const streak = dayStreak(metaList.map((m) => m.created_at));
  const folder = activeStatus ? STATUS_INFO[activeStatus] : null;

  const folderButton = (active: boolean) =>
    `flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition lg:w-full ${
      active ? "border-ink bg-ink text-on-ink shadow-sm" : "border-line bg-card hover:border-muted"
    }`;
  const chipBox = (color: string) => ({
    color,
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
  });
  const field =
    "w-full resize-none rounded-xl border border-line bg-field p-3 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-8">
      {cheer && (
        <p
          key={cheer.key}
          role="status"
          className="toast fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-on-ink shadow-lg"
        >
          <SparkIcon className="h-4 w-4 shrink-0 text-accent" />
          {cheer.text}
        </p>
      )}

      <section className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
        {!online && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-line bg-card p-3 text-sm text-muted"
          >
            <CloudOffIcon className="h-4 w-4 shrink-0" />
            You&apos;re offline. New ideas are kept on this device and will sync automatically.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-accent/40 bg-accent-soft/60 px-4 py-3">
          <SparkIcon className="h-5 w-5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium text-link">Idea spark: </span>
            {PROMPTS[promptIndex]}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={shuffleSpark}
              aria-label="Another prompt"
              title="Another prompt"
              className="rounded-lg p-2 text-muted transition hover:rotate-12 hover:bg-card hover:text-foreground"
            >
              <DiceIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={takeSpark}
              className="rounded-lg bg-card px-3 py-1.5 text-sm font-medium text-link shadow-sm transition hover:brightness-105"
            >
              Use it
            </button>
          </div>
        </div>

        <form
          onSubmit={save}
          className="rounded-2xl border border-line bg-card shadow-sm transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15"
        >
          <textarea
            ref={composer}
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(e);
            }}
            placeholder="What's the idea? Add #tags like #project"
            className="block w-full resize-none rounded-t-2xl bg-transparent p-4 text-base text-ink outline-none placeholder:text-muted"
          />

          {pending.length > 0 && (
            <ul className="flex flex-wrap gap-2 px-4 pb-3 text-sm">
              {pending.map((f, i) => (
                <li
                  key={i}
                  className="flex max-w-full items-center gap-2 rounded-lg bg-background py-1 pl-2 pr-1"
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">
                    {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 rounded-md px-1.5 text-muted hover:text-danger"
                  >
                    ×
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
            <div className="mx-3 mb-3 flex items-center justify-between rounded-xl bg-danger/10 p-3">
              <span className="flex items-center gap-2 font-medium text-danger">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                Recording {Math.floor(recorder.seconds / 60)}:
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
          <div className="flex items-center gap-1 border-t border-line p-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              title="Attach files"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-background hover:text-foreground"
            >
              <ClipIcon className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Attach</span>
            </button>
            <button
              type="button"
              disabled={recorder.recording}
              onClick={recorder.start}
              title="Record a voice note"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-background hover:text-foreground disabled:opacity-40"
            >
              <MicIcon className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Record</span>
            </button>
            <span className="ml-auto hidden pr-2 text-xs text-muted sm:inline">Ctrl/⌘ + Enter</span>
            <span className="relative ml-auto sm:ml-0">
              {cheer && (
                <span
                  key={cheer.key}
                  aria-hidden="true"
                  className="burst pointer-events-none absolute left-1/2 top-1/2"
                >
                  {BURST.map((b, i) => (
                    <span
                      key={i}
                      className="absolute -ml-1 -mt-1 h-2 w-2 rounded-full"
                      style={{ background: b.color, "--dx": b.dx, "--dy": b.dy } as React.CSSProperties}
                    />
                  ))}
                </span>
              )}
              <button
                disabled={recorder.recording || (!text.trim() && pending.length === 0)}
                className="rounded-xl bg-accent px-5 py-2.5 text-base font-medium text-on-accent shadow-sm shadow-accent/30 transition hover:brightness-105 active:scale-[0.96] disabled:opacity-40 disabled:shadow-none"
              >
                Save idea
              </button>
            </span>
          </div>
        </form>
        {error && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
        <div className="grid grid-cols-3 gap-2">
          {[
            { Icon: FlameIcon, value: streak, label: "day streak" },
            { Icon: SparkIcon, value: thisWeek, label: "this week" },
            { Icon: ChipIcon, value: meta.size, label: "in the vault" },
          ].map(({ Icon, value, label }) => (
            <div key={label} className="rounded-2xl border border-line bg-card p-3 shadow-sm">
              <Icon className="h-4 w-4 text-accent" />
              {/* Day boundaries depend on the device's timezone, so the server's guess may differ. */}
              <p suppressHydrationWarning className="mt-1 text-2xl font-semibold tabular-nums leading-tight">
                {value}
              </p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>

        <nav aria-label="Folders">
          <h2 className="mb-2 hidden px-1 text-xs font-medium uppercase tracking-wider text-muted lg:block">
            Folders
          </h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {[null, ...STATUSES].map((s) => {
              const info = s ? STATUS_INFO[s] : null;
              const active = activeStatus === s;
              return (
                <button
                  key={s ?? "all"}
                  onClick={() => setActiveStatus(s)}
                  aria-pressed={active}
                  className={folderButton(active)}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={chipBox(info?.color ?? "var(--accent)")}
                  >
                    {info ? (
                      <ChipIcon className="h-[18px] w-[18px]" />
                    ) : (
                      <BoardIcon className="h-[18px] w-[18px]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{info?.label ?? "All ideas"}</span>
                    <span className={`hidden text-xs lg:block ${active ? "opacity-70" : "text-muted"}`}>
                      {info?.blurb ?? "Everything"}
                    </span>
                  </span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      active ? "bg-on-ink/15" : "bg-background text-muted"
                    }`}
                  >
                    {s ? (statusCounts[s] ?? 0) : meta.size}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {sortedTags.length > 0 && (
          <div>
            <h2 className="mb-2 hidden px-1 text-xs font-medium uppercase tracking-wider text-muted lg:block">
              Tags
            </h2>
            <div className="flex flex-wrap gap-2">
              {sortedTags.map(([tag, n]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    activeTag === tag
                      ? "bg-accent text-on-accent"
                      : "bg-accent-soft text-link hover:brightness-95"
                  }`}
                >
                  #{tag} <span className="opacity-60">{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-col gap-4 lg:col-start-2">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
            <input
              ref={searchInput}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ideas"
              className="w-full rounded-xl border border-line bg-field py-3 pl-10 pr-10 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
            {!query && (
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-muted lg:block">
                /
              </kbd>
            )}
          </label>
          <div
            role="group"
            aria-label="View"
            className="flex shrink-0 gap-1 rounded-xl border border-line bg-card p-1"
          >
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                aria-label={`${v} view`}
                className={`grid place-items-center rounded-lg px-2.5 transition ${
                  view === v ? "bg-ink text-on-ink" : "text-muted hover:text-foreground"
                }`}
              >
                {v === "list" ? (
                  <ListIcon className="h-[18px] w-[18px]" />
                ) : (
                  <GridIcon className="h-[18px] w-[18px]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={chipBox(folder?.color ?? "var(--accent)")}
          >
            {folder ? <ChipIcon /> : <BoardIcon />}
          </span>
          <div className="min-w-0">
            <h2 className={`${serif.className} text-2xl leading-none`}>
              {folder?.label ?? "All ideas"}
            </h2>
            <p className="mt-1 truncate text-sm text-muted">
              {folder?.blurb ?? "Every spark you've caught"}
            </p>
          </div>
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              aria-label={`Stop filtering by #${activeTag}`}
              className="ml-auto shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm text-link"
            >
              #{activeTag} ×
            </button>
          )}
        </div>

        <input
          ref={editFileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => editingId && addToIdea(editingId, e.target.files)}
        />

        <ul
          className={
            grid
              ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
              : "grid items-start gap-3 xl:grid-cols-2"
          }
        >
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
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="h-1" style={{ background: STATUS_COLOR[idea.status] }} />
                  {cover?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.url} alt="" className="aspect-square w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-3">
                    {idea.content && (
                      <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">
                        {idea.content}
                      </p>
                    )}
                    {idea.files.length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <ClipIcon className="h-3.5 w-3.5" />
                        {idea.files.length}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted">
                      <span>{new Date(idea.created_at).toLocaleDateString()}</span>
                      <span
                        className="flex items-center gap-1 capitalize"
                        style={{ color: STATUS_COLOR[idea.status] }}
                      >
                        <ChipIcon className="h-3.5 w-3.5" />
                        <span className="text-muted">{idea.status}</span>
                      </span>
                    </div>
                  </div>
                </li>
              );
            }
            return (
            <li
              key={idea.id}
              className={`relative overflow-hidden rounded-2xl border border-line bg-card p-4 pl-5 shadow-sm ${
                grid ? "col-span-full" : ""
              } ${idea.waiting ? "border-dashed opacity-70" : ""} ${idea.id === freshId ? "pop" : ""}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: STATUS_COLOR[idea.status] }}
              />
              {editingId === idea.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    rows={4}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className={field}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(idea)}
                      className="flex-1 rounded-xl bg-accent px-3 py-2 font-medium text-on-accent transition hover:brightness-105"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-line px-4 py-2 text-muted transition hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : idea.content ? (
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {splitTags(idea.content).map((part, i) =>
                    part.tag ? (
                      <button
                        key={i}
                        onClick={() => setActiveTag(part.tag!)}
                        className="rounded-md bg-accent-soft px-1 font-medium text-link"
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
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {idea.files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2"
                    >
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
                  className="mt-2 flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted transition hover:text-foreground"
                >
                  <ClipIcon className="h-4 w-4" />
                  Add files
                </button>
              )}

              {idea.files.length > 0 && editingId !== idea.id && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {idea.files.map((f) =>
                    f.url && f.mime_type?.startsWith("image/") ? (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.url}
                          alt={f.name}
                          className="h-24 w-24 rounded-xl border border-line object-cover transition hover:opacity-90"
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
                        className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-sm text-link transition hover:border-accent"
                      >
                        <FileIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                        </span>
                      </a>
                    ),
                  )}
                </div>
              )}
              {idea.uploading ? (
                <p className="mt-2 animate-pulse text-sm text-muted">
                  Uploading {idea.uploading} file{idea.uploading > 1 ? "s" : ""}…
                </p>
              ) : null}

              {idea.waiting && idea.queuedFiles && idea.queuedFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {idea.queuedFiles.map((f, i) => (
                    <span
                      key={i}
                      className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-background px-3 py-2 text-sm"
                    >
                      <FileIcon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">
                        {f.name} <span className="text-muted">{formatSize(f.size)}</span>
                      </span>
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

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <label
                  className="relative inline-flex items-center rounded-full border border-line bg-background text-sm"
                  style={{ color: STATUS_COLOR[idea.status] }}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 h-2 w-2 rounded-full bg-current"
                  />
                  <select
                    value={idea.status}
                    disabled={idea.waiting}
                    onChange={(e) => changeStatus(idea.id, e.target.value)}
                    aria-label="Status"
                    className="cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-7 pr-3 capitalize text-ink outline-none disabled:cursor-default"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted">
                  {new Date(idea.created_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {editingId !== idea.id && !idea.waiting && !idea.uploading && (
                  <div className="ml-auto flex items-center gap-1 text-sm">
                    {grid && (
                      <button
                        onClick={() => setExpandedId(null)}
                        className="rounded-lg px-2 py-1.5 text-muted transition hover:bg-background hover:text-foreground"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(idea)}
                      aria-label="Edit"
                      title="Edit"
                      className="rounded-lg p-2 text-muted transition hover:bg-background hover:text-foreground"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteIdea(idea)}
                      aria-label="Delete"
                      title="Delete"
                      className="rounded-lg p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
            );
          })}
          {ideas.length === 0 && (
            <li className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-muted">
              <SparkIcon className="h-8 w-8 text-accent" />
              {filtering ? "Nothing matches." : "No ideas yet. Your first one goes up top."}
            </li>
          )}
        </ul>

        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mx-auto rounded-full border border-line bg-card px-6 py-2.5 text-sm text-muted shadow-sm transition hover:text-foreground disabled:opacity-40"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
  );
}
