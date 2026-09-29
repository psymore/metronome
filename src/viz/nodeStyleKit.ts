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

/** Lightens a `#rrggbb` color toward white by `amt` (0..1). Non-hex input passes through
 *  unchanged rather than throwing — a safe no-op if a future theme token isn't hex. */
function lighten(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const num = Number.parseInt(c, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.min(255, (num >> 16) + Math.round(255 * amt));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amt));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

/** Darkens a `#rrggbb` color toward black by `amt` (0..1). Same non-hex fallback as `lighten`. */
function darken(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const num = Number.parseInt(c, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.round((num >> 16) * (1 - amt));
  const g = Math.round(((num >> 8) & 0xff) * (1 - amt));
  const b = Math.round((num & 0xff) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

function ringPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  startAngle: number,
  endAngle: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, startAngle, endAngle);
}

/**
 * Direct canvas port of the app's real `.nudge` (+/- BPM stepper) disc from styles.css: a
 * conic copper/brass/select sweep (derived from `color` itself, so it tracks every theme) plus
 * lathed grooves, a glossy highlight, and a dark LCD-style face inset that lights up when the
 * node is active — matching the physical control the rest of the panel already uses.
 */
function metalDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  litColor: string | null,
  glow: number,
  startAngle: number,
  endAngle: number,
  alpha: number,
  boost: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;

  const dark = darken(color, 0.45);
  const light = lighten(color, 0.3);
  const conic = ctx.createConicGradient((210 * Math.PI) / 180, x, y);
  conic.addColorStop(0, dark);
  conic.addColorStop(0.2, light);
  conic.addColorStop(0.4, color);
  conic.addColorStop(0.6, light);
  conic.addColorStop(0.8, dark);
  conic.addColorStop(1, dark);
  ringPath(ctx, x, y, r, startAngle, endAngle);
  ctx.fillStyle = conic;
  ctx.fill();

  ctx.save();
  ringPath(ctx, x, y, r, startAngle, endAngle);
  ctx.clip();
  const step = r * 0.09;
  for (let d = step; d < r; d += step) {
    ctx.beginPath();
    ctx.arc(x, y, d, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = Math.max(0.5, r * 0.03);
    ctx.stroke();
  }
  ctx.restore();

  const hi = ctx.createRadialGradient(
    x - r * 0.34,
    y - r * 0.44,
    0,
    x - r * 0.34,
    y - r * 0.44,
    r * 0.9,
  );
  hi.addColorStop(0, `rgba(255,255,255,${0.6 + boost * 0.25 + glow * 0.15})`);
  hi.addColorStop(0.42, 'rgba(255,255,255,0)');
  ringPath(ctx, x, y, r, startAngle, endAngle);
  ctx.fillStyle = hi;
  ctx.fill();

  const faceR = r * 0.47;
  ctx.beginPath();
  ctx.arc(x, y, faceR, 0, Math.PI * 2);
  if (litColor) {
    ctx.fillStyle = lighten(litColor, 0.1);
    ctx.shadowColor = litColor;
    ctx.shadowBlur = 6 + 10 * glow;
  } else {
    ctx.fillStyle = 'rgba(5,10,7,0.9)';
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  ringPath(ctx, x, y, r, startAngle, endAngle);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  ctx.restore();
}

const metallicKit: NodeStyleKit = {
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
    metalDisc(ctx, x, y, radius, idleColor, null, glow, startAngle, endAngle, 0.45, 0);
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8 * glow;
      ringPath(ctx, x, y, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.restore();
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    // Lit with a lightened version of the node's own color (the "brass" tone) rather than a
    // separate accent color, so a normal beat's lit face stays visibly dimmer than an accent's.
    metalDisc(ctx, x, y, radius, color, lighten(color, 0.35), glow, startAngle, endAngle, 1, 0);
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    // Lit with the theme's white-hot core color (not a hardcoded gold) and boosted, so it reads
    // as "hotter" than normal's dimmer brass-tone face while still tracking every theme.
    metalDisc(ctx, x, y, radius, color, coreColor, glow, startAngle, endAngle, 1, 1);
  },
};

const CONE_SEGS = 10;
/** Vertical squash on the base ring, faking a fixed oblique look — never rotates or animates. */
const CONE_TILT = 0.34;

function coneProject(
  cx: number,
  cy: number,
  r: number,
  h: number,
): { apex: { x: number; y: number }; base: { x: number; y: number }[] } {
  const apex = { x: cx, y: cy - h / 2 };
  const base: { x: number; y: number }[] = [];
  for (let i = 0; i < CONE_SEGS; i++) {
    const a = (i / CONE_SEGS) * Math.PI * 2;
    base.push({ x: cx + r * Math.cos(a), y: cy + h / 2 + r * Math.sin(a) * CONE_TILT });
  }
  return { apex, base };
}

/**
 * A static (never rotating) wireframe cone, projected fresh each call: an apex point, a base
 * ring, and meridian lines fanning out to it, with a faint translucent fill on the flanks —
 * brighter and more solid as the beat level rises. `fillAlpha`/`edgeAlpha` alone (not glow) carry
 * the mute/normal/accent distinction, so the three stay visually distinct even at glow 0.
 */
function drawWireframeCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  fillAlpha: number,
  edgeAlpha: number,
  glowBlur: number,
  startAngle: number,
  endAngle: number,
): void {
  ctx.save();
  if (startAngle !== FULL_START || endAngle !== FULL_END) {
    ringPath(ctx, x, y, radius, startAngle, endAngle);
    ctx.clip();
  }
  const h = radius * 1.3;
  const pr = radius * 0.82;
  const { apex, base } = coneProject(x, y, pr, h);
  if (glowBlur > 0) {
    ctx.shadowColor = lighten(color, 0.4);
    ctx.shadowBlur = glowBlur;
  }
  for (const [i, v] of base.entries()) {
    const j = (i + 1) % base.length;
    const w = base[j];
    if (!w) continue;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(v.x, v.y);
    ctx.lineTo(w.x, w.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = fillAlpha;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = edgeAlpha;
  ctx.strokeStyle = lighten(color, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [i, v] of base.entries()) {
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.stroke();
  for (const v of base) {
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(v.x, v.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

const wireframeKit: NodeStyleKit = {
  paintMute(
    ctx,
    x,
    y,
    radius,
    idleColor,
    flashColor,
    _glowColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    drawWireframeCone(ctx, x, y, radius, idleColor, 0.04, 0.28, 0, startAngle, endAngle);
    if (glow > 0) {
      drawWireframeCone(
        ctx,
        x,
        y,
        radius,
        flashColor,
        0.04 + 0.08 * glow,
        0.28 + 0.4 * glow,
        6 * glow,
        startAngle,
        endAngle,
      );
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    drawWireframeCone(
      ctx,
      x,
      y,
      radius,
      color,
      0.14 + 0.08 * glow,
      0.7,
      6 * glow,
      startAngle,
      endAngle,
    );
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    drawWireframeCone(
      ctx,
      x,
      y,
      radius,
      color,
      0.26 + 0.1 * glow,
      1,
      10 + 14 * glow,
      startAngle,
      endAngle,
    );
  },
};

/** Soft translucent, blurred-edge fill with no hard border — matte rather than glossy (Classic),
 *  turned-metal (Metallic) or faceted (Wireframe). */
function frostBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
  blur: number,
  hotAlpha: number,
  startAngle: number,
  endAngle: number,
): void {
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255,255,255,${hotAlpha})`);
  g.addColorStop(0.55, lighten(color, 0.1));
  g.addColorStop(1, color);
  ctx.globalAlpha = alpha;
  ringPath(ctx, x, y, radius * 0.92, startAngle, endAngle);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = alpha * 0.9;
  ringPath(ctx, x, y, radius, startAngle, endAngle);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = lighten(color, 0.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const frostedKit: NodeStyleKit = {
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
    frostBase(ctx, x, y, radius, idleColor, 0.28, 3, 0.3, startAngle, endAngle);
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ringPath(ctx, x, y, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.restore();
    }
  },
  paintNormal(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    frostBase(
      ctx,
      x,
      y,
      radius,
      color,
      0.5 + 0.1 * glow,
      4,
      0.55 + 0.1 * glow,
      startAngle,
      endAngle,
    );
  },
  paintAccent(
    ctx,
    x,
    y,
    radius,
    color,
    _glowColor,
    _coreColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    ctx.save();
    ctx.shadowColor = lighten(color, 0.4);
    ctx.shadowBlur = 10 + 10 * glow;
    frostBase(
      ctx,
      x,
      y,
      radius,
      color,
      0.78 + 0.15 * glow,
      5,
      0.82 + 0.15 * glow,
      startAngle,
      endAngle,
    );
    ctx.restore();
  },
};

const KITS: Record<NodeStyleName, NodeStyleKit> = {
  classic: classicKit,
  metallic: metallicKit,
  wireframe: wireframeKit,
  frosted: frostedKit,
};

export function getNodeStyleKit(style: NodeStyleName): NodeStyleKit {
  return KITS[style];
}
