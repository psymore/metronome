import type { NodeStyleName } from '../state/settings';
import type { VizFrame } from './frame';
import type { NodeSprites } from './nodeSprite';

export interface VizTheme {
  ring: string;
  spoke: string;
  node: string;
  accent: string;
  /** Contrasting accent used for polyrhythm layer A so the two layers read as distinct colors. */
  accentAlt: string;
  /** Deep base tone of the `accentAlt` hue (what `node` is to `accent`); colors layer A's
   *  polyrhythm outline. Falls back to `accentAlt` when a theme doesn't define it. */
  nodeAlt?: string;
  /** Polyrhythm outline width; theme-specific for visibility against different surfaces. */
  polyLineWidth?: number;
  /** Backdrop fill for the expanded subdivision-click capsule. */
  subFanFill?: string;
  /** True in the light theme, where the poly layers' accent must read darker than its normal
   *  beats (the paper background washes out lighter tones). Dark themes leave it unset. */
  light?: boolean;
  nodeIdle: string;
  hand: string;
  label: string;
  glow: string;
  core: string;
}

export interface Visualizer {
  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    frame: VizFrame,
    theme: VizTheme,
    sprites: NodeSprites,
    style: NodeStyleName,
  ): void;
}
