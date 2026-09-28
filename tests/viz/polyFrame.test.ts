import { describe, expect, it } from 'vitest';
import { computePolyFrame } from '../../src/viz/polyFrame';
import type { PolyBeatEvent } from '../../src/engine/polyScheduler';

const event = (layer: 'A' | 'B', index: number, time: number, duration = 0.5): PolyBeatEvent => ({
  time,
  duration,
  layer,
  index,
  n: layer === 'A' ? 3 : 4,
  cycleIndex: 0,
});

describe('computePolyFrame', () => {
  it('reports idle (-1, no glow) when not running', () => {
    const f = computePolyFrame({
      running: false,
      beatA: event('A', 1, 1),
      beatB: event('B', 2, 1),
      heardTime: 1,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(-1);
    expect(f.activeIndexB).toBe(-1);
    expect(f.glowA).toBe(0);
    expect(f.glowB).toBe(0);
  });

  it('reports each layer\'s most recent event index and full glow right at its onset', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 1, 2),
      beatB: event('B', 3, 2),
      heardTime: 2,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(1);
    expect(f.activeIndexB).toBe(3);
    expect(f.glowA).toBeCloseTo(1);
    expect(f.glowB).toBeCloseTo(1);
  });

  it('decays glow to 0 well after the event', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 0, 0),
      beatB: null,
      heardTime: 1,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.glowA).toBe(0);
  });

  it('handles a === b (fully aligned layers) without special-casing', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 2, 1),
      beatB: event('B', 2, 1),
      heardTime: 1,
      a: 4,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(2);
    expect(f.activeIndexB).toBe(2);
  });
});
