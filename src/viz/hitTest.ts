import {
  beatLayoutGrid,
  circularLayout,
  circularNodeSpacing,
  linearGridX,
  linearGridY,
  linearLayout,
  linearNodeSpacing,
  nodeAngle,
  nodeRadius,
  polar,
} from './geometry';

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function circularBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const { cx, cy, r } = circularLayout(width, height);
  const hitR = nodeRadius(r, circularNodeSpacing(count, r)) * 1.8;
  for (let i = 0; i < count; i++) {
    const p = polar(cx, cy, r, nodeAngle(i, count));
    if (Math.hypot(x - p.x, y - p.y) <= hitR) return i;
  }
  return -1;
}

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function linearBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const track = linearLayout(width, height);
  const cells = beatLayoutGrid(count);
  const rows = cells[0]?.rows ?? 1;
  const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(Math.min(count, 4), track.width));
  const tick = Math.max(18, nodeR * 2);
  const reach = tick * 2.2;
  // Keep identical to linearVisualizer.draw in linear.ts.
  const rowGap =
    rows > 1
      ? Math.max(nodeR * 2 + 6, Math.min(tick * 3.2, (height - reach * 2) / (rows - 1)))
      : tick * 3.2;
  const hitR = nodeR * 1.8;
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    if (!cell) continue;
    const nx = linearGridX(cell.col, cell.rowCount, track.left, track.width);
    const ny = linearGridY(cell.row, rows, track.y, rowGap);
    if (Math.hypot(x - nx, y - ny) <= hitR) return i;
  }
  return -1;
}
