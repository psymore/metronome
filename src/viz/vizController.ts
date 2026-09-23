import type { BeatEvent } from '../engine/scheduler';
import type { Settings } from '../state/settings';
import { circularVisualizer } from './circular';
import { computeFrame } from './frame';
import { circularLayout } from './geometry';
import { linearVisualizer } from './linear';
import type { VizTheme } from './types';

export interface VizSource {
  running(): boolean;
  /** Audio time currently heard, already shifted by the sync offset. */
  heardTime(): number;
  beatAt(time: number): BeatEvent | null;
}

export function readTheme(el: Element): VizTheme {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ring: v('--viz-ring', '#b9b9c0'),
    spoke: v('--viz-spoke', '#8e8e96'),
    node: v('--viz-node', '#d23c73'),
    accent: v('--viz-accent', '#ff2f7d'),
    nodeIdle: v('--viz-node-idle', '#5a5a62'),
    hand: v('--viz-hand', '#ff2f7d'),
    label: v('--viz-label', '#b5b5bd'),
    glow: v('--viz-glow', '#ff2f7d'),
    core: v('--viz-core', '#fff3f7'),
  };
}

export class VizController {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: VizTheme;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private raf = 0;
  private dpr = 1;
  private size = { width: 0, height: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: VizSource,
    private readonly getSettings: () => Settings,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
    this.ctx = ctx;
    this.theme = readTheme(canvas);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.reducedMotion.addEventListener('change', () => this.invalidate());
    this.resize();
  }

  /** Draw on the next frame. While the metronome runs, keeps drawing every frame. */
  invalidate(): void {
    if (this.raf === 0) this.raf = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (): void => {
    this.raf = 0;
    this.render();
    if (this.source.running()) this.invalidate();
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.size = { width: rect.width, height: rect.height };
    const { hub } = circularLayout(rect.width, rect.height);
    this.canvas.parentElement?.style.setProperty('--hub', `${Math.round(hub * 2)}px`);
    this.render();
  }

  private render(): void {
    if (this.size.width === 0) return;
    const s = this.getSettings();
    const heard = this.source.heardTime();
    const frame = computeFrame({
      running: this.source.running(),
      beat: this.source.beatAt(heard),
      heardTime: heard,
      beatsPerBar: s.beatsPerBar,
      levels: s.levels,
      reducedMotion: this.reducedMotion.matches,
    });
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme);
  }
}
