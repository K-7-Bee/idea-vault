"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractTags, splitTags } from "@/lib/tags";

export type Idea = {
  id: string;
  content: string;
  status: string;
  tags: string[];
  created_at: string;
};

const COLUMNS = "id, content, status, tags, created_at";

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
  const [ideas, setIdeas] = useState(initial);
  const [tagCounts, setTagCounts] = useState(() => countTags(initialTags));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const requestId = useRef(0);
  const firstRun = useRef(true);

  const filtering = query.trim() !== "" || activeTag !== null;

  // Re-run the search whenever the search box or the chosen tag changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      let q = createClient()
        .from("ideas")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(100);
      const term = query.trim();
      if (term) q = q.ilike("content", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      if (activeTag) q = q.contains("tags", [activeTag]);
      const { data, error } = await q;
      if (id !== requestId.current) return; // a newer search replaced this one
      if (error) setError(error.message);
      else setIdeas(data ?? []);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeTag]);

  function matchesFilters(idea: Idea) {
    const term = query.trim().toLowerCase();
    if (term && !idea.content.toLowerCase().includes(term)) return false;
    if (activeTag && !idea.tags.includes(activeTag)) return false;
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    const tags = extractTags(content);

    // Show it instantly, then confirm with the database.
    const tempId = `temp-${Date.now()}`;
    const temp: Idea = {
      id: tempId,
      content,
      status: "raw",
      tags,
      created_at: new Date().toISOString(),
    };
    if (matchesFilters(temp)) setIdeas((list) => [temp, ...list]);
    setTagCounts((c) => {
      const next = { ...c };
      for (const t of tags) next[t] = (next[t] ?? 0) + 1;
      return next;
    });
    setText("");
    setError("");

    const { data, error } = await createClient()
      .from("ideas")
      .insert({ content, tags })
      .select(COLUMNS)
      .single();

    if (error || !data) {
      setIdeas((list) => list.filter((i) => i.id !== tempId));
      setTagCounts((c) => {
        const next = { ...c };
        for (const t of tags) next[t] = (next[t] ?? 1) - 1;
        return next;
      });
      setText(content);
      setError(error?.message ?? "Could not save. Try again.");
    } else {
      setIdeas((list) => list.map((i) => (i.id === tempId ? data : i)));
    }
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
        <button
          disabled={!text.trim()}
          className="rounded-lg bg-black px-3 py-3 text-base font-medium text-white disabled:opacity-40"
        >
          Save idea
        </button>
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
