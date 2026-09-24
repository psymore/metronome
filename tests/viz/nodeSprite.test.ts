import { describe, expect, it, vi } from 'vitest';
import { NodeSpriteCache, spriteKey, spriteSize } from '../../src/viz/nodeSprite';

// The cache never touches a real canvas: the renderer is injected, so a marker object is enough.
const marker = (tag: string) => ({ tag }) as unknown as CanvasImageSource;

function makeCache(render = vi.fn(() => marker('sprite'))) {
  const cache = new NodeSpriteCache(render);
  cache.setContext('dark', 1);
  return { cache, render };
}

describe('spriteSize', () => {
  it('leaves room on both sides for the idle shadow', () => {
    expect(spriteSize(10)).toBe(36); // (10 + 8) * 2
  });

  it('rounds up so the sprite never clips', () => {
    expect(spriteSize(10.2)).toBe(37);
  });
});

describe('spriteKey', () => {
  it('separates every field that changes the painted pixels', () => {
    const base = spriteKey('dark', 'accent', '1', 12, 2);
    expect(spriteKey('light', 'accent', '1', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'normal', '1', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '2', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '1', 13, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '1', 12, 1)).not.toBe(base);
  });

  it('matches again for the same inputs', () => {
    expect(spriteKey('dark', 'accent', '1', 12, 2)).toBe(spriteKey('dark', 'accent', '1', 12, 2));
  });
});

describe('NodeSpriteCache', () => {
  it('paints a sprite once and reuses it', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('reuses one sprite per distinct level, label, and radius', () => {
    const { cache, render } = makeCache();
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 16; i++) {
        cache.get(i === 0 ? 'accent' : 'normal', String(i + 1), 12);
      }
    }
    // 16 distinct labels, painted once each, not 48 times.
    expect(render).toHaveBeenCalledTimes(16);
    expect(cache.size).toBe(16);
  });

  it('drops cached sprites when the theme changes', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('light', 1);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it('drops cached sprites when the pixel ratio changes', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('dark', 2);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache when the context is set to the same values', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('dark', 1);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('passes the current pixel ratio to the renderer', () => {
    const { cache, render } = makeCache();
    cache.setContext('dark', 3);
    cache.get('normal', '4', 9.5);
    expect(render).toHaveBeenCalledWith('normal', '4', 9.5, 3);
  });

  it('falls back to live drawing when the renderer returns null', () => {
    const render = vi.fn(() => null);
    const cache = new NodeSpriteCache(render);
    cache.setContext('dark', 1);
    expect(cache.get('accent', '1', 12)).toBeNull();
  });

  it('does not retry a renderer that already failed', () => {
    const render = vi.fn(() => null);
    const cache = new NodeSpriteCache(render);
    cache.setContext('dark', 1);
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
