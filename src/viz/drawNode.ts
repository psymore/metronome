import type { BeatLevel, NodeStyleName } from '../state/settings';
import { getNodeStyleKit } from './nodeStyleKit';
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
  } else {
    kit.paintNormal(ctx, x, y, radius, theme.node, theme.glow, theme.core, glow);
  }
  ctx.restore();
}
