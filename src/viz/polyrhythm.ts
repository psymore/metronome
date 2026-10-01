import type { BeatLevel, NodeStyleName } from '../state/settings';
import { drawNode } from './drawNode';
import { MUTE_GLOW_SCALE } from './geometry';
import { type NodeSprites, spriteSize } from './nodeSprite';
import { darken, getNodeStyleKit, lighten, metalDisc } from './nodeStyleKit';
import type { PolyFrame } from './polyFrame';
import {
  polyConcentricPositions,
  polyNodeRadius,
  polyPositions,
  polyStageLayout,
  usePolyConcentricLayout,
} from './polyGeometry';
import type { VizTheme } from './types';

/** Warm red-coral used to hint "tap to close" on a branched pair's hub node — deliberately
 *  in-between red and white rather than a full alarm red, so it reads as a cue, not an error. */
const CLOSE_HINT_COLOR = '#e0685c';

/** Below this splitFrac, the pair hub fades out (rather than existing at full opacity right up
 *  to the instant it's pruned) so a collapse settles smoothly instead of the hub/close-button
 *  disappearing in a single frame. */
const HUB_FADE_FRAC = 0.22;

/** Normal/accent color for a poly layer node, derived from that layer's own hue the same way
 *  `drawLayer` derives its per-level colors — darker for normal, lighter for accent — instead of
 *  a flat layer color for both. Mute keeps the raw color (its kit paint uses `idleColor` for the
 *  visible ring anyway; `color` there only tints the glow flash). */
function levelColor(layerColor: string, level: BeatLevel): string {
  if (level === 'accent') return lighten(layerColor, 0.25);
  if (level === 'medium') return lighten(layerColor, 0.1);
  if (level === 'normal') return darken(layerColor, 0.3);
  return layerColor;
}

/** A poly layer's own node/accent/glow, derived from its layer color the same way a standalone
 *  node's theme derives them — darker for normal, lighter for accent — instead of the flat shared
 *  theme both layers would otherwise paint with. Shared with `VizController.paintSprite`, which
 *  must bake a layer's idle sprites in this exact theme for the live and cached paths to match. */
export function polyLayerTheme(theme: VizTheme, layerColor: string): VizTheme {
  return {
    ...theme,
    node: darken(layerColor, 0.3),
    accent: lighten(layerColor, 0.25),
    glow: layerColor,
  };
}

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  sprites: NodeSprites,
  style: NodeStyleName,
): void {
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  if (usePolyConcentricLayout(frame.a, frame.b, radius)) {
    drawPolyrhythmConcentric(ctx, size, frame, theme, sprites, style);
    return;
  }
  ctx.clearRect(0, 0, size.width, size.height);
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
    sprites,
    'A',
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
    sprites,
    'B',
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
      // Same darker-normal/lighter-accent split `drawLayer` applies to a layer's own split-out
      // nodes — without it, this merged view passed the raw layer color for both levels, so
      // normal and accent were only as different as each kit's own (often subtle) alpha bump,
      // making the still-merged node look "always accented" regardless of its actual level.
      drawCombinedNode(
        ctx,
        p.x,
        p.y,
        NODE_RADIUS,
        levelColor(theme.accentAlt, levelA),
        levelColor(theme.accent, levelB),
        levelA,
        levelB,
        activeA && levelA !== 'mute' ? glowA : 0,
        activeB && levelB !== 'mute' ? glowB : 0,
        String(p.aIndex + 1),
        theme.nodeIdle,
        theme.core,
        style,
      );
    } else {
      // Branching (or fully branched): the two split nodes stay tied to their shared origin by a
      // neutral hub sphere sitting at the original (unshifted) vertex, with a stalk running out
      // to each — reading as "these two belong together" instead of the old small dimmed × in
      // the gap. Doubles as the (generously sized) tap-to-recombine target.
      const va = nodePosA[p.aIndex] ?? p;
      const vb = nodePosB[p.bIndex] ?? p;
      // Fade the hub (and its red close button) out over the final stretch of a collapse instead
      // of letting it vanish the instant frac hits 0 — softens the pop into the merged conjunction
      // sphere, which previously made closing read as an abrupt snap while opening (fading the hub
      // in from nothing) already looked smooth.
      const hubAlpha = Math.min(1, frac / HUB_FADE_FRAC);
      drawPairHub(ctx, p, va, vb, NODE_RADIUS, theme, hubAlpha);
    }
  }
}

/** Concentric-rings drawing path, used once {@link usePolyConcentricLayout} fires: layer A and B
 *  each get their own ring (no split/hub/combined-node logic — the two rings' different radii
 *  already keep coincident indices apart), with a thin line linking each coincident pair's outer
 *  and inner nodes. */
function drawPolyrhythmConcentric(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  sprites: NodeSprites,
  style: NodeStyleName,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const layout = polyConcentricPositions(frame.a, frame.b, cx, cy, radius);

  const glowA = frame.reducedMotion ? 0 : frame.glowA;
  const glowB = frame.reducedMotion ? 0 : frame.glowB;

  ctx.save();
  ctx.strokeStyle = theme.label;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const link of layout.links) {
    ctx.moveTo(link.ax, link.ay);
    ctx.lineTo(link.bx, link.by);
  }
  ctx.stroke();
  ctx.restore();

  const noSkip = new Set<number>();
  drawLayer(
    ctx,
    layout.vertsA,
    layout.vertsA,
    layout.nodeRadiusA,
    theme.accentAlt,
    frame.activeIndexA,
    glowA,
    frame.levelsA,
    theme,
    noSkip,
    style,
    sprites,
    'A',
  );
  drawLayer(
    ctx,
    layout.vertsB,
    layout.vertsB,
    layout.nodeRadiusB,
    theme.accent,
    frame.activeIndexB,
    glowB,
    frame.levelsB,
    theme,
    noSkip,
    style,
    sprites,
    'B',
  );
}

function drawPairHub(
  ctx: CanvasRenderingContext2D,
  hub: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
  theme: VizTheme,
  alpha: number,
): void {
  ctx.save();
  ctx.strokeStyle = theme.label;
  ctx.globalAlpha = 0.55 * alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hub.x, hub.y);
  ctx.lineTo(a.x, a.y);
  ctx.moveTo(hub.x, hub.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.globalAlpha = alpha;

  const r = radius * 0.7;
  ctx.fillStyle = theme.nodeIdle;
  ctx.strokeStyle = theme.label;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // A red metallic disc inset from the edge hints "tap here to close this split" — same brushed
  // -metal button look the rest of the panel's controls use (see metalDisc), just red-tinted, so
  // it reads as a pressable control rather than a thin outline or a flat gradient dot.
  const closeR = r * 0.6;
  metalDisc(
    ctx,
    hub.x,
    hub.y,
    closeR,
    CLOSE_HINT_COLOR,
    CLOSE_HINT_COLOR,
    0.35,
    0,
    Math.PI * 2,
    alpha,
    0,
  );
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
  sprites: NodeSprites,
  layer: 'A' | 'B',
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

  // Both `node` (normal-level fill) and `accent` (accent-level fill) are derived from this
  // layer's own color — darker for normal, lighter for accent — the same darker/lighter
  // relationship the app's own themes use between their `node` and `accent` colors (e.g. teal's
  // dark node vs. its bright mint accent). A flat single layerColor for both levels (the previous
  // approach) collapsed that brightness distinction, leaving normal and accent within one layer
  // hard to tell apart, especially on style kits like Prism whose fill alpha is already subtle.
  // Connecting lines stay in the plain layerColor regardless of level, so a layer still reads as
  // one consistent hue across the ring.
  const layerTheme = polyLayerTheme(theme, layerColor);
  const size = spriteSize(nodeRadius);
  for (const [i, v] of nodeVerts.entries()) {
    if (skip.has(i)) continue;
    const configured: BeatLevel = levels[i] ?? 'normal';
    const isActive = i === activeIndex;
    // A muted beat still gets a (quieter) hit glow instead of none at all — matching standard
    // mode's frame.ts, which damps mute to 25% rather than zeroing it — so muted beats read as
    // "ticking silently" instead of completely inert here too.
    const g = isActive ? (configured === 'mute' ? glow * MUTE_GLOW_SCALE : glow) : 0;
    const label = String(i + 1);
    if (g === 0) {
      // Position, not look, is all that changes for a mid-split node — the cached idle sprite is
      // still valid while it's sliding apart from its former conjunction partner.
      const sprite = sprites.get(configured, label, nodeRadius, layer);
      if (sprite) {
        ctx.drawImage(sprite, v.x - size / 2, v.y - size / 2, size, size);
        continue;
      }
    }
    drawNode(ctx, v.x, v.y, nodeRadius, configured, g, layerTheme, style);
    if (style === 'classic') paintLabel(ctx, v.x, v.y, nodeRadius, label);
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
  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px "Inter", system-ui, sans-serif`;
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
  coreColor: string,
  style: NodeStyleName,
): void {
  ctx.save();
  // Passing the base (unscaled) radius here, not a pre-swollen one, matters: each half's own
  // style-kit call (e.g. Classic's paintAccent) already swells by its own glow, so scaling here
  // too would double-swell it — and since glowA/glowB can differ, a shared pre-scale would also
  // make the two halves mismatched sizes instead of each tracking its own beat.
  const r = radius * (1 + 0.25 * Math.max(glowA, glowB));

  // Prism's cone geometry (apex height, base spread) itself scales with glow, unlike the other
  // kits' flat discs — if the two halves swell by different amounts their apexes land at
  // different heights and the shared centerline no longer lines up, leaving a visibly open seam.
  // Syncing both halves to the louder of the two beats keeps the merged cone's geometry whole;
  // the halves' own color/level still make each side's brightness distinct.
  const glowForGeometry = style === 'wireframe' ? Math.max(glowA, glowB) : undefined;

  drawCombinedHalf(
    ctx,
    x,
    y,
    radius,
    Math.PI / 2,
    (3 * Math.PI) / 2,
    colorA,
    levelA,
    glowForGeometry ?? glowA,
    idleColor,
    coreColor,
    style,
  );
  drawCombinedHalf(
    ctx,
    x,
    y,
    radius,
    -Math.PI / 2,
    Math.PI / 2,
    colorB,
    levelB,
    glowForGeometry ?? glowB,
    idleColor,
    coreColor,
    style,
  );

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  if (style === 'classic') {
    ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

/** One half of a still-merged conjunction sphere, styled exactly like that layer's standalone
 *  node would be (via the same style kit `drawNode` uses) — an outline arc when muted, a solid
 *  fill when normal, the style's accent look when accented — so a collapsed conjunction stays
 *  truthful about what each layer is actually doing, not a fixed two-tone regardless of level.
 *  `idleColor` (the generic theme gray, not the layer color) keeps a muted half's ring consistent
 *  with the standalone mute node's "two different borders" look — the ring in idleColor, the
 *  glow halo in the layer's own `color`. `coreColor` is `theme.core` — the same white-hot flash
 *  core a standalone node's accent/normal fill uses — rather than the layer color, so a merged
 *  conjunction's flash matches what a split node would show. */
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
  coreColor: string,
  style: NodeStyleName,
): void {
  const kit = getNodeStyleKit(style);
  ctx.save();
  if (level === 'mute') {
    kit.paintMute(ctx, x, y, r, idleColor, color, color, glow, startAngle, endAngle);
  } else if (level === 'accent') {
    kit.paintAccent(ctx, x, y, r, color, color, coreColor, glow, startAngle, endAngle);
  } else {
    kit.paintNormal(ctx, x, y, r, color, color, coreColor, glow, startAngle, endAngle);
  }
  ctx.restore();
}
