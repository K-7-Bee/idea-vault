"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  BOARD, CARD_KINDS, CARD_COLOURS, addCard, connect, deleteBoard, deleteCard, disconnect, edgePoint, freeSpot, placeCard, renameBoard, updateCard,
  type Board, type Card, type CardColour, type CardKind, type Connection,
} from "@/lib/boards";
import { describeDrawing, type DrawingData } from "@/lib/drawing/format";
import { isImage, type ProjectFile } from "@/lib/project-files";
import { LockedNotice, useVaultWriter } from "../../../../use-vault-writer";
import DrawingView from "../../drawings/drawing-view";
import { Thumb } from "../../thumb";

// Phase 7C: a visual board. Cards move by dragging their handle (pen, finger or mouse) or with the
// arrow keys on the handle; zoom uses buttons so it never fights the browser's own pinch-zoom. The
// List view shows the same cards and connections for reading and keyboard use.

type Ref = { id: string; label: string };
export type BoardRefs = {
  files: (Ref & { file: ProjectFile })[]; drawings: (Ref & { preview: DrawingData })[];
  units: Ref[]; characters: Ref[]; entries: Ref[];
};
const REF_LIST: Record<Exclude<CardKind, "note">, keyof BoardRefs> = { file: "files", drawing: "drawings", unit: "units", character: "characters", entry: "entries" };
const COLOUR_CLASS: Record<CardColour, string> = {
  yellow: "bg-amber-50 border-amber-300", blue: "bg-sky-50 border-sky-300", green: "bg-emerald-50 border-emerald-300",
  pink: "bg-rose-50 border-rose-300", grey: "bg-stone-100 border-stone-300",
};
const button = "min-h-10 rounded-xl border border-line px-3 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const small = "min-h-8 rounded-lg border border-stone-300 bg-white/80 px-2 text-xs font-medium text-stone-900 transition hover:bg-white disabled:opacity-40";
const field = "min-h-10 rounded-xl border border-line bg-field px-3 text-base";

function refOf(card: Card): string | null {
  return card.file_id ?? card.drawing_id ?? card.unit_id ?? card.character_id ?? card.entry_id;
}

export default function BoardEditor({ ownerId, projectId, projectTitle, initialBoard, initialCards, initialLinks, refs }: {
  ownerId: string; projectId: string; projectTitle: string; initialBoard: Board; initialCards: Card[]; initialLinks: Connection[]; refs: BoardRefs;
}) {
  const router = useRouter();
  const { run, busy, message, setMessage, online, locked, retry } = useVaultWriter(ownerId);
  const [board, setBoard] = useState(initialBoard);
  const [title, setTitle] = useState(initialBoard.title);
  const [cards, setCards] = useState(initialCards);
  const [links, setLinks] = useState(initialLinks);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<"board" | "list">("board");
  const [adding, setAdding] = useState<{ kind: CardKind; ref: string; text: string }>({ kind: "note", ref: "", text: "" });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<{ from: string; to: string; label: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; colour: CardColour } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The live drag position lives here too: a release can arrive before the last move has rendered.
  const drag = useRef<{ id: string; pointer: number; startX: number; startY: number; cardX: number; cardY: number; x: number; y: number } | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(new Map(initialCards.map((c) => [c.id, c])));
  const disabled = busy || !online;

  const describe = (card: Card): { title: string; detail: string | null; removed: boolean } => {
    const kindLabel = CARD_KINDS.find((k) => k.value === card.kind)?.label ?? "Card";
    if (card.kind === "note") return { title: card.text.split("\n")[0].slice(0, 80) || "Note", detail: null, removed: false };
    const ref = refOf(card);
    const found = ref ? (refs[REF_LIST[card.kind]] as Ref[]).find((r) => r.id === ref) : undefined;
    if (!found) return { title: `${kindLabel} (removed)`, detail: "The record this card pointed at was deleted. The card is kept.", removed: true };
    return { title: found.label, detail: kindLabel, removed: false };
  };
  const cardTitle = (id: string) => { const c = cards.find((x) => x.id === id); return c ? describe(c).title : "removed card"; };

  function replaceCard(card: Card) {
    saved.current.set(card.id, card);
    setCards((list) => list.map((c) => (c.id === card.id ? card : c)));
  }
  function saveMove(card: Card) {
    const before = saved.current.get(card.id);
    if (!before || (before.x === card.x && before.y === card.y)) return;
    void run((c) => updateCard(c, ownerId, before, { x: card.x, y: card.y }), null, replaceCard).then((ok) => {
      if (!ok) setCards((list) => list.map((c) => (c.id === card.id ? before : c))); // back to the saved place
    });
  }

  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>, card: Card) {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    drag.current = { id: card.id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, cardX: card.x, cardY: card.y, x: card.x, y: card.y };
    setDragging(card.id);
  }
  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const card = cards.find((c) => c.id === d.id);
    if (!card) return;
    d.x = Math.max(0, Math.min(BOARD.width - card.w, d.cardX + (e.clientX - d.startX) / zoom));
    d.y = Math.max(0, Math.min(BOARD.height - card.h, d.cardY + (e.clientY - d.startY) / zoom));
    const { x, y } = d;
    setCards((list) => list.map((c) => (c.id === d.id ? { ...c, x, y } : c)));
  }
  function onHandleUp(e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    const current = cards.find((c) => c.id === d.id);
    if (!current) return;
    if (cancelled) { setCards((list) => list.map((c) => (c.id === d.id ? saved.current.get(d.id) ?? c : c))); return; }
    const snapped = { ...current, ...placeCard(d.x, d.y, current.w, current.h) };
    setCards((list) => list.map((c) => (c.id === d.id ? snapped : c)));
    saveMove(snapped);
  }
  function onHandleKey(e: React.KeyboardEvent<HTMLButtonElement>, card: Card) {
    const step = e.shiftKey ? 100 : BOARD.grid;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta || disabled) return;
    e.preventDefault();
    const moved = { ...card, ...placeCard(card.x + delta[0], card.y + delta[1], card.w, card.h) };
    setCards((list) => list.map((c) => (c.id === card.id ? moved : c)));
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => saveMove(moved), 500);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (adding.kind !== "note" && !adding.ref) { setMessage({ text: "Choose what the card shows.", error: true }); return; }
    if (adding.kind === "note" && !adding.text.trim()) { setMessage({ text: "Write the note first.", error: true }); return; }
    const el = scroller.current;
    const centre = el ? { x: (el.scrollLeft + el.clientWidth / 2) / zoom, y: (el.scrollTop + el.clientHeight / 2) / zoom } : undefined;
    const spot = freeSpot(cards, centre);
    void run((c) => addCard(c, ownerId, board, { kind: adding.kind, text: adding.text, ref: adding.kind === "note" ? null : adding.ref, ...spot }),
      "Card added.", (card) => { saved.current.set(card.id, card); setCards((list) => [...list, card]); setAdding({ kind: adding.kind, ref: "", text: "" }); });
  }
  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const card = saved.current.get(editing.id);
    if (!card) return;
    void run((c) => updateCard(c, ownerId, card, { text: editing.text.slice(0, 2000), colour: editing.colour }), "Saved.", (row) => { replaceCard(row); setEditing(null); });
  }
  function remove(card: Card) {
    const { title: name } = describe(card);
    if (!window.confirm(`Delete the card "${name}" and its connections? The record it shows (if any) is not changed.`)) return;
    const base = saved.current.get(card.id) ?? card;
    void run((c) => deleteCard(c, ownerId, base), "Card deleted.", () => {
      setCards((list) => list.filter((c) => c.id !== card.id));
      setLinks((list) => list.filter((l) => l.from_card_id !== card.id && l.to_card_id !== card.id));
    });
  }
  function startConnect(card: Card) {
    if (connectFrom === card.id) { setConnectFrom(null); return; }
    if (!connectFrom) { setConnectFrom(card.id); setMessage({ text: `Now choose "Connect here" on the card to connect "${describe(card).title}" to.`, error: false }); return; }
    setPendingLink({ from: connectFrom, to: card.id, label: "" });
    setConnectFrom(null);
  }
  function saveLink(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingLink) return;
    void run((c) => connect(c, ownerId, board, pendingLink.from, pendingLink.to, pendingLink.label), "Connected.", (link) => {
      setLinks((list) => [...list, link]); setPendingLink(null);
    });
  }
  function removeLink(link: Connection) {
    void run((c) => disconnect(c, ownerId, link), "Connection removed.", () => setLinks((list) => list.filter((l) => l.id !== link.id)));
  }
  function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || title.trim() === board.title) return;
    void run((c) => renameBoard(c, ownerId, board, title), "Saved.", setBoard);
  }
  function removeBoard() {
    if (!window.confirm(`Delete the board "${board.title}" with its ${cards.length} card${cards.length === 1 ? "" : "s"} and connections? The records they show are not changed.`)) return;
    void run((c) => deleteBoard(c, ownerId, board), null, () => router.push(`/vault/projects/${projectId}`));
  }

  if (locked) return <LockedNotice retry={retry} />;
  const refOptions = adding.kind === "note" ? [] : (refs[REF_LIST[adding.kind]] as Ref[]);

  function cardBody(card: Card) {
    const info = describe(card);
    const ref = refOf(card);
    if (info.removed) return <p className="text-sm text-stone-700">{info.detail}</p>;
    if (card.kind === "file") {
      const f = refs.files.find((r) => r.id === ref)!;
      return isImage(f.file) ? <Thumb file={f.file} alt={f.label} className="aspect-video w-full rounded-md" /> : <p className="text-sm text-stone-800">File: {f.label}</p>;
    }
    if (card.kind === "drawing") {
      const d = refs.drawings.find((r) => r.id === ref)!;
      return <DrawingView data={d.preview} label={describeDrawing(d.preview, d.label)} className="block h-auto w-full rounded-md border border-stone-200 bg-white" />;
    }
    if (card.kind === "note") return null;
    return <p className="text-xs font-medium uppercase tracking-wide text-stone-600">{info.detail}</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link className="underline underline-offset-4 hover:text-foreground" href={`/vault/projects/${projectId}`}>{projectTitle}</Link>
          <span aria-hidden> / </span><span>Board</span>
        </nav>
        <div role="group" aria-label="Board view" className="flex gap-1 rounded-xl border border-line p-1 text-sm">
          {(["board", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`min-h-9 rounded-lg px-3 ${view === v ? "bg-accent text-on-accent" : "hover:bg-background"}`}>{v === "board" ? "Board" : "List"}</button>
          ))}
        </div>
      </div>
      <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
          <span>Board title</span>
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <button type="submit" className={button} disabled={disabled || !title.trim() || title.trim() === board.title}>Rename</button>
        <button type="button" className={`${button} text-danger`} disabled={disabled} onClick={removeBoard}>Delete board</button>
      </form>
      <h1 className="sr-only">Board: {board.title}</h1>

      <form onSubmit={add} aria-label="Add a card" className="grid gap-2 rounded-2xl border border-line bg-card p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium">
          Card shows
          <select value={adding.kind} onChange={(e) => setAdding({ kind: e.target.value as CardKind, ref: "", text: adding.text })} className={field}>
            {CARD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        {adding.kind !== "note" ? (
          <label className="grid gap-1 text-sm font-medium">
            Which one
            <select value={adding.ref} onChange={(e) => setAdding({ ...adding, ref: e.target.value })} className={field} disabled={!refOptions.length}>
              <option value="">{refOptions.length ? "Choose…" : "Nothing of this kind in the project yet"}</option>
              {refOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        ) : <span className="hidden sm:block" />}
        <label className="grid gap-1 text-sm font-medium">
          {adding.kind === "note" ? "Note" : "Caption (optional)"}
          <input value={adding.text} maxLength={2000} onChange={(e) => setAdding({ ...adding, text: e.target.value })} className={field} />
        </label>
        <button type="submit" className={`${button} bg-accent text-on-accent hover:bg-accent`} disabled={disabled}>Add card</button>
      </form>

      {pendingLink && (
        <form onSubmit={saveLink} className="flex flex-wrap items-end gap-2 rounded-2xl border border-accent bg-card p-3">
          <p className="w-full text-sm">Connect &ldquo;{cardTitle(pendingLink.from)}&rdquo; to &ldquo;{cardTitle(pendingLink.to)}&rdquo;</p>
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            Connection label (optional)
            <input autoFocus value={pendingLink.label} maxLength={100} onChange={(e) => setPendingLink({ ...pendingLink, label: e.target.value })} className={field} />
          </label>
          <button type="submit" className={`${button} bg-accent text-on-accent hover:bg-accent`} disabled={disabled}>Connect</button>
          <button type="button" className={button} onClick={() => setPendingLink(null)}>Cancel</button>
        </form>
      )}

      {editing && (
        <form onSubmit={saveEdit} className="grid gap-2 rounded-2xl border border-accent bg-card p-3">
          <label className="grid gap-1 text-sm font-medium">
            {cards.find((c) => c.id === editing.id)?.kind === "note" ? "Note" : "Caption"}
            <textarea autoFocus rows={3} maxLength={2000} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} className={`${field} py-2`} />
          </label>
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="mb-1 font-medium">Colour</legend>
            {CARD_COLOURS.map((c) => (
              <label key={c} className="inline-flex min-h-10 items-center gap-1.5 capitalize">
                <input type="radio" name="card-colour" checked={editing.colour === c} onChange={() => setEditing({ ...editing, colour: c })} /> {c}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className={`${button} bg-accent text-on-accent hover:bg-accent`} disabled={disabled}>Save card</button>
            <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {view === "board" ? (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Zoom">
            <button type="button" className={button} disabled={zoom <= BOARD.minZoom} onClick={() => setZoom((z) => Math.max(BOARD.minZoom, Math.round((z - 0.2) * 10) / 10))} aria-label="Zoom out">−</button>
            <span className="min-w-14 text-center text-sm tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" className={button} disabled={zoom >= BOARD.maxZoom} onClick={() => setZoom((z) => Math.min(BOARD.maxZoom, Math.round((z + 0.2) * 10) / 10))} aria-label="Zoom in">+</button>
            <p className="text-xs text-muted">Drag a card by its ⠿ handle, or focus the handle and use the arrow keys (Shift for bigger steps).</p>
          </div>
          <div ref={scroller} className="max-h-[70dvh] overflow-auto rounded-2xl border border-line bg-[repeating-linear-gradient(0deg,transparent_0_19px,rgb(0_0_0/0.04)_19px_20px),repeating-linear-gradient(90deg,transparent_0_19px,rgb(0_0_0/0.04)_19px_20px)]">
            <div style={{ width: BOARD.width * zoom, height: BOARD.height * zoom }}>
              <div role="region" aria-label="Board canvas" className="relative origin-top-left" style={{ width: BOARD.width, height: BOARD.height, transform: `scale(${zoom})` }}>
                <svg aria-hidden className="pointer-events-none absolute inset-0" width={BOARD.width} height={BOARD.height}>
                  {links.map((l) => {
                    const a = cards.find((c) => c.id === l.from_card_id), b = cards.find((c) => c.id === l.to_card_id);
                    if (!a || !b) return null;
                    const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2), p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
                    return (
                      <g key={l.id}>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#44403c" strokeWidth={2} />
                        {l.label && (
                          <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle" fontSize={14} fontWeight={600} fill="#1c1917"
                            stroke="#ffffff" strokeWidth={4} paintOrder="stroke">{l.label}</text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                {cards.map((card) => {
                  const info = describe(card);
                  return (
                    <article key={card.id} aria-label={`Card: ${info.title}`}
                      className={`absolute flex flex-col overflow-hidden rounded-xl border-2 text-stone-900 shadow-sm ${COLOUR_CLASS[card.colour]} ${dragging === card.id ? "z-10 shadow-xl" : ""} ${connectFrom === card.id ? "ring-4 ring-accent" : ""}`}
                      style={{ left: card.x, top: card.y, width: card.w, minHeight: card.h }}>
                      <div className="flex items-center gap-1 border-b border-black/10 px-1.5 py-1">
                        <button type="button" className={`${small} cursor-grab touch-none select-none active:cursor-grabbing`} disabled={disabled}
                          aria-label={`Move card ${info.title}: drag, or use the arrow keys`}
                          onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => onHandleDown(e, card)} onPointerMove={onHandleMove}
                          onPointerUp={(e) => onHandleUp(e, false)} onPointerCancel={(e) => onHandleUp(e, true)} onKeyDown={(e) => onHandleKey(e, card)}>⠿</button>
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{info.title}</h2>
                      </div>
                      <div className="grid flex-1 content-start gap-1.5 p-2">
                        {cardBody(card)}
                        {card.text && card.kind !== "note" && <p className="whitespace-pre-wrap break-words text-sm">{card.text}</p>}
                        {card.kind === "note" && <p className="whitespace-pre-wrap break-words text-sm">{card.text}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1 border-t border-black/10 p-1.5">
                        <button type="button" className={small} disabled={disabled} onClick={() => setEditing({ id: card.id, text: card.text, colour: card.colour })}
                          aria-label={`Edit card ${info.title}`}>Edit</button>
                        <button type="button" className={small} disabled={disabled} aria-pressed={connectFrom === card.id} onClick={() => startConnect(card)}
                          aria-label={connectFrom && connectFrom !== card.id ? `Connect here: ${info.title}` : `Connect card ${info.title}`}>
                          {connectFrom && connectFrom !== card.id ? "Connect here" : connectFrom === card.id ? "Cancel" : "Connect"}
                        </button>
                        <button type="button" className={`${small} text-red-800`} disabled={disabled} onClick={() => remove(card)} aria-label={`Delete card ${info.title}`}>Delete</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
          {cards.length === 0 && <p className="text-sm text-muted">No cards yet. Add a note, or a card that shows an image, sketch, scene, character or lab entry.</p>}
        </>
      ) : (
        <div className="grid gap-6">
          <section aria-labelledby="cards-list">
            <h2 id="cards-list" className="text-lg font-semibold">Cards ({cards.length})</h2>
            {cards.length === 0 ? <p className="text-sm text-muted">No cards yet.</p> : (
              <ul className="mt-2 grid gap-2">
                {[...cards].sort((a, b) => a.y - b.y || a.x - b.x).map((card) => {
                  const info = describe(card);
                  return (
                    <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{info.title}</p>
                        <p className="text-sm text-muted">{CARD_KINDS.find((k) => k.value === card.kind)?.label}{card.kind !== "note" && card.text ? ` · ${card.text}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className={button} disabled={disabled} onClick={() => setEditing({ id: card.id, text: card.text, colour: card.colour })}>Edit</button>
                        <button type="button" className={`${button} text-danger`} disabled={disabled} onClick={() => remove(card)} aria-label={`Delete card ${info.title}`}>Delete</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section aria-labelledby="links-list">
            <h2 id="links-list" className="text-lg font-semibold">Connections ({links.length})</h2>
            {links.length === 0 ? <p className="text-sm text-muted">No connections yet. Use Connect on a card in the Board view.</p> : (
              <ul className="mt-2 grid gap-2">
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
                    <p>{cardTitle(l.from_card_id)} <span aria-hidden>—</span><span className="sr-only">connected to</span> {cardTitle(l.to_card_id)}{l.label ? `: ${l.label}` : ""}</p>
                    <button type="button" className={`${button} text-danger`} disabled={disabled} onClick={() => removeLink(l)}
                      aria-label={`Remove the connection between ${cardTitle(l.from_card_id)} and ${cardTitle(l.to_card_id)}`}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-danger" : ""}`}>
          {message.text} <button type="button" className="ml-1 underline" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}
    </div>
  );
}
