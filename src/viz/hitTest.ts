import {
  circularLayout,
  circularNodeSpacing,
  linearLayout,
  linearNodeSpacing,
  linearNodeX,
  nodeAngle,
  nodeRadius,
  polar,
} from './geometry';

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function circularBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const { cx, cy, r } = circularLayout(width, height);
  const hitR = nodeRadius(r, circularNodeSpacing(count, r)) * 1.8;
  for (let i = 0; i < count; i++) {
    const p = polar(cx, cy, r, nodeAngle(i, count));
    if (Math.hypot(x - p.x, y - p.y) <= hitR) return i;
  }
  return -1;
}

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function linearBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const track = linearLayout(width, height);
  const hitR = nodeRadius(track.width / 2, linearNodeSpacing(count, track.width)) * 1.8;
  for (let i = 0; i < count; i++) {
    const nx = linearNodeX(i, count, track.left, track.width);
    if (Math.hypot(x - nx, y - track.y) <= hitR) return i;
  }
  return -1;
}
