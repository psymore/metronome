import { describe, expect, it } from 'vitest';
import {
  makeSoftClipCurve,
  SOFT_CLIP_CEILING,
  SOFT_CLIP_CURVE_SIZE,
  SOFT_CLIP_DOMAIN,
  SOFT_CLIP_KNEE,
  softClipSample,
} from '../../src/engine/softClip';

describe('softClipSample', () => {
  it('is exactly the identity below the knee, both signs', () => {
    for (const x of [-SOFT_CLIP_KNEE, -0.5, -0.001, 0, 0.001, 0.5, SOFT_CLIP_KNEE]) {
      expect(softClipSample(x)).toBe(x);
    }
  });

  it('is continuous at the knee', () => {
    expect(softClipSample(SOFT_CLIP_KNEE + 1e-9)).toBeCloseTo(SOFT_CLIP_KNEE, 6);
  });

  it('has matching slope at the knee', () => {
    const h = 1e-6;
    const slope =
      (softClipSample(SOFT_CLIP_KNEE + h) - softClipSample(SOFT_CLIP_KNEE - h)) / (2 * h);
    expect(slope).toBeCloseTo(1, 4);
  });

  it('is monotonic non-decreasing over [-3, 3]', () => {
    let prev = -Infinity;
    for (let x = -SOFT_CLIP_DOMAIN; x <= SOFT_CLIP_DOMAIN; x += 0.001) {
      const y = softClipSample(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('never exceeds the ceiling for inputs up to ±3', () => {
    for (let x = -SOFT_CLIP_DOMAIN; x <= SOFT_CLIP_DOMAIN; x += 0.001) {
      expect(Math.abs(softClipSample(x))).toBeLessThanOrEqual(SOFT_CLIP_CEILING);
    }
  });

  it('is odd: f(-x) = -f(x)', () => {
    for (let x = 0; x <= SOFT_CLIP_DOMAIN; x += 0.01) {
      expect(softClipSample(-x)).toBe(-softClipSample(x));
    }
  });
});

describe('makeSoftClipCurve', () => {
  const curve = makeSoftClipCurve();
  const n = curve.length;

  it('has the requested size and an exact sample at zero', () => {
    expect(n).toBe(SOFT_CLIP_CURVE_SIZE);
    expect(curve[(n - 1) / 2]).toBe(0);
  });

  it('is an identity in shaper units below the knee (input u maps to u * domain)', () => {
    // The pre-gain is 1/domain, so shaper input u corresponds to signal u * domain. Below the
    // knee the output equals that signal.
    for (let i = 0; i < n; i++) {
      const u = (2 * i) / (n - 1) - 1;
      const x = u * SOFT_CLIP_DOMAIN;
      if (Math.abs(x) <= SOFT_CLIP_KNEE) {
        expect(curve[i]).toBeCloseTo(x, 6);
      }
    }
  });

  it('is monotonic and bounded by the ceiling', () => {
    for (let i = 1; i < n; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
    for (const y of curve) {
      expect(Math.abs(y)).toBeLessThanOrEqual(SOFT_CLIP_CEILING);
    }
  });

  it('is odd-symmetric across the table', () => {
    for (let i = 0; i < n; i++) {
      expect(curve[n - 1 - i]).toBeCloseTo(-curve[i], 6);
    }
  });
});
