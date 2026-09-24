import type { BeatLevel } from '../state/settings';

/** Extra room around the sphere so its idle shadow is not clipped by the sprite edge. */
export const SPRITE_PAD = 8;

/** Side length, in CSS pixels, of the square sprite holding a node of this radius. */
export function spriteSize(radius: number): number {
  return Math.ceil((radius + SPRITE_PAD) * 2);
}

export function spriteKey(
  themeName: string,
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
): string {
  return `${themeName}|${level}|${label}|${radius.toFixed(2)}|${dpr.toFixed(2)}`;
}

export interface NodeSprites {
  /** A pre-painted idle (glow-free) node, or null when it must be drawn live instead. */
  get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null;
}

export type SpriteRenderer = (
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
) => CanvasImageSource | null;

/**
 * Memoises idle beat nodes. Painting one costs a `shadowBlur` pass; blitting the result costs a
 * `drawImage`. Only the node that is currently glowing still needs to be painted every frame.
 */
export class NodeSpriteCache implements NodeSprites {
  private readonly sprites = new Map<string, CanvasImageSource | null>();
  private themeName = '';
  private dpr = 1;

  constructor(private readonly render: SpriteRenderer) {}

  /** Every cached sprite is baked in one theme at one pixel ratio; a change invalidates them all. */
  setContext(themeName: string, dpr: number): void {
    if (themeName === this.themeName && dpr === this.dpr) return;
    this.themeName = themeName;
    this.dpr = dpr;
    this.sprites.clear();
  }

  get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null {
    const key = spriteKey(this.themeName, level, label, radius, this.dpr);
    const cached = this.sprites.get(key);
    if (cached !== undefined) return cached;
    const sprite = this.render(level, label, radius, this.dpr);
    this.sprites.set(key, sprite);
    return sprite;
  }

  get size(): number {
    return this.sprites.size;
  }
}
