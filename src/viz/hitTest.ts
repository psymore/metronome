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
import { polyPositions, polyStageLayout } from './polyGeometry';

export type PolyHit =
  | { kind: 'node'; layer: 'A' | 'B'; index: number }
  | { kind: 'pair'; pairKey: string; aIndex: number; bIndex: number }
  | { kind: 'pair-close'; pairKey: string };

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

/**
 * Nearest polyrhythm node to (x, y) across both layers, or null. Because layer A and B can
 * share a vertex (e.g. index 0 is always at the top), ties are broken by closest distance
 * rather than layer order, and a hit ring of 18px keeps small polygons finger-tappable.
 */
export function polyBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  a: number,
  b: number,
  getSplitFrac: (key: string) => number,
): PolyHit | null {
  const { cx, cy, radius } = polyStageLayout(width, height);
  const { vertsA, vertsB, pairs } = polyPositions(a, b, cx, cy, radius, 10, getSplitFrac);
  const hitR = 18;

  // Coincident pairs still at rest (frac ≈ 0) act as a single combined target: tapping starts
  // the split animation instead of cycling either layer's level.
  const skipA = new Set<number>();
  const skipB = new Set<number>();
  let bestPair: { pair: (typeof pairs)[number]; d: number } | null = null;
  let bestClose: { pair: (typeof pairs)[number]; d: number } | null = null;
  const closeR = 11;
  for (const p of pairs) {
    const frac = getSplitFrac(p.key);
    if (frac >= 0.5) {
      // Fully (or mostly) branched: a small hit region at the ORIGINAL vertex position, which
      // now sits in the gap between the two split nodes, becomes the "close" affordance.
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= closeR && (!bestClose || d < bestClose.d)) bestClose = { pair: p, d };
      continue;
    }
    skipA.add(p.aIndex);
    skipB.add(p.bIndex);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= hitR && (!bestPair || d < bestPair.d)) bestPair = { pair: p, d };
  }
  let bestNode: { hit: PolyHit; d: number } | null = null;
  for (const [i, v] of vertsA.entries()) {
    if (skipA.has(i)) continue;
    const d = Math.hypot(x - v.x, y - v.y);
    if (d <= hitR && (!bestNode || d < bestNode.d)) {
      bestNode = { hit: { kind: 'node', layer: 'A', index: i }, d };
    }
  }
  for (const [i, v] of vertsB.entries()) {
    if (skipB.has(i)) continue;
    const d = Math.hypot(x - v.x, y - v.y);
    if (d <= hitR && (!bestNode || d < bestNode.d)) {
      bestNode = { hit: { kind: 'node', layer: 'B', index: i }, d };
    }
  }
  if (bestClose && (!bestNode || bestClose.d < bestNode.d)) {
    return { kind: 'pair-close', pairKey: bestClose.pair.key };
  }
  if (bestPair && (!bestNode || bestPair.d < bestNode.d)) {
    return {
      kind: 'pair',
      pairKey: bestPair.pair.key,
      aIndex: bestPair.pair.aIndex,
      bIndex: bestPair.pair.bIndex,
    };
  }
  return bestNode?.hit ?? null;
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
