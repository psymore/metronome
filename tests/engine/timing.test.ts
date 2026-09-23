import { describe, expect, it } from 'vitest';
import { clampBpm, MAX_BPM, MIN_BPM, secondsPerBeat } from '../../src/engine/timing';

describe('clampBpm', () => {
  it('rounds and keeps values inside 20–400', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(5)).toBe(MIN_BPM);
    expect(clampBpm(999)).toBe(MAX_BPM);
  });

  it('falls back to 120 for non-finite input', () => {
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(Number.POSITIVE_INFINITY)).toBe(120);
  });
});

describe('secondsPerBeat', () => {
  it('converts beats per minute to seconds', () => {
    expect(secondsPerBeat(120)).toBe(0.5);
    expect(secondsPerBeat(60)).toBe(1);
  });
});
