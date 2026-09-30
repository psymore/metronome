import type { BeatLevel, NodeStyleName } from '../state/settings';
import { getNodeStyleKit, mixColor } from './nodeStyleKit';
import type { VizTheme } from './types';

/** A beat sphere, painted in the given `style`. `glow` 0..1 swells/brightens it, style-dependent. */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  level: BeatLevel,
  glow: number,
  theme: VizTheme,
  style: NodeStyleName,
): void {
  const kit = getNodeStyleKit(style);
  ctx.save();
  if (level === 'mute') {
    kit.paintMute(ctx, x, y, radius, theme.nodeIdle, theme.node, theme.glow, glow);
  } else if (level === 'accent') {
    kit.paintAccent(ctx, x, y, radius, theme.accent, theme.glow, theme.core, glow);
  } else if (level === 'medium') {
    kit.paintAccent(
      ctx,
      x,
      y,
      radius,
      mixColor(theme.accent, theme.node, 0.5),
      theme.glow,
      theme.core,
      glow,
    );
  } else {
    kit.paintNormal(ctx, x, y, radius, theme.node, theme.glow, theme.core, glow);
  }
  ctx.restore();
}

/** A subdivision dot between beat nodes: a dim idle disc that lights up in the theme's node color
 *  with a soft glow while `glow` > 0. Base and flash share one radius so it reads as one dot. */
export function drawSubDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  glow: number,
  theme: VizTheme,
): void {
  ctx.save();
  ctx.fillStyle = theme.nodeIdle;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (glow > 0) {
    ctx.globalAlpha = glow;
    ctx.fillStyle = theme.node;
    ctx.shadowColor = theme.glow;
    ctx.shadowBlur = 12 * glow;
    ctx.fill();
  }
  ctx.restore();
}
