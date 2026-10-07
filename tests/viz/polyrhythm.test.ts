import { describe, expect, it, vi } from 'vitest';
import type { BeatLevel } from '../../src/state/settings';
import type { NodeSprites } from '../../src/viz/nodeSprite';
import { darken } from '../../src/viz/nodeStyleKit';
import type { PolyFrame } from '../../src/viz/polyFrame';
import { drawPolyrhythm, polyLayerTheme } from '../../src/viz/polyrhythm';
import type { VizTheme } from '../../src/viz/types';

const theme: VizTheme = {
  ring: '#b9b9c0',
  spoke: '#8e8e96',
  node: '#d23c73',
  accent: '#ff2f7d',
  accentAlt: '#f0be6a',
  nodeIdle: '#5a5a62',
  hand: '#ff2f7d',
  label: '#b5b5bd',
  glow: '#ff2f7d',
  core: '#fff3f7',
};

describe('polyLayerTheme', () => {
  it('derives node/accent/glow from the layer color, keeping the rest of the theme', () => {
    const result = polyLayerTheme(theme, '#336699');
    expect(result.glow).toBe('#336699');
    expect(result.node).not.toBe(theme.node);
    expect(result.accent).not.toBe(theme.accent);
    expect(result.ring).toBe(theme.ring);
    expect(result.nodeIdle).toBe(theme.nodeIdle);
    expect(result.core).toBe(theme.core);
  });

  it('makes the accent the deepest tone in the light theme, not a lighter one', () => {
    const result = polyLayerTheme({ ...theme, light: true }, '#336699');
    expect(result.node).toBe(darken('#336699', 0.12));
    expect(result.accent).toBe(darken('#336699', 0.42));
  });
});

/** No real canvas in this test environment: a Proxy stands in for CanvasRenderingContext2D,
 *  no-op'ing every method/gradient call a live style-kit paint might make so painting the always-
 *  live combined/hub nodes doesn't throw, while `drawImage` calls are recorded for assertions. */
function makeFakeCtx() {
  const drawImageCalls: unknown[][] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, prop: string) {
      if (prop === 'drawImage') {
        return (...args: unknown[]) => {
          drawImageCalls.push(args);
        };
      }
      if (
        prop === 'createRadialGradient' ||
        prop === 'createConicGradient' ||
        prop === 'createLinearGradient'
      ) {
        return () => gradient;
      }
      if (prop in t) return t[prop];
      return (..._args: unknown[]) => undefined;
    },
    set(t, prop: string, value) {
      t[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImageCalls };
}

function makeFrame(overrides: Partial<PolyFrame> = {}): PolyFrame {
  return {
    running: true,
    a: 3,
    b: 2,
    activeIndexA: -1,
    activeIndexB: -1,
    glowA: 0,
    glowB: 0,
    levelsA: ['accent', 'normal', 'normal'],
    levelsB: ['accent', 'normal'],
    splitFrac: {},
    reducedMotion: false,
    ...overrides,
  };
}

describe('drawPolyrhythm sprite usage', () => {
  it('draws every idle (non-glowing) node from the sprite cache instead of live', () => {
    const sprite = { tag: 'sprite' } as unknown as CanvasImageSource;
    const get = vi.fn(
      (_level: BeatLevel, _label: string, _radius: number, _variant?: string) => sprite,
    );
    const sprites: NodeSprites = { get };
    const { ctx, drawImageCalls } = makeFakeCtx();

    drawPolyrhythm(ctx, { width: 300, height: 300 }, makeFrame(), theme, sprites, 'classic');

    // 3:2 has one coincident pair (index 0 of each layer, always-live combined node); the
    // remaining 2 layer-A nodes and 1 layer-B node are idle and should come from the cache.
    expect(get).toHaveBeenCalledTimes(3);
    expect(drawImageCalls).toHaveLength(3);
    const variants = get.mock.calls.map((call) => call[3]);
    expect(variants.filter((v) => v === 'A')).toHaveLength(2);
    expect(variants.filter((v) => v === 'B')).toHaveLength(1);
  });

  it('does not fetch a sprite for a glowing (actively hit) node', () => {
    const sprite = { tag: 'sprite' } as unknown as CanvasImageSource;
    const get = vi.fn(() => sprite);
    const sprites: NodeSprites = { get };
    const { ctx, drawImageCalls } = makeFakeCtx();

    drawPolyrhythm(
      ctx,
      { width: 300, height: 300 },
      makeFrame({ activeIndexA: 1, glowA: 1 }),
      theme,
      sprites,
      'classic',
    );

    // Layer A's node 1 is glowing and must be painted live; only A:2 and B:1 are idle.
    expect(get).toHaveBeenCalledTimes(2);
    expect(drawImageCalls).toHaveLength(2);
  });
});
