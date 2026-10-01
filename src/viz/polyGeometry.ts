import { circularNodeSpacing } from './geometry';

export interface PolyVertex {
  x: number;
  y: number;
}

/** Node ball radius for a polyrhythm stage, auto-scaled the same way circular/linear views scale
 *  theirs: from the tighter of the two layers' vertex spacing, so it shrinks gracefully as a or b
 *  grows instead of using a fixed size that's cramped on large ratios and tiny on small ones. */
export function polyNodeRadius(a: number, b: number, radius: number): number {
  const spacing = Math.min(circularNodeSpacing(a, radius), circularNodeSpacing(b, radius));
  // Poly nodes render smaller than a standard-meter ring at the same spacing because prism/other
  // style kits now draw taller, wider shapes than a plain disc — give poly a slightly bigger
  // fraction of the available spacing so those shapes get comparable breathing room.
  return Math.max(5, Math.min(19, radius * 0.16, spacing * 0.48));
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

export function polygonVertices(n: number, cx: number, cy: number, radius: number): PolyVertex[] {
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

/** Below this center-to-center spacing on a single shared ring, poly nodes start to crowd/overlap
 *  — the same kind of threshold `circularSubDotLayout` uses to switch a beat's subdivisions from
 *  in-gap dots to an inner ring. Below it, polyrhythm drawing switches to two concentric rings
 *  instead of one shared ring with split/hub conjunctions. */
const POLY_CONCENTRIC_SPACING_THRESHOLD = 30;

/** Smallest angular gap (radians) between any two neighboring tick marks once layer A's `a`
 *  evenly-spaced positions and layer B's `b` are merged onto one ring — i.e. the real crowding a
 *  shared ring has to deal with, not either layer's own spacing alone. Coincident positions (where
 *  `i/a === j/b`) are deduped via an exact-integer comparison (ticks counted in units of `1/(a*b)`)
 *  so a shared vertex (always true for index 0) never reads as a zero-width gap. */
function minAngularGap(a: number, b: number): number {
  const total = a * b;
  const ticks = new Set<number>();
  for (let i = 0; i < a; i++) ticks.add(i * b);
  for (let j = 0; j < b; j++) ticks.add(j * a);
  const sorted = Array.from(ticks).sort((x, y) => x - y);
  if (sorted.length < 2) return 2 * Math.PI;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i] as number;
    const next = sorted[(i + 1) % sorted.length] as number;
    const gap = next > curr ? next - curr : total - curr + next;
    min = Math.min(min, gap);
  }
  return (min / total) * 2 * Math.PI;
}

/** True once a single shared ring would pack layer A and B's interleaved nodes too tight to read
 *  — the signal the concentric-rings drawing/hit-test/tap paths use to take over from the
 *  split/hub ones. Must look at the two layers' *merged* positions, not each layer's own spacing:
 *  e.g. 15:14 has 15 and 14 nodes that are individually well spaced, but interleaved on one ring
 *  they're nearly on top of each other. */
export function usePolyConcentricLayout(a: number, b: number, radius: number): boolean {
  const spacing = radius * minAngularGap(a, b);
  return spacing < POLY_CONCENTRIC_SPACING_THRESHOLD;
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
  /** Outline vertices, always at their true polygon position — never shifted by a split. */
  vertsA: PolyVertex[];
  vertsB: PolyVertex[];
  /** Node-ball display positions: equal to vertsA/vertsB except at split pairs, where they're
   *  nudged apart along that vertex's own radial diagonal. Draw node balls here, outlines from
   *  vertsA/vertsB, so a split never distorts the polygon shape. */
  nodePosA: PolyVertex[];
  nodePosB: PolyVertex[];
  /** Coincident pairs, each carrying its shared ring position. */
  pairs: PolyPair[];
}

/**
 * Places layer A and B vertices on the ring. The returned `vertsA`/`vertsB` are always the true
 * (unshifted) polygon vertices, so the connecting outline never moves. Each coincident pair whose
 * `getSplitFrac(key)` returns >0 additionally gets shifted "node display" positions in
 * `nodePosA`/`nodePosB`: nudged apart along that vertex's own radial diagonal (rotated ±60° from
 * the outward direction at that vertex), so a conjunction at the top splits NE/NW, one at the
 * bottom splits SE/SW, and so on for any polygon shape. `frac === 0` leaves both positions equal,
 * so the controller can render a single "combined" node there.
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
  const nodePosA = vertsA.map((v) => ({ ...v }));
  const nodePosB = vertsB.map((v) => ({ ...v }));
  const pairs = polyPairs(a, b).map((p) => {
    const va = vertsA[p.aIndex];
    const vb = vertsB[p.bIndex];
    const x = va?.x ?? vb?.x ?? cx;
    const y = va?.y ?? vb?.y ?? cy;
    return { ...p, x, y };
  });
  const offset = nodeRadius * 1.5 * 1.7;
  // Half-angle between the two split diagonals and "straight out" from the vertex. Wider than a
  // plain 45deg so the two branched nodes read as clearly separated, not just a narrow fork.
  const splitAngle = (60 * Math.PI) / 180;
  const cosA = Math.cos(splitAngle);
  const sinA = Math.sin(splitAngle);
  for (const p of pairs) {
    const frac = Math.max(0, Math.min(1, getSplitFrac?.(p.key) ?? 0));
    if (frac === 0) continue;
    // Outward radial direction at this vertex (from stage center through the shared position).
    const rdx = p.x - cx;
    const rdy = p.y - cy;
    const rlen = Math.hypot(rdx, rdy) || 1;
    const rx = rdx / rlen;
    const ry = rdy / rlen;
    // Rotate the radial unit vector by -splitAngle and +splitAngle so the split reads as the
    // two diagonals flanking "straight out" from the ring at this point.
    const rotate = (x: number, y: number, sign: 1 | -1) => ({
      x: x * cosA - sign * y * sinA,
      y: sign * x * sinA + y * cosA,
    });
    const dir1 = rotate(rx, ry, -1);
    const dir2 = rotate(rx, ry, 1);
    // The collapsed conjunction node always paints layer A on the screen-space LEFT half and
    // layer B on the right (drawCombinedHalf's fixed left/right split), independent of where the
    // vertex sits on the ring. Assigning A/B here by rotation sign alone (always -angle -> A)
    // flips which physical side ends up A vs B depending on the vertex's radial direction — e.g.
    // a vertex whose "straight out" points downward gets the opposite left/right pairing from one
    // pointing upward, so splitting visibly swaps identities vs. the still-merged coloring.
    // Picking by actual resulting x keeps the split's left/right consistent with the combined
    // node's fixed left=A/right=B convention at every vertex.
    const dirA = dir1.x <= dir2.x ? dir1 : dir2;
    const dirB = dir1.x <= dir2.x ? dir2 : dir1;
    const va = vertsA[p.aIndex];
    const vb = vertsB[p.bIndex];
    if (va) {
      nodePosA[p.aIndex] = { x: va.x + dirA.x * offset * frac, y: va.y + dirA.y * offset * frac };
    }
    if (vb) {
      nodePosB[p.bIndex] = { x: vb.x + dirB.x * offset * frac, y: vb.y + dirB.y * offset * frac };
    }
  }
  return { vertsA, vertsB, nodePosA, nodePosB, pairs };
}

/** A coincident-pair link in concentric mode: the short connecting line from the outer node to
 *  its matching inner node, drawn instead of a split/hub conjunction. */
export interface PolyConcentricLink {
  aIndex: number;
  bIndex: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface PolyConcentricLayout {
  vertsA: PolyVertex[];
  vertsB: PolyVertex[];
  nodeRadiusA: number;
  nodeRadiusB: number;
  links: PolyConcentricLink[];
}

function concentricNodeRadius(count: number, radius: number): number {
  const spacing = circularNodeSpacing(count, radius);
  return Math.max(4, Math.min(16, radius * 0.16, spacing * 0.48));
}

/**
 * Two-ring layout used once {@link usePolyConcentricLayout} fires: the layer with more beats sits
 * on the outer ring at `radius`, the other on an inner ring at `radius * 0.6`. Each ring is its
 * own plain polygon (no split/offset), so coincident indices never overlap — they're simply at
 * different radii. `links` carries the coincident-pair positions so the caller can draw a short
 * connecting line between them instead of a combined/hub node.
 */
export function polyConcentricPositions(
  a: number,
  b: number,
  cx: number,
  cy: number,
  radius: number,
): PolyConcentricLayout {
  const outerIsA = a >= b;
  const outerCount = outerIsA ? a : b;
  const innerCount = outerIsA ? b : a;
  const innerRadius = radius * 0.6;
  const outerVerts = polygonVertices(outerCount, cx, cy, radius);
  const innerVerts = polygonVertices(innerCount, cx, cy, innerRadius);
  const vertsA = outerIsA ? outerVerts : innerVerts;
  const vertsB = outerIsA ? innerVerts : outerVerts;
  const nodeRadiusA = outerIsA
    ? concentricNodeRadius(outerCount, radius)
    : concentricNodeRadius(innerCount, innerRadius);
  const nodeRadiusB = outerIsA
    ? concentricNodeRadius(innerCount, innerRadius)
    : concentricNodeRadius(outerCount, radius);
  const links = polyPairs(a, b).map((p) => {
    const va = vertsA[p.aIndex];
    const vb = vertsB[p.bIndex];
    return {
      aIndex: p.aIndex,
      bIndex: p.bIndex,
      ax: va?.x ?? cx,
      ay: va?.y ?? cy,
      bx: vb?.x ?? cx,
      by: vb?.y ?? cy,
    };
  });
  return { vertsA, vertsB, nodeRadiusA, nodeRadiusB, links };
}
