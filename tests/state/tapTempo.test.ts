import { describe, expect, it } from 'vitest';
import { TapTempo } from '../../src/state/tapTempo';

describe('TapTempo', () => {
  it('needs two taps, then averages the intervals', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBe(120);
    expect(t.tap(1000)).toBe(120);
    expect(t.tap(1520)).toBe(118);
  });

  it('starts over after a pause longer than 3.1 s', () => {
    const t = new TapTempo();
    t.tap(0);
    t.tap(500);
    expect(t.tap(5000)).toBeNull();
    expect(t.tap(5600)).toBe(100);
  });

  it('only averages the last six taps', () => {
    const t = new TapTempo();
    for (const ms of [0, 1000, 2000, 2500, 3000, 3500, 4000, 4500]) t.tap(ms);
    expect(t.tap(5000)).toBe(120);
  });

  it('clamps to the supported tempo range', () => {
    const t = new TapTempo();
    t.tap(0);
    expect(t.tap(50)).toBe(400);
  });
});
