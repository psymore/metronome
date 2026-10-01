import {
  circularLayout,
  circularNodeSpacing,
  linearMetrics,
  nodeAngle,
  nodeRadius,
  polar,
} from './geometry';
import {
  polyConcentricPositions,
  polyNodeRadius,
  polyPositions,
  polyStageLayout,
  usePolyConcentricLayout,
} from './polyGeometry';

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
  hitScale = 1.8,
): number {
  const { cx, cy, r } = circularLayout(width, height);
  const hitR = nodeRadius(r, circularNodeSpacing(count, r)) * hitScale;
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
  if (usePolyConcentricLayout(a, b, radius)) {
    return polyBeatAtConcentric(x, y, cx, cy, radius, a, b);
  }
  const nodeR = polyNodeRadius(a, b, radius);
  const {
    nodePosA: vertsA,
    nodePosB: vertsB,
    pairs,
  } = polyPositions(a, b, cx, cy, radius, nodeR, getSplitFrac);
  const hitR = nodeR * 1.8;

  // Coincident pairs still at rest (frac ≈ 0) act as a single combined target: tapping starts
  // the split animation instead of cycling either layer's level.
  const skipA = new Set<number>();
  const skipB = new Set<number>();
  let bestPair: { pair: (typeof pairs)[number]; d: number } | null = null;
  let bestClose: { pair: (typeof pairs)[number]; d: number } | null = null;
  const closeR = nodeR * 1.4;
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

/** Concentric-rings hit test: no split/hub/pair states exist here (the two rings' different radii
 *  already keep coincident indices apart), so this is a direct nearest-node lookup across both
 *  rings. */
function polyBeatAtConcentric(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
  a: number,
  b: number,
): PolyHit | null {
  const { vertsA, vertsB, nodeRadiusA, nodeRadiusB } = polyConcentricPositions(a, b, cx, cy, radius);
  let best: { hit: PolyHit; d: number } | null = null;
  const hitRA = nodeRadiusA * 1.8;
  for (const [i, v] of vertsA.entries()) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d <= hitRA && (!best || d < best.d)) best = { hit: { kind: 'node', layer: 'A', index: i }, d };
  }
  const hitRB = nodeRadiusB * 1.8;
  for (const [i, v] of vertsB.entries()) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d <= hitRB && (!best || d < best.d)) best = { hit: { kind: 'node', layer: 'B', index: i }, d };
  }
  return best?.hit ?? null;
}

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function linearBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
  hitScale = 1.8,
): number {
  const { cells, nodeR, rowY, nodeX } = linearMetrics(width, height, count);
  const hitR = nodeR * hitScale;
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    if (!cell) continue;
    const nx = nodeX(cell.col, cell.rowCount);
    const ny = rowY(cell.row);
    if (Math.hypot(x - nx, y - ny) <= hitR) return i;
  }
  return -1;
}
