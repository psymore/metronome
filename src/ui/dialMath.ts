import { clampBpm } from '../engine/timing';

export const DEGREES_PER_BPM = 4;

/** Signed smallest rotation from `from` to `to`, in radians, within (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function bpmAfterRotation(startBpm: number, totalRadians: number): number {
  return clampBpm(startBpm + (totalRadians * 180) / Math.PI / DEGREES_PER_BPM);
}
