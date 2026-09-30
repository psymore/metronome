import { isSubOn } from '../state/settings';
import { drawSubDot } from './drawNode';
import type { VizFrame } from './frame';
import { SUB_FAN_DOT_R, subDotLayout, subFanLayout } from './subDots';
import type { VizTheme } from './types';

function glowFor(frame: VizFrame, beat: number, k: number): number {
  return beat === frame.activeBeat && k === frame.activeSub ? frame.subGlow : 0;
}

/** Draws every subdivision dot in its in-place position: on/off look, glow only on the heard on
 *  dot. Skips the one beat currently fanned out (drawn separately by `drawSubFan`, on top of
 *  the beat nodes). Shared by the circular and linear renderers so both views use the same
 *  layout and on/off look. */
export function drawSubdivisionDots(
  ctx: CanvasRenderingContext2D,
  kind: 'circular' | 'linear',
  width: number,
  height: number,
  frame: VizFrame,
  theme: VizTheme,
): void {
  const sub = frame.subdivision;
  const layout = subDotLayout(kind, width, height, frame.beatsPerBar, sub);
  const fanBeat = frame.subFan && frame.subFan.frac > 0 ? frame.subFan.beat : -1;
  for (const dot of layout.dots) {
    if (dot.beat === fanBeat) continue;
    drawSubDot(
      ctx,
      dot.x,
      dot.y,
      dot.r,
      isSubOn(frame.subOff, sub, dot.beat, dot.k),
      glowFor(frame, dot.beat, dot.k),
      theme,
    );
  }
}

/** Draws the one open subdivision group fanned out into a row of tap-sized dots, lerped from
 *  their in-place positions by `frame.subFan.frac`, plus a backdrop pill behind them. Drawn
 *  after the beat nodes so it sits on top; a no-op when no group is open. */
export function drawSubFan(
  ctx: CanvasRenderingContext2D,
  kind: 'circular' | 'linear',
  width: number,
  height: number,
  frame: VizFrame,
  theme: VizTheme,
): void {
  const fan = frame.subFan;
  if (!fan || fan.frac <= 0) return;
  const sub = frame.subdivision;
  const layout = subDotLayout(kind, width, height, frame.beatsPerBar, sub);
  const group = layout.groups.find((g) => g.beat === fan.beat);
  if (!group) return;
  const fanned = subFanLayout(group, sub - 1, width, height);
  const inPlace = layout.dots.filter((d) => d.beat === fan.beat);
  const inPlaceForK = (k: number) => inPlace.find((d) => d.k === k);

  ctx.save();
  ctx.globalAlpha = fan.frac;
  const pad = SUB_FAN_DOT_R + 8;
  const xs = fanned.map((p) => p.x);
  const ys = fanned.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const radius = SUB_FAN_DOT_R + 8;
  ctx.beginPath();
  ctx.moveTo(minX + radius, minY);
  ctx.arcTo(maxX, minY, maxX, maxY, radius);
  ctx.arcTo(maxX, maxY, minX, maxY, radius);
  ctx.arcTo(minX, maxY, minX, minY, radius);
  ctx.arcTo(minX, minY, maxX, minY, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgb(0 0 0 / 0.55)';
  ctx.fill();
  ctx.strokeStyle = theme.ring;
  ctx.stroke();
  ctx.restore();

  // A beat whose dots are too small to draw (dotR === 0, see subDots.ts) has no in-place dot for
  // some or all k — its fan dots grow from the group's own position (r 0) instead of lerping
  // from a dot that was never drawn.
  fanned.forEach((target, j) => {
    const k = j + 1;
    const from = inPlaceForK(k);
    const x0 = from ? from.x : group.x;
    const y0 = from ? from.y : group.y;
    const r0 = from ? from.r : 0;
    const x = x0 + (target.x - x0) * fan.frac;
    const y = y0 + (target.y - y0) * fan.frac;
    const r = r0 + (SUB_FAN_DOT_R - r0) * fan.frac;
    drawSubDot(
      ctx,
      x,
      y,
      r,
      isSubOn(frame.subOff, sub, fan.beat, k),
      glowFor(frame, fan.beat, k),
      theme,
    );
  });
}
