import type { BeatLevel, NodeStyleName } from '../state/settings';

/** Extra room around the sphere so its idle shadow is not clipped by the sprite edge. Sized for
 *  the widest idle shadow any style paints: Frosted accent's `shadowBlur` 8 (5 × 1.6), whose
 *  visible falloff reaches ~1.5× the blur value past the fill. */
export const SPRITE_PAD = 12;

/** Side length, in CSS pixels, of the square sprite holding a node of this radius. */
export function spriteSize(radius: number): number {
  return Math.ceil((radius + SPRITE_PAD) * 2);
}

export function spriteKey(
  themeName: string,
  style: NodeStyleName,
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
  variant = '',
): string {
  return `${themeName}|${style}|${level}|${label}|${radius.toFixed(2)}|${dpr.toFixed(2)}|${variant}`;
}

export interface NodeSprites {
  /** A pre-painted idle (glow-free) node, or null when it must be drawn live instead. `variant`
   *  distinguishes a polyrhythm layer's own-color sprite ('A'/'B') from standard mode (''). */
  get(level: BeatLevel, label: string, radius: number, variant?: string): CanvasImageSource | null;
}

export type SpriteRenderer = (
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
  variant: string,
) => CanvasImageSource | null;

/**
 * Memoises idle beat nodes. Painting one costs a `shadowBlur` pass; blitting the result costs a
 * `drawImage`. Only the node that is currently glowing still needs to be painted every frame.
 */
export class NodeSpriteCache implements NodeSprites {
  private readonly sprites = new Map<string, CanvasImageSource | null>();
  private themeName = '';
  private dpr = 1;
  private style: NodeStyleName = 'classic';

  constructor(private readonly render: SpriteRenderer) {}

  /** Every cached sprite is baked in one theme/style at one pixel ratio; a change invalidates
   *  all of them. */
  setContext(themeName: string, dpr: number, style: NodeStyleName): void {
    if (themeName === this.themeName && dpr === this.dpr && style === this.style) return;
    this.themeName = themeName;
    this.dpr = dpr;
    this.style = style;
    this.sprites.clear();
  }

  get(level: BeatLevel, label: string, radius: number, variant = ''): CanvasImageSource | null {
    const key = spriteKey(this.themeName, this.style, level, label, radius, this.dpr, variant);
    const cached = this.sprites.get(key);
    if (cached !== undefined) return cached;
    const sprite = this.render(level, label, radius, this.dpr, variant);
    this.sprites.set(key, sprite);
    return sprite;
  }

  get size(): number {
    return this.sprites.size;
  }

  /** Forces every cached sprite to be repainted, even though theme/dpr/style haven't changed —
   *  for a change `setContext` can't see itself, like a web font finishing its swap-in. */
  clear(): void {
    this.sprites.clear();
  }
}
