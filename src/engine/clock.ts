export interface OutputTimestamp {
  contextTime?: number;
  performanceTime?: number;
}

export interface HeardTimeArgs {
  /** ctx.getOutputTimestamp(), or null where unsupported. */
  timestamp: OutputTimestamp | null;
  /** performance.now() */
  perfNow: number;
  /** ctx.currentTime */
  currentTime: number;
  /** ctx.outputLatency || ctx.baseLatency || 0 */
  outputLatency: number;
  syncOffsetMs: number;
}

/** AudioContext time of the sample leaving the speakers right now, shifted by the user offset. */
export function computeHeardTime(args: HeardTimeArgs): number {
  const ts = args.timestamp;
  let t: number;
  if (
    ts &&
    typeof ts.contextTime === 'number' &&
    typeof ts.performanceTime === 'number' &&
    ts.performanceTime > 0
  ) {
    t = ts.contextTime + (args.perfNow - ts.performanceTime) / 1000;
  } else {
    t = args.currentTime - args.outputLatency;
  }
  return Math.min(t, args.currentTime) - args.syncOffsetMs / 1000;
}
