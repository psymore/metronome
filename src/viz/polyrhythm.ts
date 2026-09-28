import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { type NodeSprites, spriteSize } from './nodeSprite';
import type { PolyFrame } from './polyFrame';
import { polygonVertices, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

const NODE_RADIUS = 10;

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  sprites: NodeSprites,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const verticesA = polygonVertices(frame.a, cx, cy, radius);
  const verticesB = polygonVertices(frame.b, cx, cy, radius);

  const glowA = frame.reducedMotion ? 0 : frame.glowA;
  const glowB = frame.reducedMotion ? 0 : frame.glowB;
  drawLayer(ctx, verticesA, theme.ring, frame.activeIndexA, glowA, theme, sprites);
  drawLayer(ctx, verticesB, theme.accent, frame.activeIndexB, glowB, theme, sprites);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  strokeStyle: string,
  activeIndex: number,
  glow: number,
  theme: VizTheme,
  sprites: NodeSprites,
): void {
  if (vertices.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  for (const [i, v] of vertices.entries()) {
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Idle nodes are blitted from cached sprites; only the glowing node is painted live.
  const size = spriteSize(NODE_RADIUS);
  for (const [i, v] of vertices.entries()) {
    const level: BeatLevel = i === activeIndex ? 'accent' : 'normal';
    const g = i === activeIndex ? glow : 0;
    if (g === 0) {
      const sprite = sprites.get(level, '', NODE_RADIUS);
      if (sprite) {
        ctx.drawImage(sprite, v.x - size / 2, v.y - size / 2, size, size);
        continue;
      }
    }
    drawNode(ctx, v.x, v.y, NODE_RADIUS, level, g, theme);
  }
}
