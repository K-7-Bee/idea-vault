"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBoard, type Board } from "@/lib/boards";
import type { Writer } from "../record-section";

// Phase 7C: the project's boards, listed on the Overview, with "New board".
export default function BoardsPanel({ ownerId, projectId, boards, writer }: {
  ownerId: string; projectId: string; boards: Board[]; writer: Writer;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const sorted = [...boards].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the field itself: text typed before the page finished loading isn't in React's state yet.
    const typed = (e.currentTarget.querySelector("#new-board-title") as HTMLInputElement | null)?.value ?? title;
    if (!typed.trim()) return;
    const position = (sorted.at(-1)?.position ?? 0) + 1;
    void writer.run((c) => createBoard(c, ownerId, projectId, typed, position), null, (board) => router.push(`/vault/projects/${projectId}/boards/${board.id}`));
  }

  return (
    <section aria-labelledby="boards-heading" className="rounded-2xl border border-line bg-card p-4">
      <h3 id="boards-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">Boards</h3>
      {sorted.length > 0 ? (
        <ul className="mt-2 grid gap-1">
          {sorted.map((b) => (
            <li key={b.id}><Link className="underline underline-offset-4" href={`/vault/projects/${projectId}/boards/${b.id}`}>{b.title}</Link></li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Arrange notes, images, sketches, scenes, characters and lab entries freely, and connect them.</p>
      )}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="new-board-title">New board title</label>
        <input id="new-board-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="New board title"
          className="min-h-10 w-0 min-w-0 flex-1 rounded-xl border border-line bg-field px-3 text-base" />
        <button type="submit" disabled={writer.busy || !writer.online}
          className="min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-40">New board</button>
      </form>
    </section>
  );
}
