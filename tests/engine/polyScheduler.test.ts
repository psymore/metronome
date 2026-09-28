import { describe, expect, it } from 'vitest';
import {
  type PolyBeatEvent,
  type PolyPattern,
  PolyScheduler,
} from '../../src/engine/polyScheduler';

/** The scheduler's real default look-ahead; stall/mutation tests must use it, not an inflated one. */
const REAL_LOOKAHEAD = 0.1;
/** The timer worker's tick interval. */
const TICK = 0.025;

type Emitted = PolyBeatEvent & { emittedAt: number };

function setup(
  pattern: Partial<PolyPattern['polyrhythm']> & { bpm?: number } = {},
  lookahead = REAL_LOOKAHEAD,
) {
  const p: PolyPattern = {
    bpm: pattern.bpm ?? 120,
    polyrhythm: { enabled: true, a: pattern.a ?? 3, b: pattern.b ?? 4 },
  };
  const events: Emitted[] = [];
  let now = 0;
  const s = new PolyScheduler({
    getPattern: () => p,
    onEvent: (e) => events.push({ ...e, emittedAt: now }),
    lookahead,
    startDelay: 0.05,
  });
  const start = (t: number) => {
    now = t;
    s.start(t);
  };
  const tick = (t: number) => {
    now = t;
    s.tick(t);
  };
  /** Ticks every TICK seconds over (from, to]. */
  const run = (from: number, to: number) => {
    for (let k = 1; from + k * TICK <= to + 1e-9; k++) tick(from + k * TICK);
  };
  return { s, events, p, start, tick, run };
}

function expectNoLateEvents(events: Emitted[]): void {
  for (const e of events) expect(e.time).toBeGreaterThanOrEqual(e.emittedAt);
}

/** Within each (cycle, layer): one n, strictly increasing times and indices, no duplicates. */
function expectConsistentCycles(events: Emitted[]): void {
  const groups = new Map<string, Emitted[]>();
  for (const e of events) {
    const key = `${e.cycleIndex}|${e.layer}`;
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const n = group[0]?.n;
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1] as Emitted;
      const cur = group[i] as Emitted;
      expect(cur.n).toBe(n);
      expect(cur.index).toBeGreaterThan(prev.index);
      expect(cur.time).toBeGreaterThan(prev.time);
    }
  }
}

describe('PolyScheduler', () => {
  it('schedules a evenly-spaced A events and b evenly-spaced B events across one cycle', () => {
    // bpm 120 -> cycleDuration = 4 * 0.5 = 2s. a=3 -> A at 0, 2/3, 4/3. b=4 -> B at 0, 0.5, 1, 1.5.
    const { events, start } = setup({ a: 3, b: 4 }, 1.9);
    start(0);
    const first = events.filter((e) => e.cycleIndex === 0);
    const a = first.filter((e) => e.layer === 'A').map((e) => e.time - 0.05);
    const b = first.filter((e) => e.layer === 'B').map((e) => e.time - 0.05);
    expect(a).toHaveLength(3);
    for (const [i, t] of a.entries()) expect(t).toBeCloseTo((i / 3) * 2, 9);
    expect(b).toHaveLength(4);
    for (const [i, t] of b.entries()) expect(t).toBeCloseTo((i / 4) * 2, 9);
  });

  it('does not crash and schedules both layers when a === b (fully aligned)', () => {
    const { events, start } = setup({ a: 4, b: 4 }, 1.9);
    start(0);
    expect(events.filter((e) => e.layer === 'A')).toHaveLength(4);
    expect(events.filter((e) => e.layer === 'B')).toHaveLength(4);
  });

  it('never drifts the cycle anchor across many cycles', () => {
    const { events, start, tick } = setup({ a: 3, b: 4 });
    start(0);
    for (let i = 1; i <= 2000; i++) tick(i * 0.05);
    const cycleDuration = 2;
    const bEvents = events.filter((e) => e.layer === 'B' && e.index === 0);
    for (const [cycle, e] of bEvents.entries()) {
      expect(e.time).toBeCloseTo(0.05 + cycle * cycleDuration, 6);
    }
  });

  it('keeps the ratio and ordering correct at a fast, high-count cycle (a=16 at bpm=400)', () => {
    // cycleDuration = 4 * (60/400) = 0.6s; 16 A-events ~37.5ms apart.
    const { events, start, run } = setup({ a: 16, b: 2, bpm: 400 });
    start(0);
    run(0, 1);
    const a = events.filter((e) => e.layer === 'A' && e.cycleIndex === 0);
    expect(a).toHaveLength(16);
    for (const [i, e] of a.entries()) expect(e.index).toBe(i);
    expectNoLateEvents(events);
  });

  it('does nothing before start() and stops scheduling after stop()', () => {
    const { s, events, start, tick } = setup({}, 1);
    tick(5);
    expect(events).toHaveLength(0);
    start(0);
    s.stop();
    const countAfterStop = events.length;
    tick(10);
    expect(events).toHaveLength(countAfterStop);
    expect(s.isRunning).toBe(false);
  });

  describe('stalls (real 0.1s look-ahead)', () => {
    it('skips each layer past a stall shorter than one cycle, with no late burst', () => {
      // Cycle 0 spans 0.05..2.05: A at 0.05, 0.717, 1.383; B at 0.05, 0.55, 1.05, 1.55.
      const { events, start, run, tick } = setup({ a: 3, b: 4 });
      start(0);
      run(0, 0.3);
      const before = events.length;
      tick(1.2); // stalled from 0.3 to 1.2: A@0.717, B@0.55 and B@1.05 are now in the past
      expect(events.slice(before)).toHaveLength(0); // no catch-up burst; nothing due in [1.2, 1.3)
      run(1.2, 5);
      expectNoLateEvents(events);
      expectConsistentCycles(events);
      const after = events.slice(before);
      const firstA = after.find((e) => e.layer === 'A');
      const firstB = after.find((e) => e.layer === 'B');
      // Each layer resumes on its own grid in the same cycle.
      expect(firstA?.cycleIndex).toBe(0);
      expect(firstA?.index).toBe(2);
      expect(firstA?.time).toBeCloseTo(0.05 + (2 / 3) * 2, 9);
      expect(firstB?.cycleIndex).toBe(0);
      expect(firstB?.index).toBe(3);
      expect(firstB?.time).toBeCloseTo(1.55, 9);
      // And the next cycle starts on the unchanged anchor.
      const c1 = events.find((e) => e.cycleIndex === 1 && e.index === 0);
      expect(c1?.time).toBeCloseTo(2.05, 9);
    });

    it('skips whole cycles and each layer after a stall several cycles long', () => {
      const { events, start, run, tick } = setup({ a: 3, b: 4 });
      start(0);
      run(0, 0.3);
      const before = events.length;
      tick(7.3); // 3.5 cycles later: cycle 3 spans 6.05..8.05
      run(7.3, 12);
      expectNoLateEvents(events);
      expectConsistentCycles(events);
      const after = events.slice(before);
      const firstA = after.find((e) => e.layer === 'A');
      const firstB = after.find((e) => e.layer === 'B');
      expect(firstA?.cycleIndex).toBe(3);
      expect(firstA?.index).toBe(2);
      expect(firstA?.time).toBeCloseTo(6.05 + (2 / 3) * 2, 9);
      expect(firstB?.cycleIndex).toBe(3);
      expect(firstB?.index).toBe(3);
      expect(firstB?.time).toBeCloseTo(7.55, 9);
      // Later cycles stay on the original grid.
      for (const e of after.filter((x) => x.index === 0)) {
        expect(e.time).toBeCloseTo(0.05 + e.cycleIndex * 2, 9);
      }
    });

    it('never emits an event in the past when the tick merely runs a little late', () => {
      const { events, start, tick } = setup({ a: 5, b: 7, bpm: 180 });
      start(0);
      let t = 0;
      for (let i = 0; i < 400; i++) {
        t += i % 17 === 0 ? 0.3 : TICK; // periodic 300ms hiccups
        tick(t);
      }
      expectNoLateEvents(events);
      expectConsistentCycles(events);
    });
  });

  describe('mid-cycle changes (real 0.1s look-ahead)', () => {
    it('applies a BPM change only at the next cycle boundary', () => {
      const { events, p, start, run } = setup({ a: 3, b: 4, bpm: 120 });
      start(0);
      run(0, 0.9);
      p.bpm = 200; // faster: a fresh re-read would pull A#2 to 0.85, into the past
      run(0.9, 6);
      expectNoLateEvents(events);
      expectConsistentCycles(events);
      // Cycle 0 is untouched: the old 2s grid, every event exactly once.
      const c0A = events.filter((e) => e.cycleIndex === 0 && e.layer === 'A');
      const c0B = events.filter((e) => e.cycleIndex === 0 && e.layer === 'B');
      expect(c0A.map((e) => e.index)).toEqual([0, 1, 2]);
      expect(c0B.map((e) => e.index)).toEqual([0, 1, 2, 3]);
      for (const e of c0A) expect(e.time).toBeCloseTo(0.05 + (e.index / 3) * 2, 9);
      for (const e of c0B) expect(e.time).toBeCloseTo(0.05 + (e.index / 4) * 2, 9);
      // Cycle 1 starts on the old boundary and runs at the new tempo (1.2s cycles).
      const c1B = events.filter((e) => e.cycleIndex === 1 && e.layer === 'B');
      expect(c1B.map((e) => e.index)).toEqual([0, 1, 2, 3]);
      for (const e of c1B) expect(e.time).toBeCloseTo(2.05 + (e.index / 4) * 1.2, 9);
      const c2 = events.find((e) => e.cycleIndex === 2 && e.index === 0);
      expect(c2?.time).toBeCloseTo(3.25, 9);
    });

    it('applies a ratio change only at the next cycle boundary, not mid-cycle', () => {
      const { events, p, start, run } = setup({ a: 3, b: 4 });
      start(0);
      run(0, 0.9); // A#0, A#1 (0.717) already scheduled
      p.polyrhythm.a = 5; // a fresh re-read would put A#2 at 0.85 (past) with n=5
      p.polyrhythm.b = 2;
      run(0.9, 4.2);
      expectNoLateEvents(events);
      expectConsistentCycles(events);
      const c0A = events.filter((e) => e.cycleIndex === 0 && e.layer === 'A');
      const c0B = events.filter((e) => e.cycleIndex === 0 && e.layer === 'B');
      expect(c0A.map((e) => [e.index, e.n])).toEqual([
        [0, 3],
        [1, 3],
        [2, 3],
      ]);
      expect(c0B.map((e) => e.index)).toEqual([0, 1, 2, 3]);
      for (const e of c0A) expect(e.time).toBeCloseTo(0.05 + (e.index / 3) * 2, 9);
      const c1A = events.filter((e) => e.cycleIndex === 1 && e.layer === 'A');
      const c1B = events.filter((e) => e.cycleIndex === 1 && e.layer === 'B');
      expect(c1A).toHaveLength(5);
      expect(c1B).toHaveLength(2);
      for (const e of c1A) {
        expect(e.n).toBe(5);
        expect(e.time).toBeCloseTo(2.05 + (e.index / 5) * 2, 9);
      }
    });

    it('stays consistent when the ratio shrinks below the next pending index mid-cycle', () => {
      const { events, p, start, run } = setup({ a: 7, b: 4 });
      start(0);
      run(0, 1.5); // A#0..A#5 (up to 1.479) scheduled
      p.polyrhythm.a = 2;
      run(1.5, 4.2);
      expectNoLateEvents(events);
      expectConsistentCycles(events);
      const c0A = events.filter((e) => e.cycleIndex === 0 && e.layer === 'A');
      expect(c0A.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(events.filter((e) => e.cycleIndex === 1 && e.layer === 'A')).toHaveLength(2);
    });
  });
});
