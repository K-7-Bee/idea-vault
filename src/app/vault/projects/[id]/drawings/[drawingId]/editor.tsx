"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DriveOffline, DriveUnavailable, uploadToDrive } from "@/lib/drive/upload";
import {
  ASPECTS, COLOURS, LABEL_SIZES, LIMITS, PEN_SIZES, canvasFor, hits, makePen, parseDrawing, sizeState,
  type Arrow, type DrawingData, type Item, type SketchAspect,
} from "@/lib/drawing/format";
import { createSketch, deleteDrawing, loadDrawing, saveDrawing, type DrawingRow } from "@/lib/drawing/store";
import { getDraft, putDraft, removeDraft, type LocalDraft } from "@/lib/drawing/local";
import { ItemShape } from "../drawing-view";

// Phase 7: the drawing editor. Pencil, finger or mouse via Pointer Events. Every change is kept on
// this device at once (IndexedDB) and saved to the Vault 2 s after the last one; the server copy is
// only ever replaced by a save that names the version it started from.

export type EditorImage = {
  id: string; name: string; href: string; available: boolean;
  link: { entryId: string | null; componentId: string | null; characterId: string | null; unitId: string | null };
};
type Tool = "pen" | "eraser" | "arrow" | "label";
type SaveState = "saved" | "pending" | "saving" | "offline" | "error" | "conflict" | "locked";

type State = { data: DrawingData; past: Item[][]; future: Item[][]; rev: number };
type Action =
  | { type: "commit"; items: Item[] }
  | { type: "undo" } | { type: "redo" }
  | { type: "replace"; data: DrawingData }
  | { type: "meta"; data: DrawingData };

const HISTORY = 200;
// Read fresh each time: connectivity can change while a save is in flight.
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "commit":
      return { data: { ...s.data, items: a.items }, past: [...s.past, s.data.items].slice(-HISTORY), future: [], rev: s.rev + 1 };
    case "undo":
      if (!s.past.length) return s;
      return { data: { ...s.data, items: s.past[s.past.length - 1] }, past: s.past.slice(0, -1), future: [s.data.items, ...s.future], rev: s.rev + 1 };
    case "redo":
      if (!s.future.length) return s;
      return { data: { ...s.data, items: s.future[0] }, past: [...s.past, s.data.items], future: s.future.slice(1), rev: s.rev + 1 };
    case "replace":
      return { data: a.data, past: [...s.past, s.data.items].slice(-HISTORY), future: [], rev: s.rev + 1 };
    case "meta":
      return { ...s, data: a.data, rev: s.rev + 1 };
  }
}

// Loads an image for drawing on a canvas. Uses onload rather than decode(): Safari's decode() rejects
// SVG images, which would make every export fail on an iPad.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

const button = "min-h-11 min-w-11 rounded-xl border border-line px-3 text-sm font-medium transition hover:bg-background disabled:opacity-40";
const pressed = "border-accent bg-accent text-on-accent hover:bg-accent";
const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Saved",
  pending: "Unsaved changes (kept on this device)",
  saving: "Saving…",
  offline: "Offline: kept on this device, will save when you're back online",
  error: "Not saved: kept on this device",
  conflict: "Not saved: changed somewhere else",
  locked: "Not saved: log in again (kept on this device)",
};

export default function DrawingEditor({ ownerId, projectId, projectTitle, initial, context, base, backgrounds: initialBackgrounds }: {
  ownerId: string; projectId: string; projectTitle: string; initial: DrawingRow; context: string;
  base: EditorImage | null; backgrounds: EditorImage[]; driveUploads: boolean;
}) {
  const router = useRouter();
  const isAnnotation = Boolean(initial.base_file_id);
  const fallback = isAnnotation ? { w: 1600, h: 1200 } : canvasFor((initial.aspect === "image" ? "16:9" : initial.aspect) as SketchAspect);
  const [state, dispatch] = useReducer(reducer, null, () => ({ data: parseDrawing(initial.data, fallback), past: [], future: [], rev: 0 }));
  const [title, setTitle] = useState(initial.title);
  const [aspect, setAspect] = useState<SketchAspect>((initial.aspect === "image" ? "16:9" : initial.aspect) as SketchAspect);
  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState<string>(COLOURS[0].value);
  const [size, setSize] = useState<number>(PEN_SIZES[1].value);
  const [labelSize, setLabelSize] = useState<number>(LABEL_SIZES[1]);
  const [fingerDraws, setFingerDraws] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [live, setLive] = useState<Item | null>(null);
  const [erasing, setErasing] = useState<Item[] | null>(null);
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number } | null>(null);
  const [labelText, setLabelText] = useState("");
  const [restore, setRestore] = useState<LocalDraft | null>(null);
  const [backgrounds, setBackgrounds] = useState(initialBackgrounds);
  const [busy, setBusy] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const stateRef = useRef(state);
  const titleRef = useRef(title);
  const aspectRef = useRef(aspect);
  const versionRef = useRef(initial.version);
  const savedRevRef = useRef(0);
  const savingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<{ id: number; type: string; samples: number[]; start: [number, number]; pressure: boolean } | null>(null);
  const penSeen = useRef(false);
  const frame = useRef<number | null>(null);
  const [savedLabel] = useState(() => new Date(initial.updated_at).toLocaleString());

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { aspectRef.current = aspect; }, [aspect]);

  const { data } = state;
  const bgImage = isAnnotation ? base : data.bg ? backgrounds.find((b) => b.id === data.bg) ?? null : null;
  const full = sizeState(data) === "full";

  // A copy on this device from an earlier visit that never reached the Vault: offer it back.
  useEffect(() => {
    let cancelled = false;
    getDraft(initial.id).then((draft) => {
      if (cancelled || !draft) return;
      const server = JSON.stringify(parseDrawing(initial.data, fallback));
      if (JSON.stringify(draft.data) === server && draft.title === initial.title) { void removeDraft(initial.id).catch(() => {}); return; }
      setRestore(draft);
    }, () => {});
    return () => { cancelled = true; };
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (savingRef.current) return;
    const rev = stateRef.current.rev;
    if (rev === savedRevRef.current) return;
    if (offline()) { setSaveState("offline"); return; }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const client = createClient();
      try {
        const identity = await client.auth.getUser();
        if (identity.error || identity.data.user?.id !== ownerId) { setSaveState("locked"); return; }
      } catch {
        setSaveState(offline() ? "offline" : "error");
        return;
      }
      const result = await saveDrawing(client, ownerId, { id: initial.id, version: versionRef.current }, {
        data: stateRef.current.data, title: titleRef.current, ...(isAnnotation ? {} : { aspect: aspectRef.current }),
      });
      if (result.ok) {
        versionRef.current = result.row.version;
        savedRevRef.current = rev;
        if (stateRef.current.rev === rev) {
          setSaveState("saved");
          void removeDraft(initial.id).catch(() => {});
        } else {
          setSaveState("pending");
          saveTimer.current = setTimeout(() => void save(), 2000);
        }
      } else if (result.reason === "conflict") {
        setSaveState("conflict");
      } else {
        setSaveState(offline() ? "offline" : "error");
        if (result.reason === "invalid") setMessage({ text: result.message, error: true });
      }
    } finally {
      savingRef.current = false;
    }
  }, [initial.id, isAnnotation, ownerId]);

  // Every change: keep it on this device right away, save to the Vault 2 s after the last change.
  useEffect(() => {
    if (state.rev === 0 || state.rev === savedRevRef.current) return;
    setSaveState((s) => (s === "conflict" || s === "locked" ? s : "pending"));
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void putDraft({ id: initial.id, data: stateRef.current.data, title: titleRef.current, baseVersion: versionRef.current, savedAt: new Date().toISOString() })
        .catch(() => setMessage({ text: "This browser couldn't keep a local copy. Changes still save to the Vault while you're online.", error: true }));
    }, 250);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (saveState !== "conflict" && saveState !== "locked") saveTimer.current = setTimeout(() => void save(), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rev]);

  useEffect(() => {
    const online = () => { if (stateRef.current.rev !== savedRevRef.current) void save(); };
    const leaving = (e: BeforeUnloadEvent) => {
      if (stateRef.current.rev !== savedRevRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    const hidden = () => { if (document.visibilityState === "hidden" && stateRef.current.rev !== savedRevRef.current) void save(); };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", leaving);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [save]);

  const touch = useCallback(() => dispatch({ type: "meta", data: stateRef.current.data }), []);

  // Keyboard: undo/redo and tool letters (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); dispatch({ type: "redo" }); return; }
      if (mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "p") setTool("pen");
      else if (key === "e") setTool("eraser");
      else if (key === "a") setTool("arrow");
      else if (key === "t") setTool("label");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toLogical(clientX: number, clientY: number): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((clientX - rect.left) / rect.width) * data.w, ((clientY - rect.top) / rect.height) * data.h];
  }
  const eraserRadius = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? Math.max(8, (14 / rect.width) * data.w) : 14;
  };
  const pressureOf = (e: PointerEvent | React.PointerEvent) => (e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5);

  function paint() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const p = pointer.current;
      if (!p) return;
      if (tool === "pen") setLive({ t: "pen", c: colour, s: size, pr: p.pressure, p: p.samples.map((v, i) => (i % 3 === 2 ? Math.round(v * 1000) : v)) });
      else if (tool === "arrow") {
        const n = p.samples.length;
        setLive({ t: "arrow", c: colour, s: Math.max(3, Math.round(size / 1.5)), a: [p.start[0], p.start[1], p.samples[n - 3], p.samples[n - 2]].map(Math.round) as Arrow["a"] });
      }
    });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (pointer.current) return; // one pointer at a time: a palm or second finger is ignored while drawing
    if (e.pointerType === "pen" && !penSeen.current) { penSeen.current = true; setFingerDraws(false); }
    if (e.pointerType === "touch" && !fingerDraws) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (restore) return;
    e.preventDefault();
    const [x, y] = toLogical(e.clientX, e.clientY);
    if (tool === "label") {
      setPendingLabel({ x: Math.round(x), y: Math.round(y) });
      setLabelText("");
      return;
    }
    if (full && tool !== "eraser") {
      setMessage({ text: "This drawing is full. Erase something, or start another sketch.", error: true });
      return;
    }
    // Capture keeps the stroke when the pointer leaves the element; some pointers (and synthetic
    // events) can't be captured, and drawing still works without it.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    pointer.current = { id: e.pointerId, type: e.pointerType, samples: [x, y, pressureOf(e)], start: [x, y], pressure: e.pointerType === "pen" };
    if (tool === "eraser") {
      const r = eraserRadius();
      setErasing(stateRef.current.data.items.filter((item) => !hits(item, x, y, r)));
    } else paint();
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length ? events : [e.nativeEvent];
    if (tool === "eraser") {
      const r = eraserRadius();
      setErasing((current) => {
        let rest = current ?? stateRef.current.data.items;
        for (const ev of list) { const [x, y] = toLogical(ev.clientX, ev.clientY); rest = rest.filter((item) => !hits(item, x, y, r)); }
        return rest;
      });
      return;
    }
    for (const ev of list) {
      const [x, y] = toLogical(ev.clientX, ev.clientY);
      if (p.samples.length / 3 >= LIMITS.pointsPerStroke * 4) break;
      p.samples.push(x, y, pressureOf(ev));
    }
    paint();
  }

  function finish(e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    pointer.current = null;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    setLive(null);
    const items = stateRef.current.data.items;
    if (tool === "eraser") {
      const rest = erasing;
      setErasing(null);
      if (!cancelled && rest && rest.length !== items.length) dispatch({ type: "commit", items: rest });
      return;
    }
    if (cancelled) return;
    if (tool === "pen") {
      const varied = p.pressure && p.samples.some((v, i) => i % 3 === 2 && v !== 0.5);
      const pen = makePen(p.samples, colour, size, varied);
      if (pen) dispatch({ type: "commit", items: [...items, pen] });
    } else if (tool === "arrow") {
      const n = p.samples.length;
      const [x2, y2] = [p.samples[n - 3], p.samples[n - 2]];
      if (Math.hypot(x2 - p.start[0], y2 - p.start[1]) < 8) return;
      const arrow: Arrow = { t: "arrow", c: colour, s: Math.max(3, Math.round(size / 1.5)), a: [p.start[0], p.start[1], x2, y2].map(Math.round) as Arrow["a"] };
      dispatch({ type: "commit", items: [...items, arrow] });
    }
  }

  function addLabel(e: React.FormEvent) {
    e.preventDefault();
    const text = labelText.trim().slice(0, LIMITS.labelChars);
    if (!pendingLabel || !text) return;
    dispatch({ type: "commit", items: [...stateRef.current.data.items, { t: "label", c: colour, s: labelSize, x: pendingLabel.x, y: pendingLabel.y, text }] });
    setPendingLabel(null);
    setLabelText("");
  }

  function changeAspect(next: SketchAspect) {
    if (data.items.length) return;
    setAspect(next);
    const size2 = canvasFor(next);
    dispatch({ type: "meta", data: { ...stateRef.current.data, w: size2.w, h: size2.h } });
  }

  function chooseBackground(id: string) {
    const next = { ...stateRef.current.data };
    if (id) next.bg = id; else delete next.bg;
    dispatch({ type: "meta", data: next });
  }

  async function uploadBackground(file: File | undefined) {
    if (!file || !initial.unit_id) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) { setMessage({ text: "Choose a PNG, JPEG, WebP or GIF image.", error: true }); return; }
    setBusy("Uploading the image to Google Drive…");
    try {
      const row = await uploadToDrive<{ id: string; name: string; state: string }>({ ownerId, projectId, fileId: crypto.randomUUID(), file, unitId: initial.unit_id });
      const added: EditorImage = { id: row.id, name: row.name, href: `/api/drive/file/${row.id}`, available: true,
        link: { entryId: null, componentId: null, characterId: null, unitId: initial.unit_id } };
      setBackgrounds((list) => [added, ...list]);
      chooseBackground(row.id);
      setMessage({ text: `"${row.name}" was added to the project and is now the background. The image itself isn't changed.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof DriveUnavailable ? "Google Drive isn't connected. Reconnect it in Settings, then try again. Nothing was sent."
        : error instanceof DriveOffline ? "The connection dropped. Try again." : "The upload couldn't finish.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function exportPng() {
    if (offline()) { setMessage({ text: "You're offline. Export when you're connected.", error: true }); return; }
    const svg = svgRef.current;
    if (!svg) return;
    setBusy("Making the PNG…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = data.w; canvas.height = data.h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, data.w, data.h);
      if (bgImage) {
        // Same-origin image (served by the Vault), so the canvas stays exportable.
        const img = await loadImage(bgImage.href);
        const scale = Math.min(data.w / img.naturalWidth, data.h / img.naturalHeight);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        ctx.drawImage(img, (data.w - w) / 2, (data.h - h) / 2, w, h);
      }
      const copy = svg.cloneNode(true) as SVGSVGElement;
      copy.querySelectorAll("[data-export-skip]").forEach((n) => n.remove());
      copy.setAttribute("width", String(data.w));
      copy.setAttribute("height", String(data.h));
      copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
      try {
        const marks = await loadImage(url);
        ctx.drawImage(marks, 0, 0, data.w, data.h);
      } finally {
        URL.revokeObjectURL(url);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("png");
      const stem = (isAnnotation && base ? base.name.replace(/\.[a-z0-9]{1,5}$/i, "") + " (annotated)" : (title.trim() || context) + " sketch")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").slice(0, 150).trim() || "sketch";
      const file = new File([blob], `${stem}.png`, { type: "image/png" });
      setBusy("Saving the PNG to Google Drive…");
      const link = isAnnotation && base ? base.link : { entryId: null, componentId: null, characterId: null, unitId: initial.unit_id };
      const row = await uploadToDrive<{ name: string }>({ ownerId, projectId, fileId: crypto.randomUUID(), file, ...link });
      setMessage({ text: `Exported "${row.name}" to Google Drive. It's a new file on the same ${isAnnotation ? "record" : "shot"}; ${isAnnotation ? "the original image and " : ""}this drawing stay as they are.`, error: false });
    } catch (error) {
      console.error("Drawing export failed", error);
      setMessage({ text: error instanceof DriveUnavailable ? "Google Drive isn't connected. Reconnect it in Settings to export; your drawing is saved."
        : error instanceof DriveOffline ? "The connection dropped during the export. Try again." : "The PNG couldn't be made or saved. Your drawing is unchanged.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function keepMineAsCopy() {
    setBusy("Saving your version…");
    try {
      const client = createClient();
      if (isAnnotation) {
        // One layer per image: replace the other version, starting from the newest one.
        const latest = await loadDrawing(client, ownerId, initial.id);
        if (!latest) { setMessage({ text: "This annotation was deleted elsewhere. Nothing was saved.", error: true }); return; }
        versionRef.current = latest.version;
        setSaveState("pending");
        await save();
        return;
      }
      const result = await createSketch(client, ownerId, projectId, {
        unitId: initial.unit_id!, aspect: aspectRef.current, title: `${titleRef.current || "Sketch"} (copy from this device)`.slice(0, 200),
        position: Date.now() / 1000, data: stateRef.current.data,
      });
      if (!result.ok) { setMessage({ text: result.message, error: true }); return; }
      await removeDraft(initial.id).catch(() => {});
      savedRevRef.current = stateRef.current.rev;
      router.push(`/vault/projects/${projectId}/drawings/${result.row.id}`);
    } finally {
      setBusy(null);
    }
  }

  async function discardMine() {
    await removeDraft(initial.id).catch(() => {});
    savedRevRef.current = stateRef.current.rev;
    window.location.reload();
  }

  async function remove() {
    const what = isAnnotation ? "these annotations (the image itself stays)" : "this sketch";
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return;
    setBusy("Deleting…");
    try {
      const result = await deleteDrawing(createClient(), ownerId, { id: initial.id, version: versionRef.current });
      if (!result.ok) { setMessage({ text: result.message, error: true }); return; }
      await removeDraft(initial.id).catch(() => {});
      savedRevRef.current = stateRef.current.rev;
      router.push(`/vault/projects/${projectId}`);
    } finally {
      setBusy(null);
    }
  }

  const shown = erasing ?? data.items;
  const toolButton = (t: Tool, label: string, key: string) => (
    <button type="button" aria-pressed={tool === t} className={`${button} ${tool === t ? pressed : ""}`} onClick={() => setTool(t)}
      title={`${label} (${key})`}>{label}</button>
  );
  const canvasWidth = `min(100%, calc((100dvh - 15rem) * ${data.w / data.h}))`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-muted">
          <Link className="underline underline-offset-4 hover:text-foreground" href={`/vault/projects/${projectId}`}>{projectTitle}</Link>
          <span aria-hidden> / </span><span>{context}</span>
        </nav>
        <p role="status" aria-live="polite" className={`text-sm ${saveState === "saved" ? "text-muted" : saveState === "saving" || saveState === "pending" ? "text-foreground" : "font-medium text-danger"}`}>
          {SAVE_TEXT[saveState]}
          {(saveState === "error" || saveState === "offline") && (
            <button type="button" className="ml-2 underline" onClick={() => void save()}>Retry</button>
          )}
        </p>
      </div>

      <h1 className="sr-only">{isAnnotation ? `Annotate ${base?.name ?? "image"}` : `Sketch: ${title || context}`}</h1>
      {!isAnnotation && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            Title
            <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); touch(); }} placeholder={context}
              className="min-h-11 rounded-xl border border-line bg-field px-3 text-base" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Shape
            <select value={aspect} disabled={data.items.length > 0} onChange={(e) => changeAspect(e.target.value as SketchAspect)}
              className="min-h-11 rounded-xl border border-line bg-field px-3 text-base" aria-describedby="shape-hint">
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Background
            <select value={data.bg ?? ""} onChange={(e) => chooseBackground(e.target.value)} className="min-h-11 max-w-56 rounded-xl border border-line bg-field px-3 text-base">
              <option value="">None</option>
              {backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={`${button} inline-flex cursor-pointer items-center`}>
            Upload image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={!!busy}
              onChange={(e) => { void uploadBackground(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p id="shape-hint" className="w-full text-xs text-muted">The shape can be changed while the sketch is empty. A background image is shown under your strokes and is never changed.</p>
        </div>
      )}

      {restore && (
        <div role="alert" className="rounded-xl border border-accent bg-card p-3 text-sm">
          <p>This device has unsaved changes to this {isAnnotation ? "annotation" : "sketch"} from {new Date(restore.savedAt).toLocaleString()}.
            {restore.baseVersion !== initial.version && " The Vault copy has changed since then, so restoring will ask how to keep both."}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${button} ${pressed}`} onClick={() => {
              dispatch({ type: "replace", data: parseDrawing(restore.data, fallback) });
              setTitle(restore.title);
              versionRef.current = restore.baseVersion;
              setRestore(null);
            }}>Restore unsaved changes</button>
            <button type="button" className={button} onClick={() => { void removeDraft(initial.id).catch(() => {}); setRestore(null); }}>
              Keep the Vault copy (saved {savedLabel})
            </button>
          </div>
        </div>
      )}

      {saveState === "conflict" && (
        <div role="alert" className="rounded-xl border border-danger bg-card p-3 text-sm">
          <p>This {isAnnotation ? "annotation" : "sketch"} was changed somewhere else (another tab or device) after you opened it. Nothing was overwritten, and your version is kept on this device.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${button} ${pressed}`} disabled={!!busy} onClick={() => void keepMineAsCopy()}>
              {isAnnotation ? "Keep mine (replace the other version)" : "Save mine as a copy"}
            </button>
            <button type="button" className={button} disabled={!!busy} onClick={() => void discardMine()}>Discard mine and load the other version</button>
          </div>
        </div>
      )}

      <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-2">
        {toolButton("pen", "Pen", "P")}
        {toolButton("eraser", "Eraser", "E")}
        {toolButton("arrow", "Arrow", "A")}
        {toolButton("label", "Label", "T")}
        <span className="mx-1 h-8 w-px bg-line" aria-hidden />
        <button type="button" className={button} disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })} title="Undo (Ctrl/⌘ Z)">Undo</button>
        <button type="button" className={button} disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })} title="Redo (Ctrl/⌘ Shift Z)">Redo</button>
        <button type="button" className={button} disabled={!data.items.length} onClick={() => dispatch({ type: "commit", items: [] })}>Clear</button>
        <span className="mx-1 h-8 w-px bg-line" aria-hidden />
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={fingerDraws} onChange={(e) => setFingerDraws(e.target.checked)} />
          Draw with finger
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Colour</legend>
          {COLOURS.map((c) => (
            <button key={c.value} type="button" aria-pressed={colour === c.value} aria-label={c.label} title={c.label}
              onClick={() => setColour(c.value)}
              className={`h-11 w-11 rounded-full border-2 ${colour === c.value ? "border-accent ring-4 ring-accent/30" : "border-line"}`}
              style={{ background: c.value }} />
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">{tool === "label" ? "Label size" : "Pen size"}</legend>
          {tool === "label"
            ? LABEL_SIZES.map((s, i) => (
              <button key={s} type="button" aria-pressed={labelSize === s} className={`${button} ${labelSize === s ? pressed : ""}`} onClick={() => setLabelSize(s)}>
                {["Small", "Medium", "Large"][i]}
              </button>))
            : PEN_SIZES.map((s) => (
              <button key={s.value} type="button" aria-pressed={size === s.value} className={`${button} ${size === s.value ? pressed : ""}`} onClick={() => setSize(s.value)}>
                {s.label}
              </button>))}
        </fieldset>
      </div>

      {pendingLabel && (
        <form onSubmit={addLabel} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card p-3">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            Label text
            <input autoFocus value={labelText} maxLength={LIMITS.labelChars} onChange={(e) => setLabelText(e.target.value)}
              className="min-h-11 rounded-xl border border-line bg-field px-3 text-base" />
          </label>
          <button type="submit" className={`${button} ${pressed}`} disabled={!labelText.trim()}>Add label</button>
          <button type="button" className={button} onClick={() => setPendingLabel(null)}>Cancel</button>
        </form>
      )}

      {sizeState(data) === "warn" && (
        <p className="text-sm text-danger">This drawing is getting large. It still saves, but consider starting another sketch.</p>
      )}
      {bgImage && !bgImage.available && (
        <p className="text-sm text-danger">{isAnnotation ? "The original image" : "The background image"} is unavailable in Google Drive; your marks are kept.</p>
      )}
      {!bgImage && data.bg && <p className="text-sm text-muted">The background image is no longer in this project; your strokes are kept.</p>}

      <div className="flex justify-center">
        <svg ref={svgRef} viewBox={`0 0 ${data.w} ${data.h}`} preserveAspectRatio="none" role="img"
          aria-label={`${isAnnotation ? "Annotation" : "Sketch"} canvas: ${data.items.length} mark${data.items.length === 1 ? "" : "s"}. Draw with a pen, mouse or finger.`}
          className={`block rounded-xl border border-line bg-white shadow-sm ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
          style={{ width: canvasWidth, aspectRatio: `${data.w} / ${data.h}`, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)} onPointerCancel={(e) => finish(e, true)}
          onContextMenu={(e) => e.preventDefault()}>
          <rect width={data.w} height={data.h} fill="#ffffff" />
          {bgImage && bgImage.available && (
            <image data-export-skip href={bgImage.href} width={data.w} height={data.h} preserveAspectRatio="xMidYMid meet" />
          )}
          <g data-drawing-items>{shown.map((item, i) => <ItemShape key={i} item={item} />)}</g>
          {live && <g data-export-skip><ItemShape item={live} live /></g>}
          {pendingLabel && <circle data-export-skip cx={pendingLabel.x} cy={pendingLabel.y} r={data.w / 160} fill={colour} stroke="#111827" />}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Pencil draws; while it touches the screen, other touches are ignored (a website can&apos;t use the iPad&apos;s own palm rejection).
          Shortcuts: P pen, E eraser, A arrow, T label, Ctrl/⌘ Z undo.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!!busy || (isAnnotation && !base?.available)} onClick={() => void exportPng()}>Export PNG to Drive</button>
          <button type="button" className={`${button} text-danger`} disabled={!!busy} onClick={() => void remove()}>
            {isAnnotation ? "Delete annotations" : "Delete sketch"}
          </button>
        </div>
      </div>
      {busy && <p role="status" className="text-sm">{busy}</p>}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-danger" : "text-foreground"}`}>
          {message.text} <button type="button" className="ml-1 underline" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}
    </div>
  );
}
