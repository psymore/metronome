import { describe, expect, it } from 'vitest';
import { type BeatEvent, type Pattern, Scheduler } from '../../src/engine/scheduler';

function setup(pattern: Partial<Pattern> = {}, lookahead = 1) {
  const p: Pattern = {
    bpm: 120,
    beatsPerBar: 4,
    levels: ['accent', 'normal', 'normal', 'normal'],
    ...pattern,
  };
  const beats: BeatEvent[] = [];
  const s = new Scheduler({
    getPattern: () => p,
    onBeat: (b) => beats.push(b),
    lookahead,
    startDelay: 0.05,
  });
  return { s, beats, p };
}

describe('Scheduler', () => {
  it('schedules the first beat startDelay after start, as the accented downbeat', () => {
    const { s, beats } = setup();
    s.start(0);
    expect(beats[0]).toEqual({
      time: 0.05,
      duration: 0.5,
      beatInBar: 0,
      beatsPerBar: 4,
      barIndex: 0,
      level: 'accent',
    });
    expect(s.isRunning).toBe(true);
  });

  it('only schedules beats inside the look-ahead window', () => {
    const { s, beats } = setup();
    s.start(0); // window [0, 1): 0.05 and 0.55
    expect(beats).toHaveLength(2);
    expect(beats[1]?.time).toBeCloseTo(0.55, 9);
    s.tick(0.04); // window ends at 1.04; next beat is 1.05
    expect(beats).toHaveLength(2);
    s.tick(0.1);
    expect(beats).toHaveLength(3);
    expect(beats[2]?.time).toBeCloseTo(1.05, 9);
  });

  it('never drifts: beat k is exactly startDelay + k × period after 10 minutes', () => {
    const { s, beats } = setup({}, 0.1);
    s.start(0);
    for (let i = 1; i <= 24000; i++) s.tick(i * 0.025);
    expect(beats.length).toBe(1201);
    beats.forEach((b, k) => {
      expect(b.time).toBeCloseTo(0.05 + k * 0.5, 9);
      expect(b.beatInBar).toBe(k % 4);
    });
  });

  it('wraps bars and applies per-beat levels', () => {
    const { s, beats } = setup({ beatsPerBar: 3, levels: ['accent', 'mute', 'normal'] });
    s.start(0);
    s.tick(1.5);
    expect(beats.slice(0, 4).map((b) => [b.beatInBar, b.barIndex, b.level])).toEqual([
      [0, 0, 'accent'],
      [1, 0, 'mute'],
      [2, 0, 'normal'],
      [0, 1, 'accent'],
    ]);
  });

  it('defaults missing levels to an accented downbeat and normal beats', () => {
    const { s, beats } = setup({ levels: [] });
    s.start(0);
    expect(beats.map((b) => b.level)).toEqual(['accent', 'normal']);
  });

  it('applies a tempo change from the next unscheduled beat', () => {
    const { s, beats, p } = setup();
    s.start(0); // 0.05, 0.55 scheduled at 120 BPM
    p.bpm = 60;
    s.tick(0.6); // window ends 1.6: the beat at 1.05 now has duration 1
    expect(beats[2]?.time).toBeCloseTo(1.05, 9);
    expect(beats[2]?.duration).toBe(1);
    s.tick(1.5);
    expect(beats[3]?.time).toBeCloseTo(2.05, 9);
  });

  it('shrinking the signature mid-bar restarts at a downbeat', () => {
    const { s, beats, p } = setup({ beatsPerBar: 7, levels: Array(7).fill('normal') });
    s.start(0);
    s.tick(2); // up to 2.55 → beatInBar 0..5
    expect(beats.at(-1)?.beatInBar).toBe(5);
    p.beatsPerBar = 3;
    p.levels = ['accent', 'normal', 'normal'];
    s.tick(2.1); // schedules 3.05
    expect(beats.at(-1)).toMatchObject({
      beatInBar: 0,
      barIndex: 1,
      beatsPerBar: 3,
      level: 'accent',
    });
    for (const b of beats) expect(b.beatInBar).toBeLessThan(b.beatsPerBar);
  });

  it('skips missed beats after a stall instead of bursting', () => {
    const { s, beats } = setup({}, 0.1);
    s.start(0); // only 0.05 fits in [0, 0.1)
    expect(beats).toHaveLength(1);
    s.tick(10); // tab was frozen for ~10 s
    expect(beats).toHaveLength(2);
    expect(beats[1]?.time).toBeCloseTo(10.05, 9);
    expect(beats[1]).toMatchObject({ beatInBar: 0, barIndex: 5 }); // beat #20 of the grid
    expect(s.stats.skipped).toBe(19);
  });

  it('stops scheduling after stop()', () => {
    const { s, beats } = setup();
    s.start(0);
    s.stop();
    s.tick(5);
    expect(beats).toHaveLength(2);
    expect(s.isRunning).toBe(false);
  });

  it('tracks the minimum lead time between scheduling and playback', () => {
    const { s } = setup({}, 0.1);
    s.start(0);
    expect(s.stats.minLead).toBeCloseTo(0.05, 9);
    s.tick(1.04); // beat at 0.55 is skipped as late; 1.05 has 10 ms lead
    expect(s.stats.minLead).toBeCloseTo(0.01, 9);
    expect(s.stats.scheduled).toBe(2);
  });

  it('resets stats and position on restart', () => {
    const { s, beats } = setup();
    s.start(0); // beats[0], beats[1]
    s.stop();
    s.start(100); // beats[2] is the new first beat
    expect(beats[2]).toMatchObject({ beatInBar: 0, barIndex: 0, level: 'accent' });
    expect(beats[2]?.time).toBeCloseTo(100.05, 9);
    expect(s.stats.skipped).toBe(0);
  });
});
