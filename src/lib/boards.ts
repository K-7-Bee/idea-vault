// Phase 7C: visual boards (migration 019). Cards are notes or links to real records; connections
// join two cards on the same board. All reads and writes go through the owner's session (row-level
// security); every change names the version it edited.
import type { SupabaseClient } from "@supabase/supabase-js";

export const CARD_KINDS = [
  { value: "note", label: "Note" },
  { value: "file", label: "Image or file" },
  { value: "drawing", label: "Sketch" },
  { value: "unit", label: "Scene or shot" },
  { value: "character", label: "Character" },
  { value: "entry", label: "Lab entry" },
] as const;
export type CardKind = (typeof CARD_KINDS)[number]["value"];
export const CARD_COLOURS = ["yellow", "blue", "green", "pink", "grey"] as const;
export type CardColour = (typeof CARD_COLOURS)[number];
export const LINK_COLUMN: Record<Exclude<CardKind, "note">, "file_id" | "drawing_id" | "unit_id" | "character_id" | "entry_id"> = {
  file: "file_id", drawing: "drawing_id", unit: "unit_id", character: "character_id", entry: "entry_id",
};

export const BOARD = { width: 2400, height: 1600, grid: 20, minZoom: 0.4, maxZoom: 1.6 };
export const CARD = { w: 220, h: 160 };

export type Board = { id: string; project_id: string; title: string; position: number; version: number; updated_at: string };
export type Card = {
  id: string; project_id: string; board_id: string; kind: CardKind; text: string; colour: CardColour;
  file_id: string | null; drawing_id: string | null; unit_id: string | null; character_id: string | null; entry_id: string | null;
  x: number; y: number; w: number; h: number; version: number;
};
export type Connection = { id: string; board_id: string; from_card_id: string; to_card_id: string; label: string; version: number };

export const BOARD_COLUMNS = "id, project_id, title, position, version, updated_at";
export const CARD_COLUMNS = "id, project_id, board_id, kind, text, colour, file_id, drawing_id, unit_id, character_id, entry_id, x, y, w, h, version";
export const LINK_COLUMNS = "id, board_id, from_card_id, to_card_id, label, version";

/** Keeps a card on the board and snaps it to the grid. */
export function placeCard(x: number, y: number, w = CARD.w, h = CARD.h): { x: number; y: number } {
  const snap = (v: number) => Math.round(v / BOARD.grid) * BOARD.grid;
  return {
    x: Math.min(BOARD.width - w, Math.max(0, snap(Number.isFinite(x) ? x : 0))),
    y: Math.min(BOARD.height - h, Math.max(0, snap(Number.isFinite(y) ? y : 0))),
  };
}

/** A free spot for a new card: scans a grid from the top left, avoiding existing cards. */
export function freeSpot(cards: Pick<Card, "x" | "y" | "w" | "h">[], near?: { x: number; y: number }): { x: number; y: number } {
  const overlaps = (x: number, y: number) => cards.some((c) => x < c.x + c.w + 20 && x + CARD.w + 20 > c.x && y < c.y + c.h + 20 && y + CARD.h + 20 > c.y);
  const start = near ? placeCard(near.x - CARD.w / 2, near.y - CARD.h / 2) : { x: 40, y: 40 };
  if (!overlaps(start.x, start.y)) return start;
  for (let row = 40; row <= BOARD.height - CARD.h; row += CARD.h + 40) {
    for (let col = 40; col <= BOARD.width - CARD.w; col += CARD.w + 40) if (!overlaps(col, row)) return { x: col, y: row };
  }
  return start;
}

/** The point where the line from a card's centre towards (tx, ty) leaves the card (for connection ends). */
export function edgePoint(c: Pick<Card, "x" | "y" | "w" | "h">, tx: number, ty: number): { x: number; y: number } {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(Math.abs((c.w / 2) / (dx || 1e-9)), Math.abs((c.h / 2) / (dy || 1e-9)));
  return { x: cx + dx * Math.min(1, scale), y: cy + dy * Math.min(1, scale) };
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: "conflict" | "invalid" | "failed"; message: string };
function failure(error: { code?: string } | null): Result<never> {
  if (error?.code === "23505") return { ok: false, reason: "invalid", message: "Those two cards are already connected." };
  if (error?.code === "23514" || error?.code === "23503" || error?.code === "22P02") return { ok: false, reason: "invalid", message: "That isn't allowed on this board. Nothing was changed." };
  return { ok: false, reason: "failed", message: "Couldn't reach the Vault. Nothing was changed; try again." };
}
async function settle<T>(op: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>, one = true): Promise<Result<T>> {
  try {
    const { data, error } = await op();
    if (error) return failure(error);
    if (one && Array.isArray(data)) {
      if (data.length !== 1) return { ok: false, reason: "conflict", message: "This changed somewhere else since the page loaded. Reload to see the latest." };
      return { ok: true, value: data[0] as T };
    }
    return { ok: true, value: data as T };
  } catch {
    return failure(null);
  }
}

export const createBoard = (c: SupabaseClient, ownerId: string, projectId: string, title: string, position: number) =>
  settle<Board>(() => c.from("boards").insert({ id: crypto.randomUUID(), user_id: ownerId, project_id: projectId, title: title.trim().slice(0, 200), position }).select(BOARD_COLUMNS).single(), false);
export const renameBoard = (c: SupabaseClient, ownerId: string, b: Board, title: string) =>
  settle<Board>(() => c.from("boards").update({ title: title.trim().slice(0, 200) }).eq("id", b.id).eq("user_id", ownerId).eq("version", b.version).select(BOARD_COLUMNS));
export const deleteBoard = (c: SupabaseClient, ownerId: string, b: Board) =>
  settle<Board>(() => c.from("boards").delete().eq("id", b.id).eq("user_id", ownerId).eq("version", b.version).select(BOARD_COLUMNS));

export function addCard(c: SupabaseClient, ownerId: string, board: Board, input: { kind: CardKind; text: string; ref: string | null; x: number; y: number }) {
  const row: Record<string, unknown> = { id: crypto.randomUUID(), user_id: ownerId, project_id: board.project_id, board_id: board.id,
    kind: input.kind, text: input.text.slice(0, 2000), x: input.x, y: input.y };
  if (input.kind !== "note") row[LINK_COLUMN[input.kind]] = input.ref;
  return settle<Card>(() => c.from("board_cards").insert(row).select(CARD_COLUMNS).single(), false);
}
export const updateCard = (c: SupabaseClient, ownerId: string, card: Card, changes: Partial<Pick<Card, "x" | "y" | "text" | "colour">>) =>
  settle<Card>(() => c.from("board_cards").update(changes).eq("id", card.id).eq("user_id", ownerId).eq("version", card.version).select(CARD_COLUMNS));
export const deleteCard = (c: SupabaseClient, ownerId: string, card: Card) =>
  settle<Card>(() => c.from("board_cards").delete().eq("id", card.id).eq("user_id", ownerId).eq("version", card.version).select(CARD_COLUMNS));
export const connect = (c: SupabaseClient, ownerId: string, board: Board, from: string, to: string, label: string) =>
  settle<Connection>(() => c.from("board_links").insert({ id: crypto.randomUUID(), user_id: ownerId, project_id: board.project_id, board_id: board.id,
    from_card_id: from, to_card_id: to, label: label.trim().slice(0, 100) }).select(LINK_COLUMNS).single(), false);
export const disconnect = (c: SupabaseClient, ownerId: string, link: Connection) =>
  settle<Connection>(() => c.from("board_links").delete().eq("id", link.id).eq("user_id", ownerId).eq("version", link.version).select(LINK_COLUMNS));
