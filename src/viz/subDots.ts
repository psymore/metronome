import {
  circularLayout,
  circularNodeSpacing,
  linearMetrics,
  nodeAngle,
  nodeRadius,
  polar,
  subDotRadius,
} from './geometry';

/** Below this center-to-center spacing, dots are too small to tap directly and fan out instead. */
export const SUB_TAP_MIN_SPACING = 32;
/** Center-to-center spacing of an open fan's row of dots. */
export const SUB_FAN_PITCH = 44;
export const SUB_FAN_DOT_R = 11;
/** Distance from the group's in-place midpoint to the fan row's center, along its normal. */
export const SUB_FAN_OFFSET = 46;

export interface SubDot {
  beat: number;
  k: number;
  x: number;
  y: number;
  r: number;
}

export interface SubGroup {
  beat: number;
  /** Midpoint of the group's visible gap. */
  x: number;
  y: number;
  /** Unit vector the fan pops out along (outward on the circle, up on the line). */
  nx: number;
  ny: number;
  /** Unit vector the fan's row runs along, in playing order (clockwise / left→right). */
  tx: number;
  ty: number;
}

export interface SubDotLayout {
  dots: SubDot[];
  groups: SubGroup[];
  /** Smallest center-to-center spacing between neighbouring dots in this layout. */
  spacing: number;
  /** Dots are big and far enough apart to tap one directly (spacing ≥ SUB_TAP_MIN_SPACING). */
  direct: boolean;
}

function circularSubDotLayout(
  width: number,
  height: number,
  count: number,
  sub: number,
): SubDotLayout {
  const { cx, cy, r } = circularLayout(width, height);
  const nodeR = nodeRadius(r, circularNodeSpacing(count, r));
  const gap = 5;
  const gapAngle = Math.asin(Math.min(1, (nodeR + gap) / r));
  const arcSpan = (2 * Math.PI) / count - 2 * gapAngle;
  const spacing = (r * arcSpan) / sub;
  const dotR = subDotRadius(nodeR, spacing);

  const dots: SubDot[] = [];
  const groups: SubGroup[] = [];
  // Every beat gets a group whenever there's a subdivision, even if its dots are too small to
  // draw (dotR === 0) — a beat that's crammed too tight to show dots is exactly the case the fan
  // exists for, so it must still have a tappable target.
  if (sub > 1) {
    for (let i = 0; i < count; i++) {
      const start = nodeAngle(i, count) + gapAngle;
      if (dotR > 0) {
        for (let k = 1; k < sub; k++) {
          const p = polar(cx, cy, r, start + (arcSpan * k) / sub);
          dots.push({ beat: i, k, x: p.x, y: p.y, r: dotR });
        }
      }
      const a = start + arcSpan / 2;
      const mid = polar(cx, cy, r, a);
      // Outward along the radius (away from center), per the circle-mode fan direction.
      groups.push({
        beat: i,
        x: mid.x,
        y: mid.y,
        nx: Math.cos(a),
        ny: Math.sin(a),
        tx: -Math.sin(a),
        ty: Math.cos(a),
      });
    }
  }
  return { dots, groups, spacing, direct: spacing >= SUB_TAP_MIN_SPACING };
}

function linearSubDotLayout(
  width: number,
  height: number,
  count: number,
  sub: number,
): SubDotLayout {
  const { cells, nodeR, gap, cellW, rowY, nodeX } = linearMetrics(width, height, count);
  const fullDotR = subDotRadius(nodeR, (cellW - 2 * gap) / sub);

  const dots: SubDot[] = [];
  const groups: SubGroup[] = [];
  let minSpacing = Number.POSITIVE_INFINITY;
  // Every beat gets a group whenever there's a subdivision, even if its dots are too small to
  // draw (dotR === 0, e.g. a row's tight last beat) — it must still have a tappable target.
  if (sub > 1) {
    for (let i = 0; i < count; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const x0 = nodeX(cell.col, cell.rowCount);
      const last = cell.col === cell.rowCount - 1;
      const from = x0 + gap;
      const to = last ? x0 + cellW / 2 - 5 : nodeX(cell.col + 1, cell.rowCount) - gap;
      const spacing = (to - from) / sub;
      const dotR = fullDotR > 0 ? Math.min(fullDotR, subDotRadius(nodeR, spacing)) : 0;
      const y = rowY(cell.row);
      if (dotR > 0) {
        minSpacing = Math.min(minSpacing, spacing);
        for (let k = 1; k < sub; k++) {
          dots.push({ beat: i, k, x: from + ((to - from) * k) / sub, y, r: dotR });
        }
      }
      groups.push({ beat: i, x: (from + to) / 2, y, nx: 0, ny: -1, tx: 1, ty: 0 });
    }
  }
  return {
    dots,
    groups,
    spacing: Number.isFinite(minSpacing) ? minSpacing : 0,
    direct: Number.isFinite(minSpacing) && minSpacing >= SUB_TAP_MIN_SPACING,
  };
}

export function subDotLayout(
  kind: 'circular' | 'linear',
  width: number,
  height: number,
  count: number,
  sub: number,
): SubDotLayout {
  return kind === 'circular'
    ? circularSubDotLayout(width, height, count, sub)
    : linearSubDotLayout(width, height, count, sub);
}

/** Lays `clicks` fan dots out `SUB_FAN_PITCH` apart along the group's tangent, centered on the
 *  point offset `SUB_FAN_OFFSET` from the group along its normal, then shifts the whole row so
 *  every dot stays within the canvas. */
export function subFanLayout(
  group: SubGroup,
  clicks: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const cx = group.x + group.nx * SUB_FAN_OFFSET;
  const cy = group.y + group.ny * SUB_FAN_OFFSET;
  const half = ((clicks - 1) * SUB_FAN_PITCH) / 2;
  const points = Array.from({ length: clicks }, (_, j) => ({
    x: cx + group.tx * (j * SUB_FAN_PITCH - half),
    y: cy + group.ty * (j * SUB_FAN_PITCH - half),
  }));

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const pad = SUB_FAN_DOT_R + 4;
  let dx = 0;
  let dy = 0;
  if (minX < pad) dx = pad - minX;
  else if (maxX > width - pad) dx = width - pad - maxX;
  if (minY < pad) dy = pad - minY;
  else if (maxY > height - pad) dy = height - pad - maxY;

  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export type SubHit = { kind: 'dot'; beat: number; k: number } | { kind: 'group'; beat: number };

/** Nearest dot under (x, y) when the layout is directly tappable; otherwise the nearest group's
 *  own footprint (its gap's midpoint), which exists for every beat even when that beat has no
 *  drawable dots (e.g. a tightly packed row-end or a crowded circle) — the fan is always
 *  reachable even where there's nothing to see yet. */
export function subDotAt(layout: SubDotLayout, x: number, y: number): SubHit | null {
  if (layout.direct) {
    const maxR = Math.min(22, layout.spacing / 2);
    let best: { dot: SubDot; d: number } | null = null;
    for (const dot of layout.dots) {
      const d = Math.hypot(x - dot.x, y - dot.y);
      if (d <= maxR && (!best || d < best.d)) best = { dot, d };
    }
    return best ? { kind: 'dot', beat: best.dot.beat, k: best.dot.k } : null;
  }
  const maxR = 22;
  let best: { group: SubGroup; d: number } | null = null;
  for (const group of layout.groups) {
    const d = Math.hypot(x - group.x, y - group.y);
    if (d <= maxR && (!best || d < best.d)) best = { group, d };
  }
  return best ? { kind: 'group', beat: best.group.beat } : null;
}

/** Index of the nearest fan dot under (x, y), or -1. */
export function subFanDotAt(
  fan: readonly { x: number; y: number }[],
  x: number,
  y: number,
): number {
  const maxR = SUB_FAN_PITCH / 2;
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  fan.forEach((p, i) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= maxR && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
