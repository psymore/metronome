import { describe, expect, it } from 'vitest';
import { polygonVertices, polyStageLayout } from '../../src/viz/polyGeometry';

describe('polygonVertices', () => {
  it('places n vertices evenly spaced around a circle, starting at 12 o\'clock', () => {
    const v = polygonVertices(4, 0, 0, 10);
    expect(v).toHaveLength(4);
    expect(v[0]?.x).toBeCloseTo(0);
    expect(v[0]?.y).toBeCloseTo(-10);
    expect(v[1]?.x).toBeCloseTo(10);
    expect(v[1]?.y).toBeCloseTo(0);
  });

  it('produces a 3-vertex triangle for n=3', () => {
    const v = polygonVertices(3, 0, 0, 10);
    expect(v).toHaveLength(3);
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y);
    const d01 = dist(v[0]!, v[1]!);
    const d12 = dist(v[1]!, v[2]!);
    const d20 = dist(v[2]!, v[0]!);
    expect(d01).toBeCloseTo(d12, 5);
    expect(d12).toBeCloseTo(d20, 5);
  });

  it('supports the full 2..16 range without error', () => {
    for (let n = 2; n <= 16; n++) {
      expect(polygonVertices(n, 0, 0, 10)).toHaveLength(n);
    }
  });
});

describe('polyStageLayout', () => {
  it('centers in the smaller dimension and leaves padding', () => {
    const l = polyStageLayout(400, 300);
    expect(l.cx).toBe(200);
    expect(l.cy).toBe(150);
    expect(l.radius).toBeLessThan(150);
    expect(l.radius).toBeGreaterThan(0);
  });
});
