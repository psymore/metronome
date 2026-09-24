import type { VizFrame } from './frame';
import type { NodeSprites } from './nodeSprite';

export interface VizTheme {
  ring: string;
  spoke: string;
  node: string;
  accent: string;
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
  ): void;
}
