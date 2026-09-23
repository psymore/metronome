export interface ClickSpec {
  frequency: number;
  durationMs: number;
  decayMs: number;
  /** 0–1 share of white noise mixed in (woodblock-style attack). */
  noise?: number;
}

export const BUILTIN_SOUNDS: Record<string, { name: string; spec: ClickSpec }> = {
  'builtin:click-high': {
    name: 'Click (high)',
    spec: { frequency: 1760, durationMs: 60, decayMs: 12 },
  },
  'builtin:click': { name: 'Click', spec: { frequency: 1320, durationMs: 60, decayMs: 12 } },
  'builtin:wood': {
    name: 'Woodblock',
    spec: { frequency: 900, durationMs: 80, decayMs: 18, noise: 0.25 },
  },
  'builtin:beep': { name: 'Beep', spec: { frequency: 880, durationMs: 90, decayMs: 60 } },
};

/** Sine burst with a 0.5 ms fade-in (no pop, onset well under 1 ms) and a 2 ms fade-out. */
export function renderClick(
  spec: ClickSpec,
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round((spec.durationMs / 1000) * sampleRate));
  const out = new Float32Array(length);
  const fadeIn = Math.max(1, Math.round(sampleRate * 0.0005));
  const decay = (spec.decayMs / 1000) * sampleRate;
  const noise = spec.noise ?? 0;
  for (let i = 0; i < length; i++) {
    const envelope = Math.min(1, (i + 1) / fadeIn) * Math.exp(-i / decay);
    const tone = Math.sin((2 * Math.PI * spec.frequency * i) / sampleRate);
    const hiss = noise > 0 ? (random() * 2 - 1) * noise : 0;
    out[i] = (tone * (1 - noise) + hiss) * envelope * 0.9;
  }
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.002));
  for (let i = 0; i < fadeOut; i++) {
    const idx = length - 1 - i;
    out[idx] = (out[idx] ?? 0) * (i / fadeOut);
  }
  return out;
}
