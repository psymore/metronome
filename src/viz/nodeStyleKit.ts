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
    // A muted beat still ticks — a very slight ring swell on the hit, much smaller than
    // normal/accent's, keeps mute from feeling completely inert without making it read as "on".
    const r = radius * (1 + 0.32 * glow);
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 8 * glow;
    ctx.lineWidth = 2;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, r, startAngle, endAngle);
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

const RGB_RE = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;

/** Parses `#rrggbb` or `rgb(r,g,b)` (whitespace-tolerant) into channels. Anything else — including
 *  a color this module doesn't itself produce, like `hsl(...)` or a named color — is `null`, so
 *  callers can no-op rather than throw. Accepting our own `rgb(...)` output is what lets
 *  `lighten`/`darken` chain (e.g. `metalDisc`'s `ringColor`, or `polyrhythm.ts` deriving a color
 *  via one of these before handing it to a kit that calls the other). */
function parseRgb(color: string): [number, number, number] | null {
  const rgbMatch = color.match(RGB_RE);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  const hex = color.replace('#', '');
  if (hex.length !== 6) return null;
  const num = Number.parseInt(hex, 16);
  if (Number.isNaN(num)) return null;
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/** Lightens a `#rrggbb` or `rgb(...)` color toward white by `amt` (0..1). Unparseable input passes
 *  through unchanged rather than throwing — a safe no-op if a future theme token isn't a color this
 *  module understands. */
export function lighten(color: string, amt: number): string {
  const parsed = parseRgb(color);
  if (!parsed) return color;
  const [r, g, b] = parsed;
  const add = Math.round(255 * amt);
  return `rgb(${Math.min(255, r + add)},${Math.min(255, g + add)},${Math.min(255, b + add)})`;
}

/** Darkens a `#rrggbb` or `rgb(...)` color toward black by `amt` (0..1). Same fallback as `lighten`. */
export function darken(color: string, amt: number): string {
  const parsed = parseRgb(color);
  if (!parsed) return color;
  const [r, g, b] = parsed;
  const mul = 1 - amt;
  return `rgb(${Math.round(r * mul)},${Math.round(g * mul)},${Math.round(b * mul)})`;
}

/** Blends two `#rrggbb`/`rgb(...)` colors, `t` (0..1) of the way from `a` to `b`. Falls back to
 *  `a` unchanged if either color doesn't parse — same no-op fallback as `lighten`/`darken`. */
export function mixColor(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(pa[0], pb[0])},${mix(pa[1], pb[1])},${mix(pa[2], pb[2])})`;
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
/** The brushed-metal disc's color sweep. `createConicGradient` only exists from Safari 16.4 /
 *  Chrome 99 — on an older browser (notably iOS 15.x, still in the wild), falling back to a plain
 *  diagonal `createLinearGradient` (light -> ringColor -> dark, top-left to bottom-right) keeps
 *  `metalDisc` usable everywhere instead of throwing a TypeError. */
export function metalSweepGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ringColor: string,
  light: string,
  dark: string,
): CanvasGradient {
  if (typeof ctx.createConicGradient === 'function') {
    const conic = ctx.createConicGradient((210 * Math.PI) / 180, x, y);
    conic.addColorStop(0, dark);
    conic.addColorStop(0.2, light);
    conic.addColorStop(0.4, ringColor);
    conic.addColorStop(0.6, light);
    conic.addColorStop(0.8, dark);
    conic.addColorStop(1, dark);
    return conic;
  }
  const linear = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  linear.addColorStop(0, light);
  linear.addColorStop(0.5, ringColor);
  linear.addColorStop(1, dark);
  return linear;
}

export function metalDisc(
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

  // `boost` (accent only) lightens the whole disc, not just the center LED — otherwise normal
  // and accent read as the same brass disc with only a faint LED-color difference at rest.
  const ringColor = boost > 0 ? lighten(color, 0.12) : color;
  const dark = darken(ringColor, 0.45);
  const light = lighten(ringColor, 0.3);
  const sweep = metalSweepGradient(ctx, x, y, r, ringColor, light, dark);
  // A whole-disc glow on the hit (not just the center LED's), matching how strongly Classic's
  // hit flash reads — previously only the small LED brightened, so Metallic's pulse felt much
  // weaker than Classic's next to it.
  if (glow > 0) {
    ctx.shadowColor = lighten(color, 0.15);
    ctx.shadowBlur = 34 * glow;
  }
  ringPath(ctx, x, y, r, startAngle, endAngle);
  ctx.fillStyle = sweep;
  ctx.fill();
  ctx.shadowBlur = 0;

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
    // Dim (not off) at rest, so the LED itself already hints which phase this node is in;
    // full brightness only kicks in on the hit (`glow > 0`).
    ctx.fillStyle = 'rgba(5,10,7,0.9)';
    ctx.fill();
    ctx.globalAlpha = 0.4 + 0.15 * boost + 0.6 * glow;
    ctx.fillStyle = lighten(litColor, 0.1);
    ctx.shadowColor = litColor;
    ctx.shadowBlur = 6 + 4 * boost + 10 * glow;
  } else {
    ctx.fillStyle = 'rgba(5,10,7,0.9)';
  }
  ctx.fill();
  ctx.globalAlpha = alpha;
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
    _flashColor,
    _glowColor,
    glow,
    startAngle = FULL_START,
    endAngle = FULL_END,
  ) {
    // A very slight swell on the hit, much smaller than normal/accent's, so a muted beat still
    // ticks visibly without reading as "on". No separate flash-ring overlay here (unlike the
    // other kits' mute) — Metallic's mute is already a solid filled disc, not a hollow outline,
    // so stroking a flat-colored ring on top of its own reflective gradient/highlight/border
    // didn't fade cleanly; it clashed instead of blending. `metalDisc`'s own whole-disc shadow
    // glow (the same one normal/accent use) already gives it a smooth from-within brighten.
    metalDisc(
      ctx,
      x,
      y,
      radius * (1 + 0.32 * glow),
      idleColor,
      null,
      glow,
      startAngle,
      endAngle,
      0.45,
      0,
    );
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
    // The LED face is lit with a lightly lightened version of the node's own color, so it stays
    // recognizably the theme's hue instead of washing out toward white — dim at rest, full
    // brightness only on the hit itself. The disc itself also swells on the hit (matching
    // Classic's radius pulse), since the LED alone read as too subtle a hit cue on its own.
    metalDisc(
      ctx,
      x,
      y,
      radius * (1 + 0.3 * glow),
      color,
      lighten(color, 0.15),
      glow,
      startAngle,
      endAngle,
      1,
      0,
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
    // A more strongly lightened version of the same hue (not the theme's near-white core color),
    // so accent reads as visibly "hotter" and brighter than normal's dim brass tone while staying
    // a tinted color rather than turning into a plain white LED like the flash core does. Swells
    // slightly more than normal on the hit, same reasoning as normal's pulse above.
    metalDisc(
      ctx,
      x,
      y,
      radius * (1 + 0.3 * glow),
      color,
      lighten(color, 0.45),
      glow,
      startAngle,
      endAngle,
      1,
      1,
    );
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
    // The cone itself extends well past `radius` (taller and wider than the node's nominal
    // bounding circle — see h/pr below), so clipping the half-split view to a circle of exactly
    // `radius` chopped off the cone's apex/base. A much larger clip radius keeps the same
    // half-plane cut (the two endpoints are always diametrically opposite, so the implicit
    // chord is still a straight line through the center) without curving back in on the cone.
    ringPath(ctx, x, y, radius * 3, startAngle, endAngle);
    ctx.clip();
  }
  const h = radius * 1.45;
  const pr = radius * 0.88;
  const { apex, base } = coneProject(x, y, pr, h);
  // The glow (shadowBlur) stays on through both the fill and the edge strokes below, instead of
  // being zeroed before the edges — previously only the translucent fill pulsed with the hit
  // while the crisp wireframe lines never glowed at all, which read as two mismatched effects
  // (a soft blurry fill and static sharp lines) rather than one unified pulse.
  if (glowBlur > 0) {
    ctx.shadowColor = lighten(color, 0.2);
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
  ctx.globalAlpha = edgeAlpha;
  ctx.strokeStyle = lighten(color, 0.28);
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
  ctx.shadowBlur = 0;
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
    // A very slight swell on the hit, much smaller than normal/accent's, so a muted beat still
    // ticks visibly without reading as "on". The idle cone swells too, not just the flash
    // overlay: drawn at two different radii they read as two separate, offset cones.
    const r = radius * (1 + 0.32 * glow);
    drawWireframeCone(ctx, x, y, r, idleColor, 0.07, 0.42, 0, startAngle, endAngle);
    if (glow > 0) {
      drawWireframeCone(
        ctx,
        x,
        y,
        r,
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
      radius * (1 + 0.3 * glow),
      color,
      0.32 + 0.08 * glow,
      1,
      30 * glow,
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
      radius * (1 + 0.3 * glow),
      color,
      0.4 + 0.12 * glow,
      1,
      34 * glow,
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
  // `ctx.filter = blur(...)` (a full off-screen raster blur pass on every paint) used to stand in
  // for the frosted-glass softness here. It's far costlier than `shadowBlur`, and since polyrhythm
  // nodes mid-split are live-repainted every animation frame (not drawn from the idle sprite
  // cache), that cost multiplied across every visible frosted node each frame — visible as a
  // stutter while a conjunction opens/closes. `shadowBlur` gives a comparable soft edge much
  // cheaper, so it replaces the filter entirely.
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * 1.6;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255,255,255,${hotAlpha})`);
  g.addColorStop(0.55, lighten(color, 0.28));
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
    // A very slight swell on the hit, much smaller than normal/accent's, so a muted beat still
    // ticks visibly without reading as "on". The flash ring follows the same swollen radius as
    // the base; at the unswollen radius it read as a second, separate ring inside the disc.
    const r = radius * (1 + 0.32 * glow);
    frostBase(ctx, x, y, r, idleColor, 0.28, 3, 0.3, startAngle, endAngle);
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ringPath(ctx, x, y, r, startAngle, endAngle);
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
    // `blur` scales with glow now (previously a flat 3, matching only the idle softness), so the
    // hit reads as a comparably strong pulse to Classic's big `shadowBlur` swing instead of a
    // much quieter one.
    frostBase(
      ctx,
      x,
      y,
      radius * (1 + 0.3 * glow),
      color,
      0.88 + 0.1 * glow,
      3 + 22 * glow,
      0.88 + 0.1 * glow,
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
    // The old outer shadowColor/shadowBlur set here was immediately overwritten by frostBase's
    // own shadowBlur assignment, so it never actually did anything — rolled into frostBase's own
    // `blur` param instead, same as normal above.
    frostBase(
      ctx,
      x,
      y,
      radius * (1 + 0.3 * glow),
      color,
      0.78 + 0.15 * glow,
      5 + 26 * glow,
      0.82 + 0.15 * glow,
      startAngle,
      endAngle,
    );
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
