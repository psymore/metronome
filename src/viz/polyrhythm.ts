import { drawNode } from './drawNode';
import type { PolyFrame } from './polyFrame';
import { polygonVertices, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

const NODE_RADIUS = 10;

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const verticesA = polygonVertices(frame.a, cx, cy, radius);
  const verticesB = polygonVertices(frame.b, cx, cy, radius);

  drawLayer(ctx, verticesA, theme.ring, frame.activeIndexA, frame.reducedMotion ? 0 : frame.glowA, theme);
  drawLayer(ctx, verticesB, theme.accent, frame.activeIndexB, frame.reducedMotion ? 0 : frame.glowB, theme);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  strokeStyle: string,
  activeIndex: number,
  glow: number,
  theme: VizTheme,
): void {
  if (vertices.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  vertices.forEach((v, i) => {
    const level = i === activeIndex ? 'accent' : 'normal';
    const g = i === activeIndex ? glow : 0;
    drawNode(ctx, v.x, v.y, NODE_RADIUS, level, g, theme);
  });
}
