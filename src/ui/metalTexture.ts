export type MetalStops = readonly [number, string][];

export function conicOrLinearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: MetalStops,
): CanvasGradient {
  const gradient =
    typeof ctx.createConicGradient === 'function'
      ? ctx.createConicGradient(Math.PI / 4, x, y)
      : ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

/** Paints the knob's conic brushed-metal texture into a reusable canvas. */
export function renderMetalTexture(
  radius: number,
  dpr: number,
  stops: MetalStops,
  light = false,
): OffscreenCanvas | HTMLCanvasElement {
  const diameter = radius * 2;
  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas = useOffscreen
    ? new OffscreenCanvas(diameter * dpr, diameter * dpr)
    : document.createElement('canvas');
  if (!useOffscreen) {
    canvas.width = diameter * dpr;
    canvas.height = diameter * dpr;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const c = radius;

  ctx.fillStyle = conicOrLinearGradient(ctx, c, c, radius, stops);
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  const depth = ctx.createRadialGradient(c, c, 0, c, c, radius);
  depth.addColorStop(0.0, light ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)');
  depth.addColorStop(0.7, light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.12)');
  depth.addColorStop(1.0, light ? 'rgba(0, 0, 0, 0.18)' : 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  for (let r = 2; r < radius; r += 0.9 + Math.random() * 0.9) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const opacity = (0.25 + Math.random() * 0.75) * 0.14;
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = 0.35 + Math.random() * 0.45;
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.clip();
  const highlightAngle = -Math.PI / 3;
  const hl = ctx.createLinearGradient(
    c + Math.cos(highlightAngle) * radius,
    c + Math.sin(highlightAngle) * radius,
    c - Math.cos(highlightAngle) * radius,
    c - Math.sin(highlightAngle) * radius,
  );
  hl.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
  hl.addColorStop(0.18, 'rgba(255, 255, 255, 0.06)');
  hl.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  hl.addColorStop(0.82, light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.08)');
  hl.addColorStop(1, light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.28)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, diameter, diameter);
  ctx.restore();
  return canvas;
}
