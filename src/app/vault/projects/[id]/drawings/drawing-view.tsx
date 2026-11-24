import type { DrawingData, Item } from "@/lib/drawing/format";
import { arrowPath, penPath } from "@/lib/drawing/render";

// Phase 7: draws validated drawing data as SVG. Colours are #rrggbb (checked by parseDrawing) and
// label text is a React text node, so nothing from the data becomes markup.
export function ItemShape({ item, live = false }: { item: Item; live?: boolean }) {
  if (item.t === "pen") return <path d={penPath(item, live)} fill={item.c} />;
  if (item.t === "arrow") {
    return <path d={arrowPath(item)} fill="none" stroke={item.c} strokeWidth={item.s} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return (
    <text x={item.x} y={item.y} fill={item.c} fontSize={item.s} fontFamily="system-ui, sans-serif" fontWeight={600}
      stroke={item.c === "#ffffff" ? "#111827" : "#ffffff"} strokeWidth={item.s / 10} paintOrder="stroke">
      {item.text}
    </text>
  );
}

/** A drawing (optionally over an image) as a scalable picture; used for thumbnails. */
export default function DrawingView({ data, label, imageHref, className, overlay = false }: {
  data: DrawingData; label: string; imageHref?: string | null; className?: string;
  // Phase 7B: marks only, laid over an image thumbnail; "slice" matches the thumbnail's object-cover crop.
  overlay?: boolean;
}) {
  return (
    <svg viewBox={`0 0 ${data.w} ${data.h}`} role="img" aria-label={label} className={className} preserveAspectRatio={overlay ? "xMidYMid slice" : "xMidYMid meet"}>
      {!overlay && <rect width={data.w} height={data.h} fill="#ffffff" />}
      {imageHref && <image href={imageHref} width={data.w} height={data.h} preserveAspectRatio="xMidYMid meet" />}
      {data.items.map((item, i) => <ItemShape key={i} item={item} />)}
    </svg>
  );
}
