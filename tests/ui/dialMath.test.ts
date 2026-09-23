import { describe, expect, it } from 'vitest';
import { angleDelta, bpmAfterRotation, DEGREES_PER_BPM } from '../../src/ui/dialMath';

const deg = (d: number) => (d * Math.PI) / 180;

describe('angleDelta', () => {
  it('returns the short signed difference, wrapping across ±π', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });
});

describe('bpmAfterRotation', () => {
  it('adds one BPM per 4° clockwise and subtracts counter-clockwise', () => {
    expect(DEGREES_PER_BPM).toBe(4);
    expect(bpmAfterRotation(120, deg(4))).toBe(121);
    expect(bpmAfterRotation(120, -2 * Math.PI)).toBe(30);
  });

  it('clamps at the limits', () => {
    expect(bpmAfterRotation(390, 2 * Math.PI)).toBe(400);
    expect(bpmAfterRotation(25, -Math.PI)).toBe(20);
  });
});
