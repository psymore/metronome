import type { PolyBeatEvent } from '../engine/polyScheduler';
import type { BeatEvent } from '../engine/scheduler';
import { type BeatLevel, patternFromSettings, type Settings } from '../state/settings';
import { circularVisualizer } from './circular';
import { drawNode } from './drawNode';
import { computeFrame } from './frame';
import { circularLayout } from './geometry';
import { circularBeatAt, linearBeatAt, polyBeatAt } from './hitTest';
import { linearVisualizer } from './linear';
import { NodeSpriteCache, spriteSize } from './nodeSprite';
import { computePolyFrame } from './polyFrame';
import { polyStageLayout, usePolyConcentricLayout } from './polyGeometry';
import { drawPolyrhythm, polyLayerTheme } from './polyrhythm';
import { shouldAnimate } from './renderPolicy';
import { subDotAt, subDotLayout, subFanDotAt, subFanLayout } from './subDots';
import type { VizTheme } from './types';

export interface VizSource {
  running(): boolean;
  /** Audio time currently heard, already shifted by the sync offset. */
  heardTime(): number;
  beatAt(time: number): BeatEvent | null;
  polyBeatAt(layer: 'A' | 'B', time: number): PolyBeatEvent | null;
}

export function readTheme(el: Element): VizTheme {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ring: v('--viz-ring', '#b9b9c0'),
    spoke: v('--viz-spoke', '#8e8e96'),
    node: v('--viz-node', '#d23c73'),
    accent: v('--viz-accent', '#ff2f7d'),
    accentAlt: v('--viz-accent-alt', '#f0be6a'),
    nodeAlt: v('--viz-node-alt', '#8a5a2e'),
    nodeIdle: v('--viz-node-idle', '#5a5a62'),
    hand: v('--viz-hand', '#ff2f7d'),
    label: v('--viz-label', '#b5b5bd'),
    glow: v('--viz-glow', '#ff2f7d'),
    core: v('--viz-core', '#fff3f7'),
  };
}

const POLY_SPLIT_MS = 260;

export class VizController {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private raf = 0;
  private dpr = 1;
  private size = { width: 0, height: 0 };
  private themeName: string | undefined;
  private theme: VizTheme;
  private lastGlow = 0;
  /** Logs a broken render() only once, not every frame, while still keeping the rAF loop (and
   *  the audio, which never depended on it) alive instead of dying silently on the first throw. */
  private renderErrorLogged = false;
  /** In-flight or settled split animation per coincident pair. `opening` true = 0→1 (branch out),
   *  false = 1→0 (collapse back). Once a closing animation completes the entry is removed. */
  private polyPairAnim = new Map<string, { start: number; opening: boolean }>();
  /** Ratio for which polyPairAnim's keys are valid; resets when a or b changes. */
  private polyRatio = '';
  /** The one subdivision group currently fanned out (or animating), if any. `opening` like
   *  polyPairAnim's; `shape` is the layout it was opened for — any change closes it. */
  private subFan: { beat: number; start: number; opening: boolean; shape: string } | null = null;
  private readonly sprites = new NodeSpriteCache((level, label, radius, dpr, variant) =>
    this.paintSprite(level, label, radius, dpr, variant),
  );

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: VizSource,
    private readonly getSettings: () => Settings,
    private readonly onBeatTap?: (index: number) => void,
    /** Fires once at the onset of each heard beat (glow rising from its prior decay). */
    private readonly onBeatStart?: (level: BeatLevel, barIndex: number) => void,
    private readonly onPolyBeatTap?: (layer: 'A' | 'B', index: number) => void,
    /** Reported once (see `renderErrorLogged`) if `render()` throws, so the same log+toast
     *  pipeline other uncaught errors go through also covers a broken render loop. */
    private readonly onRenderError?: (err: unknown) => void,
    /** Fires when a subdivision dot (direct or fanned-out) is tapped, toggling it on/off. */
    private readonly onSubTap?: (beat: number, k: number) => void,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
    this.ctx = ctx;
    this.theme = readTheme(canvas);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.reducedMotion.addEventListener('change', () => this.invalidate());
    document.addEventListener('visibilitychange', () => {
      // The loop stopped re-arming itself while hidden; restart it on the way back.
      if (!document.hidden) this.invalidate();
    });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    // A tap anywhere outside the canvas (panel buttons, header, etc.) closes an open fan.
    // Taps on the canvas itself are handled by onPointerDown's own fan routing.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.target !== canvas) this.closeSubFan();
      },
      true,
    );
    this.resize();
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const s = this.getSettings();
    if (!s.beatsClickable) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (s.polyrhythm.enabled) {
      const { radius } = polyStageLayout(this.size.width, this.size.height);
      const concentric = usePolyConcentricLayout(s.polyrhythm.a, s.polyrhythm.b, radius);
      const hit = polyBeatAt(
        x,
        y,
        this.size.width,
        this.size.height,
        s.polyrhythm.a,
        s.polyrhythm.b,
        (key) => this.currentSplitFrac(key),
      );
      if (!hit) {
        // Tapping empty space (not any node, not the close button itself) also closes whatever
        // pair is currently open — the small close-button hit area was easy to miss, so this
        // gives a much bigger, more forgiving target for the same action. No pairs ever open in
        // concentric mode (the two rings never share a vertex position), so this is a no-op there.
        let closedAny = false;
        for (const [key, anim] of this.polyPairAnim) {
          if (anim.opening) {
            this.animatePair(key, false);
            closedAny = true;
          }
        }
        if (closedAny) this.invalidate();
        return;
      }
      if (!concentric && hit.kind === 'pair') {
        // First tap on a still-coincident pair: start its branch-out animation, do NOT cycle
        // either layer's level. The user can then tap each half individually.
        this.animatePair(hit.pairKey, true);
        this.invalidate();
        return;
      }
      if (!concentric && hit.kind === 'pair-close') {
        // Tap on the original vertex position between the two split nodes: collapse back to the
        // symmetric rest state. Levels themselves are preserved; only the visual split closes.
        this.animatePair(hit.pairKey, false);
        this.invalidate();
        return;
      }
      if (hit.kind === 'node') this.onPolyBeatTap?.(hit.layer, hit.index);
      return;
    }
    const sub = patternFromSettings(s).subdivision;
    const kind = s.visualizer === 'linear' ? 'linear' : 'circular';
    const layout = subDotLayout(kind, this.size.width, this.size.height, s.beatsPerBar, sub);

    // 1-2. An open fan owns the next tap: toggle one of its dots, or close it.
    if (this.subFan?.opening) {
      const group = layout.groups.find((g) => g.beat === this.subFan?.beat);
      const fan = group ? subFanLayout(group, sub - 1, this.size.width, this.size.height) : [];
      const j = subFanDotAt(fan, x, y);
      if (j >= 0) this.onSubTap?.(this.subFan.beat, j + 1);
      else this.animateSubFan(this.subFan.beat, false);
      this.invalidate();
      return;
    }
    const beatAt = (scale: number) =>
      kind === 'linear'
        ? linearBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar, scale)
        : circularBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar, scale);
    // 3. A tap on a node's own body always means the node.
    const onNode = beatAt(1.1);
    if (onNode >= 0) {
      this.onBeatTap?.(onNode);
      return;
    }
    // 4. Then the subdivision dots: one dot directly, or open its group's fan.
    const hit = sub > 1 ? subDotAt(layout, x, y) : null;
    if (hit?.kind === 'dot') {
      this.onSubTap?.(hit.beat, hit.k);
      return;
    }
    if (hit?.kind === 'group') {
      this.animateSubFan(hit.beat, true, `${s.visualizer}|${s.beatsPerBar}|${sub}`);
      this.invalidate();
      return;
    }
    // 5. The node's generous hit ring, as before.
    const index = beatAt(1.8);
    if (index >= 0) this.onBeatTap?.(index);
  };

  /** 0..1 progress of an in-flight split/fan animation, eased. 0 = at rest, 1 = fully open.
   *  Reduced motion jumps straight to the end state instead of easing through it. */
  private easedFrac(anim: { start: number; opening: boolean } | undefined): number {
    if (!anim) return 0;
    if (this.reducedMotion.matches) return anim.opening ? 1 : 0;
    const t = Math.min(1, Math.max(0, (performance.now() - anim.start) / POLY_SPLIT_MS));
    const eased = 1 - (1 - t) ** 3;
    return anim.opening ? eased : 1 - eased;
  }

  /** 0..1 progress of a pair's split animation, eased. 0 = coincident, 1 = fully branched. */
  private currentSplitFrac(key: string): number {
    return this.easedFrac(this.polyPairAnim.get(key));
  }

  private animatePair(key: string, opening: boolean): void {
    const now = performance.now();
    const current = this.currentSplitFrac(key);
    // Continuity: if a reverse gesture arrives mid-animation, start the new direction from the
    // current visual position rather than snapping. Solve `1 - (1 - t)^3 === current` for t and
    // shift `start` so the eased frac at now equals current.
    const t = 1 - Math.cbrt(1 - (opening ? current : 1 - current));
    this.polyPairAnim.set(key, { start: now - t * POLY_SPLIT_MS, opening });
  }

  /** 0..1 progress of the currently open subdivision fan, eased; 0 when none is open. */
  private subFanFrac(): number {
    return this.easedFrac(this.subFan ?? undefined);
  }

  private animateSubFan(beat: number, opening: boolean, shape?: string): void {
    const now = performance.now();
    // Opening a different group than the one currently open closes the old one instantly — only
    // one fan exists at a time, so this just replaces it — and the new one starts from frac 0.
    const sameGroup = this.subFan?.beat === beat;
    const current = sameGroup ? this.subFanFrac() : 0;
    const t = 1 - Math.cbrt(1 - (opening ? current : 1 - current));
    const useShape = shape ?? this.subFan?.shape ?? '';
    this.subFan = { beat, start: now - t * POLY_SPLIT_MS, opening, shape: useShape };
  }

  closeSubFan(): void {
    if (!this.subFan?.opening) return;
    this.animateSubFan(this.subFan.beat, false);
    this.invalidate();
  }

  private subFanAnimating(): boolean {
    if (!this.subFan) return false;
    const frac = this.subFanFrac();
    return this.subFan.opening ? frac < 1 : frac > 0;
  }

  private pruneSubFan(): void {
    if (this.subFan && !this.subFan.opening && this.subFanFrac() === 0) this.subFan = null;
  }

  private polyAnimating(): boolean {
    for (const [key, anim] of this.polyPairAnim) {
      const frac = this.currentSplitFrac(key);
      if (anim.opening ? frac < 1 : frac > 0) return true;
    }
    return false;
  }

  private prunePolyPairs(): void {
    // A finished collapse (frac hit 0) leaves the pair as if it was never opened; drop the entry
    // so getSplitFrac returns 0 without paying the eased-math cost on every tick.
    for (const [key, anim] of this.polyPairAnim) {
      if (!anim.opening && this.currentSplitFrac(key) === 0) this.polyPairAnim.delete(key);
    }
  }

  /** Draw on the next frame. While the metronome runs, keeps drawing every frame. */
  invalidate(): void {
    if (this.raf === 0) this.raf = requestAnimationFrame(this.onFrame);
  }

  /** Forces cached idle-node sprites to repaint (e.g. once a web font swap-in changes node
   *  labels' rendered glyphs) and redraws. */
  invalidateSprites(): void {
    this.sprites.clear();
    this.invalidate();
  }

  private readonly onFrame = (): void => {
    this.raf = 0;
    try {
      this.render();
    } catch (err) {
      if (!this.renderErrorLogged) {
        this.renderErrorLogged = true;
        console.error(err);
        this.onRenderError?.(err);
      }
    }
    if (shouldAnimate({ running: this.source.running(), hidden: document.hidden })) {
      this.invalidate();
    }
  };

  /** Paints one idle node, label and all, into its own canvas so frames can blit it. `variant`
   *  ('A'/'B') bakes a polyrhythm layer's own color instead of the standard theme, matching what
   *  `drawLayer`'s live path paints via the same `polyLayerTheme`. */
  private paintSprite(
    level: BeatLevel,
    label: string,
    radius: number,
    dpr: number,
    variant: string,
  ): CanvasImageSource | null {
    const size = spriteSize(radius);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = canvas.width;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = size / 2;
    const style = this.getSettings().nodeStyle;
    const theme =
      variant === 'A'
        ? polyLayerTheme(this.theme, this.theme.accentAlt)
        : variant === 'B'
          ? polyLayerTheme(this.theme, this.theme.accent)
          : this.theme;
    drawNode(c, mid, mid, radius, level, 0, theme, style);
    if (style === 'classic') {
      c.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px "Inter", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowBlur = 3;
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.fillStyle = '#fff';
      c.fillText(label, mid, mid);
    }
    return canvas;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    if (s.theme !== this.themeName) {
      this.themeName = s.theme;
      this.theme = readTheme(this.canvas);
    }
    this.sprites.setContext(s.theme, this.dpr, s.nodeStyle);
    const heard = this.source.heardTime();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (s.polyrhythm.enabled) {
      const ratio = `${s.polyrhythm.a}:${s.polyrhythm.b}`;
      if (ratio !== this.polyRatio) {
        // Coincident-pair keys are indexed by (i, j) in the old ratio, so a change invalidates
        // any in-flight animation; re-collapse all pairs.
        this.polyPairAnim.clear();
        this.polyRatio = ratio;
      }
      this.prunePolyPairs();
      const splitFrac: Record<string, number> = {};
      for (const [key] of this.polyPairAnim) splitFrac[key] = this.currentSplitFrac(key);
      const beatA = this.source.polyBeatAt('A', heard);
      const beatB = this.source.polyBeatAt('B', heard);
      const frame = computePolyFrame({
        running: this.source.running(),
        beatA,
        beatB,
        heardTime: heard,
        a: s.polyrhythm.a,
        b: s.polyrhythm.b,
        levelsA: s.polyrhythm.levelsA,
        levelsB: s.polyrhythm.levelsB,
        splitFrac,
        reducedMotion: this.reducedMotion.matches,
      });
      drawPolyrhythm(this.ctx, this.size, frame, this.theme, this.sprites, s.nodeStyle);
      if (frame.glowA > this.lastGlow && beatA) {
        const level = s.polyrhythm.levelsA[beatA.index] ?? 'normal';
        this.onBeatStart?.(level, beatA.cycleIndex);
      }
      this.lastGlow = frame.glowA;
      // Keep the animation loop alive while any pair is still mid-split, even if the metronome
      // itself is stopped and shouldAnimate() would otherwise pause the frame loop.
      if (this.polyAnimating()) this.invalidate();
      return;
    }

    const sub = patternFromSettings(s).subdivision;
    const shape = `${s.visualizer}|${s.beatsPerBar}|${sub}`;
    if (this.subFan && (this.subFan.shape !== shape || !s.beatsClickable)) this.subFan = null;
    this.pruneSubFan();

    const beat = this.source.beatAt(heard);
    const frame = computeFrame({
      running: this.source.running(),
      beat,
      heardTime: heard,
      beatsPerBar: s.beatsPerBar,
      levels: s.levels,
      reducedMotion: this.reducedMotion.matches,
      // Effective clicks per beat, exactly as the scheduler plays them (1 in compound meters).
      subdivision: sub,
      subOff: patternFromSettings(s).subOff ?? [],
    });
    const subFanFrac = this.subFanFrac();
    if (this.subFan && subFanFrac > 0) frame.subFan = { beat: this.subFan.beat, frac: subFanFrac };
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme, this.sprites, s.nodeStyle);
    if (frame.glow > this.lastGlow) {
      const level =
        frame.levels[frame.activeBeat] ?? (frame.activeBeat === 0 ? 'accent' : 'normal');
      this.onBeatStart?.(level, beat?.barIndex ?? 0);
    }
    this.lastGlow = frame.glow;
    // Keep the fan's open/close animation running even while the metronome is stopped.
    if (this.subFanAnimating()) this.invalidate();
  }
}
