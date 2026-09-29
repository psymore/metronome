import type { BeatLevel, NodeStyleName } from '../state/settings';
import { drawNode } from './drawNode';
import type { NodeSprites } from './nodeSprite';
import { getNodeStyleKit } from './nodeStyleKit';
import type { PolyFrame } from './polyFrame';
import { polyNodeRadius, polyPositions, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

/** Warm red-coral used to hint "tap to close" on a branched pair's hub node — deliberately
 *  in-between red and white rather than a full alarm red, so it reads as a cue, not an error. */
const CLOSE_HINT_COLOR = '#e0685c';

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  _sprites: NodeSprites,
  style: NodeStyleName,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const NODE_RADIUS = polyNodeRadius(frame.a, frame.b, radius);
  const { vertsA, vertsB, nodePosA, nodePosB, pairs } = polyPositions(
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
    nodePosA,
    NODE_RADIUS,
    theme.accentAlt,
    frame.activeIndexA,
    glowA,
    frame.levelsA,
    theme,
    combinedA,
    style,
  );
  drawLayer(
    ctx,
    vertsB,
    nodePosB,
    NODE_RADIUS,
    theme.accent,
    frame.activeIndexB,
    glowB,
    frame.levelsB,
    theme,
    combinedB,
    style,
  );

  for (const p of pairs) {
    const frac = frame.splitFrac[p.key] ?? 0;
    if (frac === 0) {
      // Combined "not yet split" node: one bicolor sphere sitting at the shared vertex, hinting
      // that a tap will branch it into its two component layers.
      const activeA = frame.activeIndexA === p.aIndex;
      const activeB = frame.activeIndexB === p.bIndex;
      const levelA: BeatLevel = frame.levelsA[p.aIndex] ?? 'normal';
      const levelB: BeatLevel = frame.levelsB[p.bIndex] ?? 'normal';
      drawCombinedNode(
        ctx,
        p.x,
        p.y,
        NODE_RADIUS,
        theme.accentAlt,
        theme.accent,
        levelA,
        levelB,
        activeA && levelA !== 'mute' ? glowA : 0,
        activeB && levelB !== 'mute' ? glowB : 0,
        String(p.aIndex + 1),
        theme.nodeIdle,
        style,
      );
    } else {
      // Branching (or fully branched): the two split nodes stay tied to their shared origin by a
      // neutral hub sphere sitting at the original (unshifted) vertex, with a stalk running out
      // to each — reading as "these two belong together" instead of the old small dimmed × in
      // the gap. Doubles as the (generously sized) tap-to-recombine target.
      const va = nodePosA[p.aIndex] ?? p;
      const vb = nodePosB[p.bIndex] ?? p;
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

  // A warm solid-filled disc inset from the edge hints "tap here to close this split" — styled
  // like the panel's own physical buttons (gradient fill + soft glow + a bright highlight) rather
  // than a thin outline, so it reads as a pressable control, not just a decorative ring.
  const closeR = r * 0.6;
  ctx.shadowColor = CLOSE_HINT_COLOR;
  ctx.shadowBlur = 6;
  const fill = ctx.createRadialGradient(
    hub.x - closeR * 0.35,
    hub.y - closeR * 0.35,
    0,
    hub.x,
    hub.y,
    closeR,
  );
  fill.addColorStop(0, '#ff9c8f');
  fill.addColorStop(1, CLOSE_HINT_COLOR);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, closeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(
    hub.x - closeR * 0.35,
    hub.y - closeR * 0.35,
    0,
    hub.x,
    hub.y,
    closeR,
  );
  shine.addColorStop(0, 'rgba(255,255,255,0.55)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, closeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  outlineVerts: { x: number; y: number }[],
  nodeVerts: { x: number; y: number }[],
  nodeRadius: number,
  layerColor: string,
  activeIndex: number,
  glow: number,
  levels: readonly BeatLevel[],
  theme: VizTheme,
  skip: Set<number>,
  style: NodeStyleName,
): void {
  if (outlineVerts.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = layerColor;
  ctx.beginPath();
  for (const [i, v] of outlineVerts.entries()) {
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Override both `node` (normal-level fill) and `accent` (accent-level fill) so every node in
  // this layer reads as its layer's color — not just the accent-level ones — matching the
  // connecting lines, which are already drawn in layerColor regardless of beat level.
  // `nodeIdle` is deliberately left as the generic theme gray: a muted node's crisp ring
  // (nodeIdle) plus its shadow-blur halo (glow, in layerColor) landing in two different colors
  // is the same "two borders" look standard mode already has, and it reads well — keep it here.
  const layerTheme: VizTheme = { ...theme, node: layerColor, accent: layerColor, glow: layerColor };
  for (const [i, v] of nodeVerts.entries()) {
    if (skip.has(i)) continue;
    const configured: BeatLevel = levels[i] ?? 'normal';
    const isActive = i === activeIndex;
    const g = isActive && configured !== 'mute' ? glow : 0;
    drawNode(ctx, v.x, v.y, nodeRadius, configured, g, layerTheme, style);
    paintLabel(ctx, v.x, v.y, nodeRadius, String(i + 1));
  }
}

function paintLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
): void {
  ctx.save();
  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}

/** A single sphere split down the middle — left half layer A, right half layer B — so at rest
 *  the two coincident layers read as one node with a visible hint that it is composed of two
 *  things. Each half is styled by that layer's own beat level (ring/solid/brightened-solid), so
 *  a collapsed conjunction stays truthful about what each layer is actually doing, not a fixed
 *  two-tone regardless of level. Tapping it branches the two out along their diagonals. */
function drawCombinedNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorA: string,
  colorB: string,
  levelA: BeatLevel,
  levelB: BeatLevel,
  glowA: number,
  glowB: number,
  label: string,
  idleColor: string,
  style: NodeStyleName,
): void {
  ctx.save();
  const r = radius * (1 + 0.25 * Math.max(glowA, glowB));

  drawCombinedHalf(
    ctx,
    x,
    y,
    r,
    Math.PI / 2,
    (3 * Math.PI) / 2,
    colorA,
    levelA,
    glowA,
    idleColor,
    style,
  );
  drawCombinedHalf(
    ctx,
    x,
    y,
    r,
    -Math.PI / 2,
    Math.PI / 2,
    colorB,
    levelB,
    glowB,
    idleColor,
    style,
  );

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

/** One half of a still-merged conjunction sphere, styled exactly like that layer's standalone
 *  node would be (via the same style kit `drawNode` uses) — an outline arc when muted, a solid
 *  fill when normal, the style's accent look when accented — so a collapsed conjunction stays
 *  truthful about what each layer is actually doing, not a fixed two-tone regardless of level.
 *  `idleColor` (the generic theme gray, not the layer color) keeps a muted half's ring consistent
 *  with the standalone mute node's "two different borders" look — the ring in idleColor, the
 *  glow halo in the layer's own `color`. */
function drawCombinedHalf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  startAngle: number,
  endAngle: number,
  color: string,
  level: BeatLevel,
  glow: number,
  idleColor: string,
  style: NodeStyleName,
): void {
  const kit = getNodeStyleKit(style);
  ctx.save();
  if (level === 'mute') {
    kit.paintMute(ctx, x, y, r, idleColor, color, color, glow, startAngle, endAngle);
  } else if (level === 'accent') {
    kit.paintAccent(ctx, x, y, r, color, color, color, glow, startAngle, endAngle);
  } else {
    kit.paintNormal(ctx, x, y, r, color, color, color, glow, startAngle, endAngle);
  }
  ctx.restore();
}
