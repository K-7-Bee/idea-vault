"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canvasFor, describeDrawing, emptyDrawing, type DrawingData } from "@/lib/drawing/format";
import { createSketch } from "@/lib/drawing/store";
import type { Row } from "@/lib/workspace";
import type { Writer } from "../record-section";
import DrawingView from "./drawing-view";

// Phase 7A: the sketches on one scene or shot, as thumbnails that open the editor, plus "+ Sketch".
export type DrawingSummary = {
  id: string; unit_id: string | null; base_file_id: string | null; title: string; aspect: string;
  position: number; updated_at: string; preview: DrawingData;
};

export default function SketchStrip({ unit, label, drawings, ownerId, projectId, writer }: {
  unit: Row; label: string; drawings: DrawingSummary[]; ownerId: string; projectId: string; writer: Writer;
}) {
  const router = useRouter();
  const mine = drawings.filter((d) => d.unit_id === unit.id).sort((a, b) => a.position - b.position || a.updated_at.localeCompare(b.updated_at));
  const disabled = writer.busy || !writer.online;

  function add() {
    const size = canvasFor("16:9");
    void writer.run(async (client) => {
      const result = await createSketch(client, ownerId, projectId, {
        unitId: unit.id, aspect: "16:9", title: "", position: (mine.at(-1)?.position ?? 0) + 1, data: emptyDrawing(size),
      });
      return result.ok ? { ok: true as const, value: result.row } : { ok: false as const, reason: "failed" as const, message: result.message };
    }, null, (row) => router.push(`/vault/projects/${projectId}/drawings/${row.id}`));
  }

  return (
    <div className="mt-2">
      {mine.length > 0 && (
        <ul aria-label={`Sketches for ${label}`} className="mb-2 grid grid-cols-2 gap-2">
          {mine.map((d, i) => {
            const name = d.title || `Sketch ${i + 1}`;
            return (
              <li key={d.id}>
                <Link href={`/vault/projects/${projectId}/drawings/${d.id}`}
                  className="block rounded-lg border border-line bg-white p-0.5 transition hover:border-accent focus-visible:border-accent">
                  <DrawingView data={d.preview} label={`Open ${describeDrawing(d.preview, name)}`} className="block h-auto w-full rounded-md" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" disabled={disabled} onClick={add}
        className="min-h-9 rounded-lg border border-line px-2.5 py-1 text-xs font-medium transition hover:bg-background disabled:opacity-40"
        aria-label={`Add a sketch to ${label}`}>
        + Sketch
      </button>
    </div>
  );
}
