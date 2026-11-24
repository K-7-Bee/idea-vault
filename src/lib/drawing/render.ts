// Phase 7: SVG geometry for drawing items. Pen strokes become filled outlines (perfect-freehand),
// shaped by pressure only when the stroke recorded real pressure.
import { getStroke } from "perfect-freehand";
import type { Arrow, Pen } from "./format";

function outlineToPath(points: number[][]): string {
  if (points.length < 2) return "";
  const avg = (a: number, b: number) => ((a + b) / 2).toFixed(1);
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d += `${x0.toFixed(1)},${y0.toFixed(1)} ${avg(x0, x1)},${avg(y0, y1)} `;
  }
  return `${d}Z`;
}

export function penPath(pen: Pen, live = false): string {
  const pts: number[][] = [];
  for (let i = 0; i + 2 < pen.p.length; i += 3) pts.push([pen.p[i], pen.p[i + 1], pen.pr ? pen.p[i + 2] / 1000 : 0.5]);
  const outline = getStroke(pts, {
    size: pen.s,
    thinning: pen.pr ? 0.6 : 0,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: !live,
  });
  return outlineToPath(outline);
}

/** The shaft and the two head lines of an arrow, as one path to stroke. */
export function arrowPath(arrow: Arrow): string {
  const [x1, y1, x2, y2] = arrow.a;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(14, arrow.s * 4);
  const left = [x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7)];
  const right = [x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7)];
  return `M${x1},${y1} L${x2},${y2} M${left[0].toFixed(1)},${left[1].toFixed(1)} L${x2},${y2} L${right[0].toFixed(1)},${right[1].toFixed(1)}`;
}
