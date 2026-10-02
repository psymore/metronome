import { renderMetalTexture } from './metalTexture';

const METAL_STOPS: readonly [number, string][] = [
  [0, '#17150f'],
  [0.18, '#443c2d'],
  [0.35, '#221f18'],
  [0.52, '#332d22'],
  [0.7, '#514734'],
  [0.88, '#221f18'],
  [1, '#17150f'],
];

export function mountDialHub(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');

  let texture: OffscreenCanvas | HTMLCanvasElement | null = null;
  let textureRadius = 0;
  let textureDpr = 0;

  const render = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const radius = Math.min(width, height) / 2 - 4;
    if (radius <= 0) return;
    if (!texture || textureRadius !== radius || textureDpr !== dpr) {
      texture = renderMetalTexture(radius, dpr, METAL_STOPS);
      textureRadius = radius;
      textureDpr = dpr;
    }

    const x = width / 2;
    const y = height / 2;
    ctx.drawImage(texture, x - radius, y - radius, radius * 2, radius * 2);

    const bezel = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    bezel.addColorStop(0, 'rgba(225, 230, 232, 0.9)');
    bezel.addColorStop(0.5, 'rgba(12, 14, 16, 0.95)');
    bezel.addColorStop(1, 'rgba(112, 118, 122, 0.85)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = bezel;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  new ResizeObserver(render).observe(canvas);
  window.addEventListener('resize', render);
  render();
}
