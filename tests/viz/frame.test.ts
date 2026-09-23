import { describe, expect, it } from 'vitest';
import type { BeatEvent } from '../../src/engine/scheduler';
import type { BeatLevel } from '../../src/state/settings';
import { computeFrame } from '../../src/viz/frame';

const beat = (overrides: Partial<BeatEvent> = {}): BeatEvent => ({
  time: 10,
  duration: 0.5,
  beatInBar: 2,
  beatsPerBar: 4,
  barIndex: 0,
  level: 'normal',
  ...overrides,
});

const base = {
  running: true,
  beatsPerBar: 4,
  levels: ['accent', 'normal', 'normal', 'normal'] as BeatLevel[],
  reducedMotion: false,
};

describe('computeFrame', () => {
  it('is idle when stopped', () => {
    const f = computeFrame({ ...base, running: false, beat: beat(), heardTime: 10.1 });
    expect(f).toMatchObject({ running: false, activeBeat: -1, phase: 0, glow: 0 });
  });

  it('is idle while running before the first beat is heard', () => {
    const f = computeFrame({ ...base, beat: null, heardTime: 3 });
    expect(f).toMatchObject({ running: true, activeBeat: -1, glow: 0 });
  });

  it('peaks the glow exactly when the beat is heard', () => {
    const f = computeFrame({ ...base, beat: beat(), heardTime: 10 });
    expect(f).toMatchObject({ activeBeat: 2, phase: 0, glow: 1 });
  });

  it('reports the phase between beats', () => {
    expect(computeFrame({ ...base, beat: beat(), heardTime: 10.25 }).phase).toBe(0.5);
  });

  it('fades the glow out after 0.35 s', () => {
    expect(computeFrame({ ...base, beat: beat(), heardTime: 10.36 }).glow).toBe(0);
  });

  it('shortens the glow at fast tempos so flashes never blur together', () => {
    const f = computeFrame({ ...base, beat: beat({ duration: 0.15 }), heardTime: 10.14 });
    expect(f.glow).toBe(0);
  });

  it('dims muted beats to a quarter', () => {
    expect(computeFrame({ ...base, beat: beat({ level: 'mute' }), heardTime: 10 }).glow).toBe(0.25);
  });

  it("uses the heard beat's own bar length", () => {
    expect(
      computeFrame({ ...base, beat: beat({ beatsPerBar: 3 }), heardTime: 10 }).beatsPerBar,
    ).toBe(3);
  });
});
