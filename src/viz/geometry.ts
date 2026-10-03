/** Canvas angle of 12 o'clock. Canvas y grows downward, so increasing angles run clockwise. */
export const TOP = -Math.PI / 2;
const PHI = (1 + Math.sqrt(5)) / 2;
/** The golden ratio's conjugate (1/PHI^2 ≈ 0.382), used as the glow's decay time in seconds. */
export const GLOW_SECONDS = 2 - PHI;

export function nodeAngle(index: number, count: number): number {
  return TOP + (2 * Math.PI * index) / count;
}

/** On node k exactly when beat k is heard; one revolution per bar. */
export function handAngle(beatInBar: number, phase: number, count: number): number {
  return TOP + (2 * Math.PI * (beatInBar + phase)) / count;
}

export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function linearNodeX(index: number, count: number, left: number, width: number): number {
  return left + (width * index) / count;
}

export function linearStickX(
  beatInBar: number,
  phase: number,
  count: number,
  left: number,
  width: number,
): number {
  return left + (width * (beatInBar + phase)) / count;
}

/** How much of the hit glow a muted beat still gets: damped, not zeroed, so a muted beat reads as
 *  "ticking silently" rather than completely inert. */
export const MUTE_GLOW_SCALE = 0.25;

/** 1 at the beat, fading quadratically to 0 at `decay` seconds. */
export function glowIntensity(sinceBeat: number, decay = GLOW_SECONDS): number {
  if (sinceBeat < 0 || sinceBeat >= decay) return 0;
  const k = 1 - sinceBeat / decay;
  return k * k;
}

export function circularLayout(width: number, height: number) {
  const size = Math.min(width, height);
  const labelPad = Math.max(18, size * 0.07);
  const r = Math.max(10, size / 2 - labelPad - 12);
  // Hub shrunk to 2/3 of its previous size (0.24 -> 0.16): less dead space at the center.
  return { cx: width / 2, cy: height / 2, r, hub: r * 0.16, labelPad };
}

export function linearLayout(width: number, height: number) {
  const pad = Math.max(34, width * 0.08);
  return { left: pad, width: Math.max(10, width - pad * 2), y: height / 2 };
}

/** Straight-line distance between adjacent node centers on a circle of radius `r`. */
export function circularNodeSpacing(count: number, r: number): number {
  return count > 1 ? 2 * r * Math.sin(Math.PI / count) : Number.POSITIVE_INFINITY;
}

/** Distance between adjacent node centers on a track of the given width. */
export function linearNodeSpacing(count: number, width: number): number {
  return count > 1 ? width / count : Number.POSITIVE_INFINITY;
}

/**
 * `span`: circle radius (circular) or half the track width (linear).
 * `spacing`: distance between adjacent node centers (see the helpers above).
 * Fixed at 17 (the settings beat-row dot radius) to match it, only shrinking
 * below that when the span is too small to fit it or beats are packed too tight.
 */
export function nodeRadius(span: number, spacing: number): number {
  return Math.max(5, Math.min(17, span * 0.14, spacing * 0.42));
}

/**
 * Radius of the subdivision dots, spread evenly along the visible gap between two beat nodes
 * (`spacing` = that gap's length / subdivision, center to center). 40% of a beat node when there
 * is room, shrinking to keep 3px between neighbouring dots; 0 (skip drawing) under 1.5px.
 */
export function subDotRadius(nodeR: number, spacing: number): number {
  const r = Math.min(nodeR * 0.4, spacing / 2 - 1.5);
  return r >= 1.5 ? r : 0;
}

export const MAX_PER_ROW = 4;

export interface BeatCell {
  row: number;
  col: number;
  /** Number of beats sharing this node's row (linear) or ring (circular). */
  rowCount: number;
  /** Total rows/rings for this beat count. */
  rows: number;
}

/** Splits `count` beats into rows/rings of at most `maxPerRow`, in beat order; the last row may be shorter. */
export function beatLayoutGrid(count: number, maxPerRow = MAX_PER_ROW): BeatCell[] {
  const rows = Math.max(1, Math.ceil(count / maxPerRow));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / maxPerRow);
    const rowStart = row * maxPerRow;
    const rowCount = Math.min(maxPerRow, count - rowStart);
    return { row, col: i - rowStart, rowCount, rows };
  });
}

/**
 * X position of column `col` (of `rowCount` nodes in that row) on a track of the given width.
 * A full row reserves one equal interval after its last beat for the bar line. Shorter rows are
 * centered with that final interval included, so all intervals stay the same size.
 */
export function linearGridX(
  col: number,
  rowCount: number,
  left: number,
  width: number,
  maxPerRow = MAX_PER_ROW,
): number {
  const cell = width / maxPerRow;
  const rowWidth = cell * rowCount;
  const rowLeft = left + (width - rowWidth) / 2;
  return rowLeft + cell * col;
}

/**
 * X of the moving stick while beat `col` (of `rowCount` in its row) is playing, `phase` 0..1
 * through it, on the same cell grid as `linearGridX`: on the sphere at phase 0, on the next
 * sphere at phase 1. The row's last beat sweeps a full cell to the row's bar line.
 */
export function linearGridStickX(
  col: number,
  phase: number,
  rowCount: number,
  left: number,
  width: number,
  maxPerRow = MAX_PER_ROW,
): number {
  const cell = width / maxPerRow;
  return linearGridX(col, rowCount, left, width, maxPerRow) + cell * phase;
}

/** Y position of `row` (of `rows` total), stacked symmetrically around `centerY` with fixed spacing. */
export function linearGridY(row: number, rows: number, centerY: number, rowGap: number): number {
  return centerY + (row - (rows - 1) / 2) * rowGap;
}

/** Radius of ring `row` (of `rows` total, row 0 = outermost), evenly spaced between `maxR` and `minR`. */
export function circularRingRadius(row: number, rows: number, maxR: number, minR: number): number {
  if (rows <= 1) return maxR;
  return maxR - (row * (maxR - minR)) / (rows - 1);
}

export interface LinearMetrics {
  track: { left: number; width: number; y: number };
  cells: BeatCell[];
  rows: number;
  nodeR: number;
  tick: number;
  reach: number;
  rowGap: number;
  /** Line cut-off from a node center (the ring/line stops this far from each node). */
  gap: number;
  cellW: number;
  rowY: (row: number) => number;
  nodeX: (col: number, rowCount: number) => number;
}

/** All the row/column/size math the linear view and its hit test share. Rows shrink together to
 *  fit the canvas height, keeping the outer rows' stick on-canvas, but never so far that
 *  neighbouring spheres touch. */
export function linearMetrics(width: number, height: number, count: number): LinearMetrics {
  const track = linearLayout(width, height);
  const cells = beatLayoutGrid(count);
  const rows = cells[0]?.rows ?? 1;
  const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(Math.min(count, 4), track.width));
  const tick = Math.max(18, nodeR * 2);
  const reach = tick * 2.2; // the stick's half-height, the tallest thing drawn around a row
  const rowGap =
    rows > 1
      ? Math.max(nodeR * 2 + 6, Math.min(tick * 3.2, (height - reach * 2) / (rows - 1)))
      : tick * 3.2;
  const gap = nodeR + 5;
  const cellW = track.width / MAX_PER_ROW;
  const rowY = (row: number) => linearGridY(row, rows, track.y, rowGap);
  const nodeX = (col: number, rowCount: number) =>
    linearGridX(col, rowCount, track.left, track.width);
  return { track, cells, rows, nodeR, tick, reach, rowGap, gap, cellW, rowY, nodeX };
}
