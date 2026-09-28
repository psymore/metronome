/** Canvas angle of 12 o'clock. Canvas y grows downward, so increasing angles run clockwise. */
export const TOP = -Math.PI / 2;
export const GLOW_SECONDS = 0.35;

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
  const pad = Math.max(24, width * 0.08);
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
 * Cells are sized for a full row of `maxPerRow` so spacing stays consistent across rows; a
 * shorter row is centered as a group rather than stretched to fill the full width.
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
  return rowLeft + cell * (col + 0.5);
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
