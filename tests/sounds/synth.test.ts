import { describe, expect, it } from 'vitest';
import { BUILTIN_SOUNDS, renderClick } from '../../src/sounds/synth';

describe('renderClick', () => {
  it('renders the requested length', () => {
    expect(renderClick({ frequency: 1000, durationMs: 50, decayMs: 10 }, 48000).length).toBe(2400);
  });

  it('starts sounding within the first millisecond (no late onset)', () => {
    const { spec } = BUILTIN_SOUNDS['builtin:click'];
    if (!spec) throw new Error('builtin:click should be synthesized');
    const pcm = renderClick(spec, 48000);
    const onset = pcm.findIndex((v) => Math.abs(v) >= 0.1);
    expect(onset).toBeGreaterThanOrEqual(0);
    expect(onset).toBeLessThan(48);
  });

  it('never clips and ends in silence', () => {
    for (const { spec } of Object.values(BUILTIN_SOUNDS)) {
      if (!spec) continue;
      const pcm = renderClick(spec, 44100, () => 0.99);
      expect(Math.max(...pcm.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(Math.abs(pcm[pcm.length - 1] ?? 1)).toBe(0);
    }
  });

  it('starts with the four synth sounds, then the bundled WAV files', () => {
    const ids = Object.keys(BUILTIN_SOUNDS);
    expect(ids.slice(0, 4)).toEqual([
      'builtin:click-high',
      'builtin:click',
      'builtin:wood',
      'builtin:beep',
    ]);
    expect(ids.length).toBe(4 + 59);
  });

  it('points every file-backed built-in at a WAV that exists in public/sounds', () => {
    const bundled = new Set(
      Object.keys(import.meta.glob('../../public/sounds/*.wav')).map((p) => p.split('/').pop()),
    );
    for (const sound of Object.values(BUILTIN_SOUNDS)) {
      if (!sound.file) continue;
      expect(bundled.has(sound.file)).toBe(true);
    }
  });
});
