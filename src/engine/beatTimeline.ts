import type { BeatEvent } from './scheduler';

/** Recently scheduled beats, oldest first, so visuals can look up what is being heard. */
export class BeatTimeline {
  private beats: BeatEvent[] = [];

  constructor(private readonly capacity = 64) {}

  push(beat: BeatEvent): void {
    this.beats.push(beat);
    if (this.beats.length > this.capacity) {
      this.beats.splice(0, this.beats.length - this.capacity);
    }
  }

  clear(): void {
    this.beats = [];
  }

  /** The latest beat whose start time is <= time, or null. */
  beatAt(time: number): BeatEvent | null {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const beat = this.beats[i];
      if (beat && beat.time <= time) return beat;
    }
    return null;
  }

  get size(): number {
    return this.beats.length;
  }
}

export function beatPhase(beat: BeatEvent, time: number): number {
  if (beat.duration <= 0) return 0;
  return Math.min(1, Math.max(0, (time - beat.time) / beat.duration));
}
