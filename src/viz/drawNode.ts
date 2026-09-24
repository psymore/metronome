import type { BeatLevel } from '../state/settings';
import type { VizTheme } from './types';

/** A glowing sphere. `glow` 0..1 swells it and adds a hot white core. */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  level: BeatLevel,
  glow: number,
  theme: VizTheme,
): void {
  ctx.save();
  if (level === 'mute') {
    ctx.shadowColor = theme.glow;
    ctx.shadowBlur = 4 + 8 * glow;
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.nodeIdle;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (glow > 0) {
      ctx.globalAlpha = glow;
      ctx.strokeStyle = theme.node;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // Same size for every level (matches the settings beat row) — accent is distinguished
  // by color/glow only, so a bigger accent ball never crowds its neighbors.
  const r = radius * (1 + 0.3 * glow);
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 6 + 34 * glow;
  ctx.fillStyle = level === 'accent' ? theme.accent : theme.node;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  shine.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * glow})`);
  shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  if (glow > 0) {
    ctx.globalAlpha = glow * 0.8;
    ctx.fillStyle = theme.core;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
