import { describe, expect, it } from 'vitest';
import {
  type PolyBeatEvent,
  type PolyPattern,
  PolyScheduler,
} from '../../src/engine/polyScheduler';

function setup(pattern: Partial<PolyPattern['polyrhythm']> & { bpm?: number } = {}, lookahead = 1) {
  const p: PolyPattern = {
    bpm: pattern.bpm ?? 120,
    polyrhythm: { enabled: true, a: pattern.a ?? 3, b: pattern.b ?? 4 },
  };
  const events: PolyBeatEvent[] = [];
  const s = new PolyScheduler({
    getPattern: () => p,
    onEvent: (e) => events.push(e),
    lookahead,
    startDelay: 0.05,
  });
  return { s, events, p };
}

describe('PolyScheduler', () => {
  it('schedules a evenly-spaced A events and b evenly-spaced B events across one cycle', () => {
    // bpm 120 -> cycleDuration = 4 * 0.5 = 2s. a=3 -> A at 0, 2/3, 4/3. b=4 -> B at 0, 0.5, 1, 1.5.
    const { s, events } = setup({ a: 3, b: 4 }, 2.5);
    s.start(0);
    const a = events.filter((e) => e.layer === 'A').map((e) => e.time - 0.05);
    const b = events.filter((e) => e.layer === 'B').map((e) => e.time - 0.05);
    expect(a).toHaveLength(3);
    a.forEach((t, i) => expect(t).toBeCloseTo((i / 3) * 2, 9));
    expect(b).toHaveLength(4);
    b.forEach((t, i) => expect(t).toBeCloseTo((i / 4) * 2, 9));
  });

  it('does not crash and schedules both layers when a === b (fully aligned)', () => {
    const { s, events } = setup({ a: 4, b: 4 }, 2.5);
    s.start(0);
    expect(events.filter((e) => e.layer === 'A')).toHaveLength(4);
    expect(events.filter((e) => e.layer === 'B')).toHaveLength(4);
  });

  it('never drifts the cycle anchor across many cycles', () => {
    const { s, events } = setup({ a: 3, b: 4 }, 0.1);
    s.start(0);
    for (let i = 1; i <= 2000; i++) s.tick(i * 0.05);
    const cycleDuration = 2;
    const bEvents = events.filter((e) => e.layer === 'B' && e.index === 0);
    bEvents.forEach((e, cycle) => {
      expect(e.time).toBeCloseTo(0.05 + cycle * cycleDuration, 6);
    });
  });

  it('keeps the ratio and ordering correct at a fast, high-count cycle (a=16 at bpm=400)', () => {
    // cycleDuration = 4 * (60/400) = 0.6s; 16 A-events ~37.5ms apart.
    const { s, events } = setup({ a: 16, b: 2, bpm: 400 }, 0.7);
    s.start(0);
    const a = events.filter((e) => e.layer === 'A');
    expect(a).toHaveLength(16);
    a.forEach((e, i) => expect(e.index).toBe(i));
  });

  it('applies a ratio change only at the next cycle boundary, not mid-cycle', () => {
    const { s, events, p } = setup({ a: 3, b: 4 }, 2.5);
    s.start(0); // schedules the first full cycle (a=3, b=4)
    const firstCycleCount = events.length;
    p.polyrhythm.a = 5; // mutate the pattern the scheduler reads fresh each tick
    s.tick(2.05); // window now covers the second cycle
    const secondCycleA = events.filter((e) => e.cycleIndex === 1 && e.layer === 'A');
    expect(secondCycleA).toHaveLength(5);
    expect(events).toHaveLength(firstCycleCount + 5 + 4); // second cycle: 5 A + 4 B
  });

  it('does nothing before start() and stops scheduling after stop()', () => {
    const { s, events } = setup({}, 1);
    s.tick(5);
    expect(events).toHaveLength(0);
    s.start(0);
    s.stop();
    const countAfterStop = events.length;
    s.tick(10);
    expect(events).toHaveLength(countAfterStop);
    expect(s.isRunning).toBe(false);
  });
});
