import type { BeatLevel } from '../state/settings';
import { secondsPerBeat } from './timing';

export interface BeatEvent {
  /** AudioContext time at which the click starts. */
  time: number;
  /** Seconds until the following beat, at the tempo in force when this beat was scheduled. */
  duration: number;
  /** 0-based position in the bar. */
  beatInBar: number;
  beatsPerBar: number;
  /** 0-based count of bars since start. */
  barIndex: number;
  level: BeatLevel;
}

export interface Pattern {
  bpm: number;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  /** Clicks per beat interval: 1 = just the beat, 2/3/4 = 8th/triplet/16th subdivision clicks. */
  subdivision: 1 | 2 | 3 | 4;
}

export interface SchedulerOptions {
  getPattern: () => Pattern;
  onBeat: (beat: BeatEvent) => void;
  /** Fires for each subdivision click strictly between two beats (not the beat itself). */
  onSubdivision?: (time: number) => void;
  /** How far ahead of `now` to schedule, in seconds. */
  lookahead?: number;
  /** Gap between start() and the first beat, in seconds. */
  startDelay?: number;
}

export interface SchedulerStats {
  scheduled: number;
  /** Smallest (beat.time − now) seen when scheduling; > 0 means no click was ever late. */
  minLead: number;
  skipped: number;
}

const freshStats = (): SchedulerStats => ({
  scheduled: 0,
  minLead: Number.POSITIVE_INFINITY,
  skipped: 0,
});

/**
 * Places beats on the audio clock. Pure: it never reads a clock itself, callers pass `now`
 * (AudioContext.currentTime). Beat times are accumulated, never re-measured, so they never drift.
 */
export class Scheduler {
  private readonly lookahead: number;
  private readonly startDelay: number;
  private nextTime = 0;
  private beatInBar = 0;
  private barIndex = 0;
  private running = false;
  stats: SchedulerStats = freshStats();

  constructor(private readonly opts: SchedulerOptions) {
    this.lookahead = opts.lookahead ?? 0.1;
    this.startDelay = opts.startDelay ?? 0.05;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(now: number): void {
    this.running = true;
    this.nextTime = now + this.startDelay;
    this.beatInBar = 0;
    this.barIndex = 0;
    this.stats = freshStats();
    this.tick(now);
  }

  stop(): void {
    this.running = false;
  }

  tick(now: number): void {
    if (!this.running) return;
    // Only a genuine stall (the next beat has fallen more than a full look-ahead window behind)
    // triggers a skip. A beat that is merely due (within the window) is scheduled normally by
    // the loop below, even if this tick was called later than usual.
    if (this.nextTime < now - this.lookahead) this.skipMissed(now);
    while (this.nextTime < now + this.lookahead) {
      const pattern = this.opts.getPattern();
      const beatsPerBar = Math.max(1, pattern.beatsPerBar);
      if (this.beatInBar >= beatsPerBar) {
        // The signature shrank mid-bar: start a new bar instead of overflowing.
        this.beatInBar = 0;
        this.barIndex++;
      }
      const duration = secondsPerBeat(pattern.bpm);
      const beat: BeatEvent = {
        time: this.nextTime,
        duration,
        beatInBar: this.beatInBar,
        beatsPerBar,
        barIndex: this.barIndex,
        level: pattern.levels[this.beatInBar] ?? (this.beatInBar === 0 ? 'accent' : 'normal'),
      };
      this.stats.scheduled++;
      this.stats.minLead = Math.min(this.stats.minLead, beat.time - now);
      this.opts.onBeat(beat);
      const subdivision = Math.max(1, pattern.subdivision);
      for (let k = 1; k < subdivision; k++) {
        this.opts.onSubdivision?.(this.nextTime + (duration * k) / subdivision);
      }
      this.nextTime += duration;
      this.beatInBar++;
      if (this.beatInBar >= beatsPerBar) {
        this.beatInBar = 0;
        this.barIndex++;
      }
    }
  }

  /** After a stall, jump forward on the same grid instead of playing a burst of late clicks. */
  private skipMissed(now: number): void {
    const { bpm, beatsPerBar } = this.opts.getPattern();
    const duration = secondsPerBeat(bpm);
    const missed = Math.ceil((now - this.nextTime) / duration);
    this.nextTime += missed * duration;
    this.stats.skipped += missed;
    const n = Math.max(1, beatsPerBar);
    const total = this.beatInBar + missed;
    this.barIndex += Math.floor(total / n);
    this.beatInBar = total % n;
  }
}
