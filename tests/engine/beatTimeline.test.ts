import { describe, expect, it } from 'vitest';
import { BeatTimeline, beatPhase } from '../../src/engine/beatTimeline';
import type { BeatEvent } from '../../src/engine/scheduler';

const beat = (time: number, duration = 0.5): BeatEvent => ({
  time,
  duration,
  beatInBar: 0,
  beatsPerBar: 4,
  barIndex: 0,
  level: 'normal',
});

describe('BeatTimeline', () => {
  it('returns the most recent beat at or before the given time', () => {
    const t = new BeatTimeline();
    for (const time of [1, 1.5, 2]) t.push(beat(time));
    expect(t.beatAt(1.7)?.time).toBe(1.5);
    expect(t.beatAt(2)?.time).toBe(2);
    expect(t.beatAt(0.9)).toBeNull();
  });

  it('ignores beats scheduled in the future', () => {
    const t = new BeatTimeline();
    t.push(beat(1));
    t.push(beat(1.5));
    expect(t.beatAt(1.2)?.time).toBe(1);
  });

  it('keeps only the newest `capacity` beats', () => {
    const t = new BeatTimeline(3);
    for (const time of [0, 1, 2, 3, 4]) t.push(beat(time));
    expect(t.size).toBe(3);
    expect(t.beatAt(1.5)).toBeNull();
    expect(t.beatAt(2.5)?.time).toBe(2);
  });

  it('clears', () => {
    const t = new BeatTimeline();
    t.push(beat(1));
    t.clear();
    expect(t.beatAt(5)).toBeNull();
  });
});

describe('beatPhase', () => {
  it('goes from 0 at the beat to 1 at the next one, clamped', () => {
    expect(beatPhase(beat(10), 10)).toBe(0);
    expect(beatPhase(beat(10), 10.25)).toBe(0.5);
    expect(beatPhase(beat(10), 11)).toBe(1);
    expect(beatPhase(beat(10), 9)).toBe(0);
  });

  it('returns 0 for a zero-length beat', () => {
    expect(beatPhase(beat(10, 0), 10.5)).toBe(0);
  });
});
