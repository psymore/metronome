export interface PolyVertex {
  x: number;
  y: number;
}

/** Two vertices of layers A and B that share the same ring position (i/a === j/b). */
export interface PolyPair {
  key: string;
  aIndex: number;
  bIndex: number;
  /** The shared ring position, unaffected by any expansion animation. */
  x: number;
  y: number;
}

export function polygonVertices(
  n: number,
  cx: number,
  cy: number,
  radius: number,
): PolyVertex[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

/** The shared square region both polygon layers are inscribed in, centered like circularLayout. */
export function polyStageLayout(width: number, height: number) {
  const size = Math.min(width, height);
  const pad = Math.max(18, size * 0.12);
  const radius = Math.max(10, size / 2 - pad);
  return { cx: width / 2, cy: height / 2, radius };
}

/** Stable identifier for a coincident pair — used as a key by the expansion animation state. */
export function pairKey(aIndex: number, bIndex: number): string {
  return `${aIndex}|${bIndex}`;
}

/**
 * Detects vertex pairs (i in A, j in B) that land on the exact same ring position (whenever
 * `i/a === j/b`). Index 0 always coincides; further pairs appear when a and b share a factor.
 * The result is purely geometric — the controller applies the split animation via
 * {@link splitPositions}.
 */
export function polyPairs(a: number, b: number): PolyPair[] {
  const pairs: PolyPair[] = [];
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < b; j++) {
      if (i * b === j * a) {
        pairs.push({ key: pairKey(i, j), aIndex: i, bIndex: j, x: 0, y: 0 });
      }
    }
  }
  return pairs;
}

export interface PolyLayout {
  vertsA: PolyVertex[];
  vertsB: PolyVertex[];
  /** Coincident pairs, each carrying its shared ring position. */
  pairs: PolyPair[];
}

/**
 * Places layer A and B vertices on the ring. Each coincident pair whose `getSplitFrac(key)`
 * returns >0 is nudged apart: A up-and-left, B up-and-right, by a fixed diagonal offset scaled
 * by `frac`. `frac === 0` leaves the pair symmetric at its shared position, so the controller
 * can render a single "combined" node there.
 */
export function polyPositions(
  a: number,
  b: number,
  cx: number,
  cy: number,
  radius: number,
  nodeRadius: number,
  getSplitFrac?: (key: string) => number,
): PolyLayout {
  const vertsA = polygonVertices(a, cx, cy, radius);
  const vertsB = polygonVertices(b, cx, cy, radius);
  const pairs = polyPairs(a, b).map((p) => {
    const va = vertsA[p.aIndex];
    const vb = vertsB[p.bIndex];
    const x = va?.x ?? vb?.x ?? cx;
    const y = va?.y ?? vb?.y ?? cy;
    return { ...p, x, y };
  });
  const offset = nodeRadius * 1.5;
  const dx = offset * Math.SQRT1_2;
  for (const p of pairs) {
    const frac = Math.max(0, Math.min(1, getSplitFrac?.(p.key) ?? 0));
    if (frac === 0) continue;
    const shiftA = { x: -dx * frac, y: -dx * frac };
    const shiftB = { x: dx * frac, y: -dx * frac };
    const va = vertsA[p.aIndex];
    const vb = vertsB[p.bIndex];
    if (va) vertsA[p.aIndex] = { x: va.x + shiftA.x, y: va.y + shiftA.y };
    if (vb) vertsB[p.bIndex] = { x: vb.x + shiftB.x, y: vb.y + shiftB.y };
  }
  return { vertsA, vertsB, pairs };
}
