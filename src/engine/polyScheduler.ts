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
  polyrhythm: { enabled: boolean; a: number; b: number };
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
 */
export class PolyScheduler {
  private readonly lookahead: number;
  private readonly startDelay: number;
  private cycleStart = 0;
  private cycleIndex = 0;
  private nextIndexA = 0;
  private nextIndexB = 0;
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
    this.nextIndexA = 0;
    this.nextIndexB = 0;
    this.tick(now);
  }

  stop(): void {
    this.running = false;
  }

  private cycleDuration(bpm: number): number {
    return 4 * secondsPerBeat(bpm);
  }

  tick(now: number): void {
    if (!this.running) return;
    let { bpm, polyrhythm } = this.opts.getPattern();
    let duration = this.cycleDuration(bpm);
    const a = Math.max(2, polyrhythm.a);
    const b = Math.max(2, polyrhythm.b);

    // Genuine stall (the cycle has fallen more than a full look-ahead window behind): jump the
    // cycle anchor forward on the same grid instead of firing a burst of late events.
    if (this.cycleStart + duration < now - this.lookahead) {
      const missedCycles = Math.ceil((now - (this.cycleStart + duration)) / duration);
      this.cycleStart += missedCycles * duration;
      this.cycleIndex += missedCycles;
      this.nextIndexA = 0;
      this.nextIndexB = 0;
    }

    while (this.nextIndexA < a || this.nextIndexB < b) {
      ({ bpm, polyrhythm } = this.opts.getPattern());
      duration = this.cycleDuration(bpm);
      const timeA =
        this.nextIndexA < a ? this.cycleStart + (this.nextIndexA / a) * duration : Infinity;
      const timeB =
        this.nextIndexB < b ? this.cycleStart + (this.nextIndexB / b) * duration : Infinity;
      const nextTime = Math.min(timeA, timeB);
      if (nextTime >= now + this.lookahead) break;
      if (timeA <= timeB) {
        this.opts.onEvent({
          time: timeA,
          duration: duration / a,
          layer: 'A',
          index: this.nextIndexA,
          n: a,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexA++;
      } else {
        this.opts.onEvent({
          time: timeB,
          duration: duration / b,
          layer: 'B',
          index: this.nextIndexB,
          n: b,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexB++;
      }
    }

    if (this.nextIndexA >= a && this.nextIndexB >= b) {
      this.cycleStart += duration;
      this.cycleIndex++;
      this.nextIndexA = 0;
      this.nextIndexB = 0;
      // Only dive into the next cycle within this same call if it has genuinely already begun
      // (cycleStart <= now). A wide `lookahead` must not, by itself, pull a future cycle's events
      // in early — that would let lookahead silently expose ratio changes ahead of the boundary
      // and violate "one cycle worth of events per due call". A later tick() picks the rest up
      // once that cycle is actually due.
      if (this.cycleStart <= now) this.tick(now);
    }
  }
}
