import { describe, expect, it } from 'vitest';
import {
  circularLayout,
  glowIntensity,
  handAngle,
  linearNodeX,
  linearStickX,
  nodeAngle,
  nodeRadius,
  polar,
} from '../../src/viz/geometry';

describe('circular geometry', () => {
  it("puts beat 1 at 12 o'clock and goes clockwise on screen (y grows downward)", () => {
    const top = polar(0, 0, 10, nodeAngle(0, 4));
    const right = polar(0, 0, 10, nodeAngle(1, 4));
    const bottom = polar(0, 0, 10, nodeAngle(2, 4));
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(bottom.y).toBeCloseTo(10);
  });

  it('lands the hand exactly on a node at its beat', () => {
    expect(handAngle(1, 0, 4)).toBeCloseTo(nodeAngle(1, 4));
    const end = polar(0, 0, 1, handAngle(3, 1, 4));
    const first = polar(0, 0, 1, nodeAngle(0, 4));
    expect(end.x).toBeCloseTo(first.x);
    expect(end.y).toBeCloseTo(first.y);
  });

  it('sweeps between nodes with the phase', () => {
    const mid = polar(0, 0, 1, handAngle(3, 0.5, 4)); // between beat 4 (left) and beat 1 (top)
    expect(mid.x).toBeLessThan(0);
    expect(mid.y).toBeLessThan(0);
  });

  it('handles a one-beat bar as a full turn per beat', () => {
    const half = polar(0, 0, 1, handAngle(0, 0.5, 1));
    expect(half.y).toBeCloseTo(1);
  });

  it('lays out the circle inside the canvas with room for labels', () => {
    const l = circularLayout(400, 300);
    expect(l.cx).toBe(200);
    expect(l.cy).toBe(150);
    expect(l.r).toBeCloseTo(117);
    expect(l.hub).toBeCloseTo(117 * 0.24);
    expect(circularLayout(10, 10).r).toBe(10);
  });
});

describe('linear geometry', () => {
  it('spaces nodes across the bar and ends at the bar line', () => {
    expect(linearNodeX(0, 4, 10, 400)).toBe(10);
    expect(linearNodeX(4, 4, 10, 400)).toBe(410);
  });

  it('puts the stick on the node at its beat and between nodes mid-beat', () => {
    expect(linearStickX(2, 0, 4, 10, 400)).toBe(linearNodeX(2, 4, 10, 400));
    expect(linearStickX(1, 0.5, 4, 10, 400)).toBe(160);
  });
});

describe('glowIntensity and nodeRadius', () => {
  it('peaks at the beat and fades quadratically to zero', () => {
    expect(glowIntensity(0)).toBe(1);
    expect(glowIntensity(0.175, 0.35)).toBeCloseTo(0.25);
    expect(glowIntensity(0.35)).toBe(0);
    expect(glowIntensity(-0.01)).toBe(0);
  });

  it('shrinks nodes for busy bars and clamps to 5–16 px', () => {
    expect(nodeRadius(4, 200)).toBeCloseTo(14);
    expect(nodeRadius(16, 200)).toBeCloseTo(9);
    expect(nodeRadius(4, 10)).toBe(5);
    expect(nodeRadius(4, 1000)).toBe(16);
  });
});
