import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import type { NodeSprites } from './nodeSprite';
import type { PolyFrame } from './polyFrame';
import { type PolyPair, polyPositions, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

const NODE_RADIUS = 10;

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  _sprites: NodeSprites,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const { vertsA, vertsB, pairs } = polyPositions(
    frame.a,
    frame.b,
    cx,
    cy,
    radius,
    NODE_RADIUS,
    (key) => frame.splitFrac[key] ?? 0,
  );

  const glowA = frame.reducedMotion ? 0 : frame.glowA;
  const glowB = frame.reducedMotion ? 0 : frame.glowB;

  // Which vertex indices belong to a still-collapsed coincident pair — skip them in the per-layer
  // draw and paint one combined node in their place. As soon as a pair starts splitting (frac>0)
  // it renders as two independent nodes, still animating apart.
  const combinedA = new Set<number>();
  const combinedB = new Set<number>();
  for (const p of pairs) {
    if ((frame.splitFrac[p.key] ?? 0) === 0) {
      combinedA.add(p.aIndex);
      combinedB.add(p.bIndex);
    }
  }

  drawLayer(
    ctx,
    vertsA,
    theme.accentAlt,
    frame.activeIndexA,
    glowA,
    frame.levelsA,
    theme,
    combinedA,
  );
  drawLayer(
    ctx,
    vertsB,
    theme.accent,
    frame.activeIndexB,
    glowB,
    frame.levelsB,
    theme,
    combinedB,
  );

  for (const p of pairs) {
    const frac = frame.splitFrac[p.key] ?? 0;
    if (frac === 0) {
      // Combined "not yet split" node: one bicolor sphere sitting at the shared vertex, hinting
      // that a tap will branch it into its two component layers.
      const activeA = frame.activeIndexA === p.aIndex;
      const activeB = frame.activeIndexB === p.bIndex;
      const combinedGlow = activeA ? glowA : activeB ? glowB : 0;
      drawCombinedNode(
        ctx,
        p.x,
        p.y,
        NODE_RADIUS,
        theme.accentAlt,
        theme.accent,
        combinedGlow,
        String(p.aIndex + 1),
      );
    } else {
      // Branching (or fully branched): the two split nodes stay tied to their shared origin by a
      // neutral hub sphere sitting at the original (unshifted) vertex, with a stalk running out
      // to each — reading as "these two belong together" instead of the old small dimmed × in
      // the gap. Doubles as the (generously sized) tap-to-recombine target.
      const va = vertsA[p.aIndex] ?? p;
      const vb = vertsB[p.bIndex] ?? p;
      drawPairHub(ctx, p, va, vb, NODE_RADIUS, theme);
    }
  }
}

function drawPairHub(
  ctx: CanvasRenderingContext2D,
  hub: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  theme: VizTheme,
): void {
  ctx.save();
  ctx.strokeStyle = theme.label;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hub.x, hub.y);
  ctx.lineTo(a.x, a.y);
  ctx.moveTo(hub.x, hub.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const r = radius * 0.7;
  ctx.fillStyle = theme.nodeIdle;
  ctx.strokeStyle = theme.label;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  layerColor: string,
  activeIndex: number,
  glow: number,
  levels: readonly BeatLevel[],
  theme: VizTheme,
  skip: Set<number>,
): void {
  if (vertices.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = layerColor;
  ctx.beginPath();
  for (const [i, v] of vertices.entries()) {
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Override both `node` (normal-level fill) and `accent` (accent-level fill) so every node in
  // this layer reads as its layer's color — not just the accent-level ones — matching the
  // connecting lines, which are already drawn in layerColor regardless of beat level.
  const layerTheme: VizTheme = { ...theme, node: layerColor, accent: layerColor, glow: layerColor };
  for (const [i, v] of vertices.entries()) {
    if (skip.has(i)) continue;
    const configured: BeatLevel = levels[i] ?? 'normal';
    const isActive = i === activeIndex;
    const g = isActive && configured !== 'mute' ? glow : 0;
    drawNode(ctx, v.x, v.y, NODE_RADIUS, configured, g, layerTheme);
    paintLabel(ctx, v.x, v.y, NODE_RADIUS, String(i + 1), configured, layerColor);
  }
}

function paintLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
  level: BeatLevel,
  layerColor: string,
): void {
  ctx.save();
  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = level === 'mute' ? layerColor : '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}

/** A single sphere split diagonally — left half in layer A's color, right half in layer B's —
 *  so at rest the two coincident layers read as one node, but with a visible hint that it is
 *  composed of two things. Tapping it branches the two out along their diagonals. */
function drawCombinedNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorA: string,
  colorB: string,
  glow: number,
  label: string,
): void {
  ctx.save();
  const r = radius * (1 + 0.25 * glow);
  ctx.shadowColor = colorB;
  ctx.shadowBlur = 6 + 30 * glow;

  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.fillStyle = colorA;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = colorB;
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  shine.addColorStop(0, `rgba(255,255,255,${0.55 + 0.4 * glow})`);
  shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}
