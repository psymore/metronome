import { describe, expect, it, vi } from 'vitest';
import { conicOrLinearGradient } from '../../src/ui/knob';

describe('conicOrLinearGradient', () => {
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

  const stops: readonly [number, string][] = [
    [0, '#111111'],
    [0.5, '#888888'],
    [1, '#eeeeee'],
  ];

  it('uses a conic gradient with all stops when the browser supports it', () => {
    const { ctx, createConicGradient, conicGradient } = makeCtx(true);

    const result = conicOrLinearGradient(ctx, 10, 10, 8, stops);

    expect(createConicGradient).toHaveBeenCalledTimes(1);
    expect(conicGradient.addColorStop).toHaveBeenCalledTimes(3);
    expect(result).toBe(conicGradient);
  });

  it('falls back to a diagonal linear gradient with the same stops when unsupported', () => {
    const { ctx, createLinearGradient, linearGradient } = makeCtx(false);

    const result = conicOrLinearGradient(ctx, 10, 10, 8, stops);

    expect(createLinearGradient).toHaveBeenCalledWith(2, 2, 18, 18); // (x-r,y-r) -> (x+r,y+r)
    expect(linearGradient.addColorStop).toHaveBeenCalledTimes(3);
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#111111');
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(2, 0.5, '#888888');
    expect(linearGradient.addColorStop).toHaveBeenNthCalledWith(3, 1, '#eeeeee');
    expect(result).toBe(linearGradient);
  });
});
