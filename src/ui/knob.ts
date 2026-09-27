import { t } from '../i18n/i18n';
import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { angleDelta, bpmAfterRotation } from './dialMath';

export interface KnobDeps {
  store: Store<Settings>;
  isRunning: () => boolean;
  toggle: () => void;
}

export interface Knob {
  /** Re-render with current settings/running state (e.g. after engine start/stop). */
  invalidate(): void;
  /** Brief brightening of the center glow on an accent beat — a bounded ~260ms animation,
   *  not a continuous loop, so it costs nothing between beats. */
  flash(): void;
  /** While true, tapping the center does nothing (sounds still loading). */
  setDisabled(disabled: boolean): void;
}

interface KnobTheme {
  /** Hex string, for direct fillStyle/strokeStyle use. */
  brass: string;
  /** Same color as an [r, g, b] tuple, for building rgba() strings at custom (animated)
   *  alpha — the LCD glow needs to fade in and out, which a fixed CSS var can't do. */
  brassRgb: [number, number, number];
}

/** #rrggbb -> [r, g, b]; falls back to the default brass if a theme ever ships a non-hex value. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [127, 224, 187];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readKnobTheme(el: Element): KnobTheme {
  const css = getComputedStyle(el);
  const brass = css.getPropertyValue('--brass').trim() || '#7fe0bb';
  return { brass, brassRgb: hexToRgb(brass) };
}

function rgba([r, g, b]: [number, number, number], alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Blends a theme color toward white — used for the hover state, so it reads as "the accent,
 *  brightened" for every theme instead of a hardcoded emerald tint. */
function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return [mix(r), mix(g), mix(b)];
}

/** Pre-rendered once per (radius, theme): the conic brushed-steel face, sampled and rotated
 *  live instead of recomputing its gradient every frame. */
function renderMetalTexture(radius: number, dpr: number): OffscreenCanvas | HTMLCanvasElement {
  const diameter = radius * 2;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(diameter * dpr, diameter * dpr)
      : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = diameter * dpr;
    canvas.height = diameter * dpr;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const c = radius;

  const conic = ctx.createConicGradient(Math.PI / 4, c, c);
  conic.addColorStop(0.0, '#6b6b70');
  conic.addColorStop(0.18, '#e8e8ec');
  conic.addColorStop(0.35, '#4a4a4e');
  conic.addColorStop(0.52, '#9a9aa0');
  conic.addColorStop(0.7, '#f2f2f5');
  conic.addColorStop(0.88, '#55555a');
  conic.addColorStop(1.0, '#6b6b70');
  ctx.fillStyle = conic;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  const depth = ctx.createRadialGradient(c, c, 0, c, c, radius);
  depth.addColorStop(0.0, 'rgba(255, 255, 255, 0.08)');
  depth.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)');
  depth.addColorStop(1.0, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  for (let r = 2; r < radius; r += 1.4) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const opacity = (Math.sin(r * 12) * 0.5 + 0.5) * 0.14;
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  return canvas;
}

/** Pre-rendered once per (radius, teeth, theme): the whole ring of outer notches, unrotated —
 *  rotated as a single image at draw time instead of redrawing 100 gradient-filled rects a
 *  frame while dragging. */
function renderTeethRing(
  outerRadius: number,
  toothDepth: number,
  count: number,
  dpr: number,
): OffscreenCanvas | HTMLCanvasElement {
  const size = outerRadius * 2;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size * dpr, size * dpr)
      : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = size * dpr;
    canvas.height = size * dpr;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.translate(outerRadius, outerRadius);
  const toothWidth = Math.max(1.5, outerRadius * 0.03);
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-toothWidth / 2, -outerRadius, toothWidth, toothDepth + 0.5);
    const grad = ctx.createLinearGradient(0, -outerRadius, 0, -outerRadius + toothDepth);
    grad.addColorStop(0, '#cfcfd4');
    grad.addColorStop(0.5, '#68686d');
    grad.addColorStop(1, '#333336');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }
  return canvas;
}

/** Pre-rendered once per (radius, thickness, tilt): the cylindrical side wall under the face —
 *  it never depends on rotation, so it's just an image at draw time (2.5D mode only). */
function renderSideWall(
  radius: number,
  thickness: number,
  perspectiveY: number,
  dpr: number,
): OffscreenCanvas | HTMLCanvasElement {
  const pad = 4;
  const w = (radius + pad) * 2;
  const h = (radius + pad) * 2 + thickness;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w * dpr, h * dpr)
      : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const cx = radius + pad;
  const cy = radius + pad;
  for (let i = Math.round(thickness); i > 0; i--) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + i, radius, radius * perspectiveY, 0, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(cx - radius, 0, cx + radius, 0);
    grad.addColorStop(0.0, '#0c0c0d');
    grad.addColorStop(0.3, '#3a3a3e');
    grad.addColorStop(0.6, '#101012');
    grad.addColorStop(0.85, '#48484d');
    grad.addColorStop(1.0, '#08080a');
    ctx.fillStyle = grad;
    ctx.fill();
  }
  return canvas;
}

export function mountKnob(canvas: HTMLCanvasElement, deps: KnobDeps): Knob {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  let dpr = window.devicePixelRatio || 1;
  let cssWidth = 0;
  let cssHeight = 0;
  let theme = readKnobTheme(canvas);
  let disabled = false;
  let hovered = false;
  let rotation = 0;
  let flashUntil = 0;
  let flashRaf = 0;
  const FLASH_MS = 260;

  let metalTexture: OffscreenCanvas | HTMLCanvasElement | null = null;
  let teethRing: OffscreenCanvas | HTMLCanvasElement | null = null;
  let sideWall: OffscreenCanvas | HTMLCanvasElement | null = null;
  let assetsFor = { radius: -1, tilted: false };

  const TOOTH_COUNT = 72;

  function geometry() {
    const size = Math.min(cssWidth, cssHeight);
    const outerRadius = size * 0.47;
    const toothDepth = outerRadius * 0.09;
    const innerRadius = outerRadius - toothDepth;
    const coreRadius = innerRadius * 0.42 * 1.6;
    const thickness = outerRadius * 0.16;
    const tilted = document.documentElement.classList.contains('depth-25d');
    const perspectiveY = tilted ? 0.72 : 1;
    return {
      size,
      outerRadius,
      toothDepth,
      innerRadius,
      coreRadius,
      thickness,
      tilted,
      perspectiveY,
    };
  }

  function ensureAssets(): void {
    const g = geometry();
    if (assetsFor.radius === g.outerRadius && assetsFor.tilted === g.tilted && metalTexture) return;
    assetsFor = { radius: g.outerRadius, tilted: g.tilted };
    metalTexture = renderMetalTexture(g.innerRadius, dpr);
    teethRing = renderTeethRing(g.outerRadius, g.toothDepth, TOOTH_COUNT, dpr);
    sideWall = g.tilted ? renderSideWall(g.outerRadius, g.thickness, g.perspectiveY, dpr) : null;
  }

  function isInsideCenter(clientX: number, clientY: number): boolean {
    const g = geometry();
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - cssWidth / 2;
    const y = (clientY - rect.top - cssHeight / 2) / g.perspectiveY;
    return x * x + y * y <= g.coreRadius * g.coreRadius;
  }

  function render(): void {
    if (cssWidth === 0 || cssHeight === 0) return;
    ensureAssets();
    const g = geometry();
    const c2d = ctx as CanvasRenderingContext2D;
    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const running = deps.isRunning();

    c2d.clearRect(0, 0, cssWidth, cssHeight);

    // Ground shadow.
    c2d.save();
    c2d.beginPath();
    c2d.ellipse(
      cx,
      cy + (g.tilted ? g.thickness : 0) + g.outerRadius * 0.05,
      g.outerRadius + 6,
      (g.outerRadius + 6) * g.perspectiveY,
      0,
      0,
      Math.PI * 2,
    );
    c2d.fillStyle = 'rgba(0, 0, 0, 0.55)';
    c2d.fill();
    c2d.restore();

    if (g.tilted && sideWall) {
      c2d.drawImage(
        sideWall,
        cx - sideWall.width / (2 * dpr),
        cy - g.outerRadius - 4,
        sideWall.width / dpr,
        sideWall.height / dpr,
      );
    }

    if (teethRing) {
      c2d.save();
      c2d.translate(cx, cy);
      c2d.scale(1, g.perspectiveY);
      c2d.rotate(rotation);
      c2d.drawImage(
        teethRing,
        -teethRing.width / (2 * dpr),
        -teethRing.height / (2 * dpr),
        teethRing.width / dpr,
        teethRing.height / dpr,
      );
      c2d.restore();
    }

    if (metalTexture) {
      c2d.save();
      c2d.translate(cx, cy);
      c2d.scale(1, g.perspectiveY);
      c2d.beginPath();
      c2d.arc(0, 0, g.innerRadius, 0, Math.PI * 2);
      c2d.clip();
      c2d.rotate(rotation);
      c2d.drawImage(
        metalTexture,
        -metalTexture.width / (2 * dpr),
        -metalTexture.height / (2 * dpr),
        metalTexture.width / dpr,
        metalTexture.height / dpr,
      );
      c2d.restore();
    }

    // Bezel ring + rotating indicator tick.
    c2d.save();
    c2d.translate(cx, cy);
    c2d.scale(1, g.perspectiveY);
    c2d.beginPath();
    c2d.arc(0, 0, g.innerRadius, 0, Math.PI * 2);
    const ringGrad = c2d.createLinearGradient(
      -g.innerRadius,
      -g.innerRadius,
      g.innerRadius,
      g.innerRadius,
    );
    ringGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    ringGrad.addColorStop(0.5, 'rgba(20, 20, 22, 0.9)');
    ringGrad.addColorStop(1, 'rgba(180, 180, 186, 0.4)');
    c2d.strokeStyle = ringGrad;
    c2d.lineWidth = Math.max(1.5, g.outerRadius * 0.017);
    c2d.stroke();

    c2d.rotate(rotation);
    c2d.beginPath();
    c2d.moveTo(0, -g.innerRadius + g.innerRadius * 0.06);
    c2d.lineTo(0, -g.innerRadius + g.innerRadius * 0.17);
    c2d.lineWidth = Math.max(2, g.outerRadius * 0.03);
    c2d.lineCap = 'round';
    c2d.strokeStyle = theme.brass;
    c2d.shadowColor = theme.brass;
    c2d.shadowBlur = 6;
    c2d.stroke();
    c2d.restore();

    // Center LCD display + play/pause.
    c2d.save();
    c2d.translate(cx, cy);
    c2d.scale(1, g.perspectiveY);

    c2d.beginPath();
    c2d.arc(0, 0, g.coreRadius, 0, Math.PI * 2);
    c2d.fillStyle = '#050a07';
    c2d.fill();

    const flashLeft = Math.max(0, flashUntil - performance.now());
    const flashT = flashLeft / FLASH_MS; // 1 → just flashed, 0 → fully decayed
    const baseAlpha = running ? 0.4 : 0.12;
    const alpha = Math.min(0.85, baseAlpha + flashT * 0.45);
    const hoverRgb = lighten(theme.brassRgb, 0.35);
    const glowR = g.coreRadius + g.coreRadius * (0.2 + flashT * 0.15);
    const glow = c2d.createRadialGradient(0, 0, g.coreRadius * 0.7, 0, 0, glowR);
    glow.addColorStop(0, hovered ? rgba(hoverRgb, 0.4) : rgba(theme.brassRgb, alpha));
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c2d.beginPath();
    c2d.arc(0, 0, glowR, 0, Math.PI * 2);
    c2d.fillStyle = glow;
    c2d.fill();

    c2d.beginPath();
    c2d.arc(0, 0, g.coreRadius, 0, Math.PI * 2);
    c2d.strokeStyle = hovered ? rgba(hoverRgb, 1) : theme.brass;
    c2d.lineWidth = Math.max(1.2, g.coreRadius * 0.045);
    c2d.stroke();

    const bpm = Math.round(deps.store.get().bpm);
    c2d.fillStyle = theme.brass;
    c2d.shadowColor = theme.brass;
    c2d.shadowBlur = running ? 8 : 3;
    c2d.font = `700 ${Math.round(g.coreRadius * 0.52)}px "Roboto Mono", ui-monospace, monospace`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    c2d.fillText(String(bpm), 0, -g.coreRadius * 0.22);

    c2d.shadowBlur = 0;
    c2d.font = `${Math.round(g.coreRadius * 0.22)}px "Inter", system-ui, sans-serif`;
    c2d.fillStyle = rgba(theme.brassRgb, 0.65);
    c2d.fillText('BPM', 0, g.coreRadius * 0.08);

    const iconColor = hovered ? rgba(hoverRgb, 1) : theme.brass;
    c2d.fillStyle = iconColor;
    const iy = g.coreRadius * 0.42;
    const is = g.coreRadius * 0.24;
    if (!running) {
      c2d.beginPath();
      c2d.moveTo(-is * 0.4, iy - is);
      c2d.lineTo(is * 0.75, iy);
      c2d.lineTo(-is * 0.4, iy + is);
      c2d.closePath();
      c2d.fill();
    } else {
      const bw = is * 0.4;
      c2d.fillRect(-bw * 1.6, iy - is, bw, is * 2);
      c2d.fillRect(bw * 0.6, iy - is, bw, is * 2);
    }
    c2d.restore();

    canvas.setAttribute(
      'aria-label',
      `${t('dial.ariaLabel')}: ${bpm} ${t('bpm.unit')}. ${running ? t('play.stop') : t('play.start')}.`,
    );
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = window.devicePixelRatio || 1;
    cssWidth = rect.width;
    cssHeight = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    (ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0);
    assetsFor = { radius: -1, tilted: false };
    render();
  }

  let dragging = false;
  let lastAngle = 0;
  let dragTotal = 0;
  let startBpm = 0;

  function angleAt(clientX: number, clientY: number): number {
    const rect = canvas.getBoundingClientRect();
    const g = geometry();
    const x = clientX - rect.left - cssWidth / 2;
    const y = (clientY - rect.top - cssHeight / 2) / g.perspectiveY;
    return Math.atan2(y, x);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (isInsideCenter(e.clientX, e.clientY)) {
      if (!disabled) deps.toggle();
      return;
    }
    dragging = true;
    dragTotal = 0;
    startBpm = deps.store.get().bpm;
    lastAngle = angleAt(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const nowHovered = isInsideCenter(e.clientX, e.clientY);
    if (nowHovered !== hovered) {
      hovered = nowHovered;
      if (!dragging) render();
    }
    if (!dragging) return;
    const angle = angleAt(e.clientX, e.clientY);
    const delta = angleDelta(lastAngle, angle);
    dragTotal += delta;
    rotation += delta;
    lastAngle = angle;
    const next = bpmAfterRotation(startBpm, dragTotal);
    if (next !== deps.store.get().bpm) deps.store.set({ bpm: next });
    else render();
  });

  function endDrag(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const bpm = deps.store.get().bpm + (e.deltaY < 0 ? step : -step);
      deps.store.set({ bpm: Math.min(400, Math.max(20, Math.round(bpm))) });
    },
    { passive: false },
  );

  new ResizeObserver(() => resize()).observe(canvas);
  deps.store.subscribe((s, prev) => {
    if (s.bpm !== prev.bpm) render();
    if (s.theme !== prev.theme) {
      theme = readKnobTheme(canvas);
      render();
    }
    if (s.depth25d !== prev.depth25d) {
      assetsFor = { radius: -1, tilted: false };
      render();
    }
  });

  resize();

  function flash(): void {
    flashUntil = performance.now() + FLASH_MS;
    if (flashRaf) return; // a decay loop is already running towards this (or a later) deadline
    const step = () => {
      render();
      if (performance.now() < flashUntil) {
        flashRaf = requestAnimationFrame(step);
      } else {
        flashRaf = 0;
      }
    };
    flashRaf = requestAnimationFrame(step);
  }

  return {
    invalidate: render,
    flash,
    setDisabled(v: boolean) {
      disabled = v;
      canvas.style.opacity = v ? '0.5' : '';
    },
  };
}
