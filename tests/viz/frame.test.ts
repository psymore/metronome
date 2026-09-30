import { describe, expect, it } from 'vitest';
import type { BeatEvent } from '../../src/engine/scheduler';
import type { BeatLevel } from '../../src/state/settings';
import { computeFrame } from '../../src/viz/frame';
import { GLOW_SECONDS } from '../../src/viz/geometry';

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
  subdivision: 1,
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

  it('fades the glow out after GLOW_SECONDS', () => {
    expect(computeFrame({ ...base, beat: beat(), heardTime: 10 + GLOW_SECONDS + 0.01 }).glow).toBe(
      0,
    );
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

  describe('subdivision dots', () => {
    it('lights no dot on the beat itself', () => {
      const f = computeFrame({ ...base, subdivision: 2, beat: beat(), heardTime: 10 });
      expect(f).toMatchObject({ subdivision: 2, activeSub: -1, subGlow: 0 });
    });

    it('lights the eighth-note dot exactly halfway through the beat', () => {
      const f = computeFrame({ ...base, subdivision: 2, beat: beat(), heardTime: 10.25 });
      expect(f).toMatchObject({ activeSub: 1, subGlow: 1 });
    });

    it('lights the second triplet dot two thirds of the way through', () => {
      const f = computeFrame({ ...base, subdivision: 3, beat: beat(), heardTime: 10 + 1 / 3 });
      expect(f.activeSub).toBe(2);
      expect(f.subGlow).toBeCloseTo(1);
    });

    it('fades a dot out before the next subdivision click', () => {
      // 16ths at duration 0.5: one click every 0.125s, so the glow must be gone by then.
      const f = computeFrame({ ...base, subdivision: 4, beat: beat(), heardTime: 10.125 + 0.12 });
      expect(f).toMatchObject({ activeSub: 1, subGlow: 0 });
    });

    it('never lights a dot without a subdivision', () => {
      const f = computeFrame({ ...base, beat: beat(), heardTime: 10.25 });
      expect(f).toMatchObject({ subdivision: 1, activeSub: -1, subGlow: 0 });
    });

    it('keeps the dots unlit while stopped', () => {
      const f = computeFrame({
        ...base,
        subdivision: 2,
        running: false,
        beat: beat(),
        heardTime: 10.25,
      });
      expect(f).toMatchObject({ subdivision: 2, activeSub: -1, subGlow: 0 });
    });
  });
});
