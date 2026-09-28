import { secondsPerBeat } from './timing';

export interface PolyBeatEvent {
  /** AudioContext time at which this layer's click starts. */
  time: number;
  /** Seconds until this layer's next event, at the tempo in force when this event was scheduled. */
  duration: number;
  layer: 'A' | 'B';
  /** 0-based position within this layer's cycle (0..n-1). */
  index: number;
  /** This layer's event count for the cycle this event belongs to (the ratio's a or b). */
  n: number;
  /** 0-based count of cycles since start. */
  cycleIndex: number;
}

export interface PolyPattern {
  bpm: number;
  polyrhythm: {
    enabled: boolean;
    a: number;
    b: number;
    /** Optional per-node levels; the scheduler ignores them, but audioEngine reads them. */
    levelsA?: readonly ('accent' | 'normal' | 'mute')[];
    levelsB?: readonly ('accent' | 'normal' | 'mute')[];
  };
}

export interface PolySchedulerOptions {
  getPattern: () => PolyPattern;
  onEvent: (beat: PolyBeatEvent) => void;
  /** How far ahead of `now` to schedule, in seconds. */
  lookahead?: number;
  /** Gap between start() and the first event, in seconds. */
  startDelay?: number;
}

/**
 * Schedules two independent, evenly-spaced event streams (layer A with `a` events, layer B with
 * `b` events) sharing one cycle of duration `4 * secondsPerBeat(bpm)`. Pure: never reads a clock
 * itself, callers pass `now` (AudioContext.currentTime). The cycle anchor is accumulated
 * (`cycleStart += cycleDuration`), never re-measured, so the two layers never drift apart.
 *
 * `a`, `b` and the cycle duration are snapshotted when a cycle begins and stay fixed until it
 * ends, so a tempo or ratio change mid-cycle never re-indexes events that are already counted:
 * it takes effect at the next cycle boundary. Every emitted event satisfies `time >= now`; after
 * a stall each layer skips forward on its own grid rather than playing a burst of late clicks.
 */
export class PolyScheduler {
  private readonly lookahead: number;
  private readonly startDelay: number;
  private cycleStart = 0;
  private cycleIndex = 0;
  private nextIndexA = 0;
  private nextIndexB = 0;
  /** Snapshot of the pattern for the current cycle. */
  private cycleA = 2;
  private cycleB = 2;
  private cycleDur = 2;
  private running = false;

  constructor(private readonly opts: PolySchedulerOptions) {
    this.lookahead = opts.lookahead ?? 0.1;
    this.startDelay = opts.startDelay ?? 0.05;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(now: number): void {
    this.running = true;
    this.cycleStart = now + this.startDelay;
    this.cycleIndex = 0;
    this.beginCycle();
    this.tick(now);
  }

  stop(): void {
    this.running = false;
  }

  /** Reads the pattern once for the cycle starting at `cycleStart`; the only place it is read. */
  private beginCycle(): void {
    const { bpm, polyrhythm } = this.opts.getPattern();
    this.cycleA = Math.max(2, polyrhythm.a);
    this.cycleB = Math.max(2, polyrhythm.b);
    this.cycleDur = 4 * secondsPerBeat(bpm);
    this.nextIndexA = 0;
    this.nextIndexB = 0;
  }

  private timeOf(index: number, n: number): number {
    return this.cycleStart + (index / n) * this.cycleDur;
  }

  /** After a stall, jump forward on each layer's own grid so no emitted event lies in the past. */
  private skipMissed(now: number): void {
    // Whole cycles that have fully elapsed: jump the anchor on the cycle grid.
    while (this.cycleStart + this.cycleDur <= now) {
      const missed = Math.max(1, Math.floor((now - this.cycleStart) / this.cycleDur));
      this.cycleStart += missed * this.cycleDur;
      this.cycleIndex += missed;
      this.beginCycle();
    }
    // Within the current cycle, drop each layer's events that are already in the past.
    while (this.nextIndexA < this.cycleA && this.timeOf(this.nextIndexA, this.cycleA) < now) {
      this.nextIndexA++;
    }
    while (this.nextIndexB < this.cycleB && this.timeOf(this.nextIndexB, this.cycleB) < now) {
      this.nextIndexB++;
    }
  }

  tick(now: number): void {
    if (!this.running) return;
    this.skipMissed(now);
    const horizon = now + this.lookahead;
    for (;;) {
      const a = this.cycleA;
      const b = this.cycleB;
      const timeA = this.nextIndexA < a ? this.timeOf(this.nextIndexA, a) : Infinity;
      const timeB = this.nextIndexB < b ? this.timeOf(this.nextIndexB, b) : Infinity;
      const nextTime = Math.min(timeA, timeB);

      if (nextTime === Infinity) {
        // This cycle is fully scheduled. Roll over (reading the pattern afresh) only once the
        // next cycle's first event is inside the look-ahead window, so a ratio or tempo change
        // is picked up as late as possible, and never mid-cycle.
        const nextStart = this.cycleStart + this.cycleDur;
        if (nextStart >= horizon) return;
        this.cycleStart = nextStart;
        this.cycleIndex++;
        this.beginCycle();
        continue;
      }

      if (nextTime >= horizon) return;
      if (timeA <= timeB) {
        this.opts.onEvent({
          time: timeA,
          duration: this.cycleDur / a,
          layer: 'A',
          index: this.nextIndexA,
          n: a,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexA++;
      } else {
        this.opts.onEvent({
          time: timeB,
          duration: this.cycleDur / b,
          layer: 'B',
          index: this.nextIndexB,
          n: b,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexB++;
      }
    }
  }
}
