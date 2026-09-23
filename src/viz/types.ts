import type { VizFrame } from './frame';

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
  ): void;
}
