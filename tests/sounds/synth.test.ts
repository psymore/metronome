import { describe, expect, it } from 'vitest';
import { BUILTIN_SOUNDS, renderClick } from '../../src/sounds/synth';

describe('renderClick', () => {
  it('renders the requested length', () => {
    expect(renderClick({ frequency: 1000, durationMs: 50, decayMs: 10 }, 48000).length).toBe(2400);
  });

  it('starts sounding within the first millisecond (no late onset)', () => {
    const pcm = renderClick(BUILTIN_SOUNDS['builtin:click'].spec, 48000);
    const onset = pcm.findIndex((v) => Math.abs(v) >= 0.1);
    expect(onset).toBeGreaterThanOrEqual(0);
    expect(onset).toBeLessThan(48);
  });

  it('never clips and ends in silence', () => {
    for (const { spec } of Object.values(BUILTIN_SOUNDS)) {
      const pcm = renderClick(spec, 44100, () => 0.99);
      expect(Math.max(...pcm.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(Math.abs(pcm[pcm.length - 1] ?? 1)).toBe(0);
    }
  });

  it('offers the four built-in sounds', () => {
    expect(Object.keys(BUILTIN_SOUNDS)).toEqual([
      'builtin:click-high',
      'builtin:click',
      'builtin:wood',
      'builtin:beep',
    ]);
  });
});
