import type { NodeStyleName } from '../state/settings';

const FULL_START = 0;
const FULL_END = Math.PI * 2;

export interface NodeStyleKit {
  /** Ring-only, no fill — a muted beat. */
  paintMute(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    idleColor: string,
    flashColor: string,
    glowColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
  /** The node's normal, at-rest look. */
  paintNormal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    glowColor: string,
    coreColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
  /** The emphasized/accent look. Must read as distinct from `paintNormal` even at `glow === 0`
   *  and even when given the exact same `color` as the `paintNormal` call for this node —
   *  polyrhythm has only one color per layer, not a separate accent color, so the distinction has
   *  to come from the painting itself, never just from the caller picking a different color. */
  paintAccent(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    glowColor: string,
    coreColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
}

function classicFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  glowColor: string,
  coreColor: string,
  glow: number,
  startAngle: number,
  endAngle: number,
  extraWash: boolean,
): void {
  const r = radius * (1 + 0.3 * glow);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6 + 34 * glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, startAngle, endAngle);
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  shine.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * glow})`);
  shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, startAngle, endAngle);
  ctx.fill();

  if (extraWash) {
    // The one structural marker that keeps accent visually distinct from normal even when a
    // caller (polyrhythm) passes the identical `color` for both — a uniform brighter wash, never
    // a second hue, so a node never looks like it "belongs to two layers".
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x, y, r, startAngle, endAngle);
    ctx.fill();
  }

  if (glow > 0) {
    ctx.globalAlpha = glow * 0.8;
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, startAngle, endAngle);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

const classicKit: NodeStyleKit = {
  paintMute(
    ctx,
    x,
    y,
    radius,
    idleColor,
    flashColor,
    glowColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 8 * glow;
    ctx.lineWidth = 2;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    if (glow > 0) {
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    classicFill(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle, endAngle, false);
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    classicFill(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle, endAngle, true);
  },
};

const flatKit: NodeStyleKit = {
  paintMute(
    ctx,
    x,
    y,
    radius,
    idleColor,
    flashColor,
    glowColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    if (glow > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 10 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 10 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
    // The distinguishing mark: a crisp bright ring border instead of a bigger glow bloom.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius - 1), startAngle, endAngle);
    ctx.stroke();
  },
};

const outlineKit: NodeStyleKit = {
  paintMute(
    ctx,
    x,
    y,
    radius,
    idleColor,
    flashColor,
    glowColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (glow > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6 * glow;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    glowColor,
    coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    // The distinguishing mark: the ring fills solid instead of staying hollow.
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6 + 20 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (glow > 0) {
      ctx.globalAlpha = glow * 0.8;
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, startAngle, endAngle);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
};

const KITS: Record<NodeStyleName, NodeStyleKit> = {
  classic: classicKit,
  flat: flatKit,
  outline: outlineKit,
};

export function getNodeStyleKit(style: NodeStyleName): NodeStyleKit {
  return KITS[style];
}
