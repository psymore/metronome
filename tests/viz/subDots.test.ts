import { describe, expect, it } from 'vitest';
import {
  SUB_FAN_DOT_R,
  SUB_FAN_PITCH,
  SUB_TAP_MIN_SPACING,
  subDotAt,
  subDotLayout,
  subFanDotAt,
  subFanLayout,
} from '../../src/viz/subDots';

describe('subDotLayout', () => {
  it('has no dots without a subdivision', () => {
    expect(subDotLayout('circular', 390, 320, 4, 1).dots).toEqual([]);
  });

  it('places sub−1 dots per beat, beat-major', () => {
    const l = subDotLayout('circular', 390, 320, 4, 3);
    expect(l.dots).toHaveLength(8);
    expect(l.dots.map((d) => [d.beat, d.k]).slice(0, 3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
    ]);
    expect(l.groups).toHaveLength(4);
  });

  it('is directly tappable for 8ths on a 4-beat circle', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    expect(l.spacing).toBeGreaterThanOrEqual(SUB_TAP_MIN_SPACING);
    expect(l.direct).toBe(true);
  });

  it('needs the fan for 16ths on the 4-beat line view', () => {
    const l = subDotLayout('linear', 390, 320, 4, 4);
    expect(l.direct).toBe(false);
  });

  it('points circle groups outward and line groups up', () => {
    const c = subDotLayout('circular', 390, 320, 4, 2).groups[0];
    // beat 0's gap is between 12 o'clock and 3 o'clock: outward means up-right, away from center
    expect(c && c.nx > 0 && c.ny < 0).toBe(true);
    const lg = subDotLayout('linear', 390, 320, 4, 2).groups[0];
    expect(lg).toMatchObject({ nx: 0, ny: -1, tx: 1, ty: 0 });
  });
});

describe('subFanLayout', () => {
  const group = { beat: 0, x: 200, y: 100, nx: 0, ny: -1, tx: 1, ty: 0 };

  it('lays the clicks out SUB_FAN_PITCH apart, centered on the offset point', () => {
    const fan = subFanLayout(group, 3, 390, 320);
    expect(fan.map((p) => p.x)).toEqual([200 - SUB_FAN_PITCH, 200, 200 + SUB_FAN_PITCH]);
    expect(fan[0]?.y).toBe(100 - 46);
  });

  it('shifts the whole row back inside the canvas', () => {
    const fan = subFanLayout({ ...group, x: 10 }, 3, 390, 320);
    expect(Math.min(...fan.map((p) => p.x))).toBeGreaterThanOrEqual(SUB_FAN_DOT_R + 4);
    expect(fan[1]?.x).toBeCloseTo((fan[0]?.x ?? 0) + SUB_FAN_PITCH); // spacing kept
  });
});

describe('subDotAt / subFanDotAt', () => {
  it('hits a single dot when direct', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    const d = l.dots[1];
    expect(d).toBeDefined();
    expect(subDotAt(l, (d?.x ?? 0) + 2, d?.y ?? 0)).toEqual({
      kind: 'dot',
      beat: d?.beat,
      k: d?.k,
    });
  });

  it('hits the whole group when not direct', () => {
    const l = subDotLayout('linear', 390, 320, 4, 4);
    const d = l.dots[4]; // beat 1, k 2
    expect(d).toBeDefined();
    expect(subDotAt(l, d?.x ?? 0, d?.y ?? 0)).toEqual({ kind: 'group', beat: 1 });
  });

  it('misses far from any dot', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    expect(subDotAt(l, 0, 0)).toBeNull();
  });

  it('finds a fan dot by index', () => {
    const fan = [
      { x: 100, y: 50 },
      { x: 144, y: 50 },
    ];
    expect(subFanDotAt(fan, 146, 52)).toBe(1);
    expect(subFanDotAt(fan, 300, 300)).toBe(-1);
  });
});
