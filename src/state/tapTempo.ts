import { clampBpm } from '../engine/timing';

export class TapTempo {
  private taps: number[] = [];

  constructor(
    private readonly maxTaps = 6,
    private readonly resetAfterMs = 3100,
  ) {}

  /** Record a tap at `nowMs`. Returns the BPM once there are two or more taps, else null. */
  tap(nowMs: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && nowMs - last > this.resetAfterMs) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const first = this.taps[0] ?? nowMs;
    const interval = (nowMs - first) / (this.taps.length - 1);
    return clampBpm(60000 / interval);
  }
}
