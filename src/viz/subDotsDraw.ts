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

  inPlace.forEach((dot, j) => {
    const target = fanned[j];
    if (!target) return;
    const x = dot.x + (target.x - dot.x) * fan.frac;
    const y = dot.y + (target.y - dot.y) * fan.frac;
    const r = dot.r + (SUB_FAN_DOT_R - dot.r) * fan.frac;
    drawSubDot(
      ctx,
      x,
      y,
      r,
      isSubOn(frame.subOff, sub, dot.beat, dot.k),
      glowFor(frame, dot.beat, dot.k),
      theme,
    );
  });
}
