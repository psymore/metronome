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
  return { cx: width / 2, cy: height / 2, r, hub: r * 0.24, labelPad };
}

export function linearLayout(width: number, height: number) {
  const pad = Math.max(24, width * 0.08);
  return { left: pad, width: Math.max(10, width - pad * 2), y: height * 0.36 };
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
