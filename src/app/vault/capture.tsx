"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Idea = { id: string; content: string; status: string; created_at: string };

export default function Capture({ initial }: { initial: Idea[] }) {
  const [ideas, setIdeas] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    // Show it instantly, then confirm with the database.
    const tempId = `temp-${Date.now()}`;
    const temp: Idea = {
      id: tempId,
      content,
      status: "raw",
      created_at: new Date().toISOString(),
    };
    setIdeas((list) => [temp, ...list]);
    setText("");
    setError("");

    const { data, error } = await createClient()
      .from("ideas")
      .insert({ content })
      .select("id, content, status, created_at")
      .single();

    if (error || !data) {
      setIdeas((list) => list.filter((i) => i.id !== tempId));
      setText(content);
      setError(error?.message ?? "Could not save. Try again.");
    } else {
      setIdeas((list) => list.map((i) => (i.id === tempId ? data : i)));
    }
  }

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
          placeholder="What's the idea?"
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

      <ul className="flex flex-col gap-3">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className={`rounded-lg border border-neutral-300 p-3 ${
              idea.id.startsWith("temp-") ? "opacity-60" : ""
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{idea.content}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {new Date(idea.created_at).toLocaleString()}
            </p>
          </li>
        ))}
        {ideas.length === 0 && <li className="text-neutral-500">No ideas yet.</li>}
      </ul>
    </div>
  );
}
