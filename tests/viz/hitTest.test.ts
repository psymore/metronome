import { describe, expect, it } from 'vitest';
import { linearBeatAt } from '../../src/viz/hitTest';

describe('linearBeatAt', () => {
  it('fits 16 beats (4 rows) inside a 320px-tall mobile stage and hits their spheres', () => {
    // 360x320: track 28.8..331.2, cell 75.6, nodeR 17, tick 34, stick reach 74.8.
    // rowGap = min(34 * 3.2, (320 - 2 * 74.8) / 3) = 56.8 -> rows at 74.8, 131.6, 188.4, 245.2.
    expect(linearBeatAt(66.6, 74.8, 360, 320, 16)).toBe(0);
    expect(linearBeatAt(293.4, 74.8, 360, 320, 16)).toBe(3);
    expect(linearBeatAt(66.6, 245.2, 360, 320, 16)).toBe(12);
    expect(linearBeatAt(293.4, 245.2, 360, 320, 16)).toBe(15);
    // The old fixed gap (108.8) put row 0 at y = -3.2, off-canvas.
    expect(linearBeatAt(66.6, 0, 360, 320, 16)).toBe(-1);
  });

  it('keeps the full row gap when the canvas is tall enough', () => {
    // 8 beats, 2 rows, 800px tall: gap stays 34 * 3.2 = 108.8 -> rows at 345.6 and 454.4.
    expect(linearBeatAt(66.6, 345.6, 360, 800, 8)).toBe(0);
    expect(linearBeatAt(66.6, 454.4, 360, 800, 8)).toBe(4);
  });
});
