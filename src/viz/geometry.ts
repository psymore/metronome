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

/** `span`: circle radius (circular) or half the track width (linear). */
export function nodeRadius(count: number, span: number): number {
  const perNode = count > 8 ? 0.045 : 0.07;
  return Math.max(5, Math.min(16, span * perNode));
}
