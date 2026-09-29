import { describe, expect, it, vi } from 'vitest';
import { darken, lighten, metalSweepGradient } from '../../src/viz/nodeStyleKit';

describe('lighten', () => {
  it('lightens a #rrggbb color toward white', () => {
    expect(lighten('#000000', 0.5)).toBe('rgb(128,128,128)');
  });

  it('accepts its own rgb(...) output and lightens further', () => {
    const once = lighten('#000000', 0.2);
    const twice = lighten(once, 0.2);
    expect(twice).not.toBe(once);
  });

  it('passes through non-color input unchanged', () => {
    expect(lighten('not-a-color', 0.5)).toBe('not-a-color');
  });

  it('clamps channels at 255', () => {
    expect(lighten('#ffffff', 0.5)).toBe('rgb(255,255,255)');
  });
});

describe('darken', () => {
  it('darkens a #rrggbb color toward black', () => {
    expect(darken('#ffffff', 0.5)).toBe('rgb(128,128,128)');
  });

  it('accepts its own rgb(...) output and darkens further', () => {
    const once = darken('#ffffff', 0.2);
    const twice = darken(once, 0.2);
    expect(twice).not.toBe(once);
  });

  it('passes through non-color input unchanged', () => {
    expect(darken('not-a-color', 0.5)).toBe('not-a-color');
  });

  it('clamps channels at 0', () => {
    expect(darken('#000000', 0.5)).toBe('rgb(0,0,0)');
  });
});

describe('lighten and darken composed on rgb(...) output', () => {
  it('darken(lighten(x)) actually changes the value relative to lighten alone', () => {
    const lightened = lighten('#336699', 0.3);
    const darkenedAfter = darken(lightened, 0.3);
    expect(darkenedAfter).not.toBe(lightened);
  });
});

describe('metalSweepGradient', () => {
  function makeCtx(supportsConic: boolean) {
    const conicGradient = { addColorStop: vi.fn() };
    const linearGradient = { addColorStop: vi.fn() };
    const createConicGradient = vi.fn(() => conicGradient);
    const createLinearGradient = vi.fn(() => linearGradient);
    const ctx = {
      createLinearGradient,
      ...(supportsConic ? { createConicGradient } : {}),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, createConicGradient, createLinearGradient, conicGradient, linearGradient };
  }

  it('uses a conic gradient with 6 stops when the browser supports it', () => {
    const { ctx, createConicGradient, conicGradient } = makeCtx(true);

    const result = metalSweepGradient(ctx, 10, 20, 5, '#336699', '#5599cc', '#112233');

    expect(createConicGradient).toHaveBeenCalledTimes(1);
    expect(conicGradient.addColorStop).toHaveBeenCalledTimes(6);
    expect(result).toBe(conicGradient);
  });

  it('falls back to a diagonal linear gradient (light -> ringColor -> dark) when unsupported', () => {
    const { ctx, createLinearGradient, linearGradient } = makeCtx(false);

    const result = metalSweepGradient(ctx, 10, 20, 5, '#336699', '#5599cc', '#112233');

    expect(createLinearGradient).toHaveBeenCalledWith(5, 15, 15, 25); // (x-r,y-r) -> (x+r,y+r)
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#5599cc');
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(2, 0.5, '#336699');
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(3, 1, '#112233');
    expect(result).toBe(linearGradient);
  });
});
