import { describe, expect, it } from 'vitest';
import { shouldAnimate } from '../../src/viz/renderPolicy';

describe('shouldAnimate', () => {
  it('animates while running and visible', () => {
    expect(shouldAnimate({ running: true, hidden: false })).toBe(true);
  });

  it('stops while running but hidden', () => {
    expect(shouldAnimate({ running: true, hidden: true })).toBe(false);
  });

  it('stops when not running', () => {
    expect(shouldAnimate({ running: false, hidden: false })).toBe(false);
  });

  it('resumes animating when the page becomes visible again', () => {
    const hiddenThenVisible = [
      shouldAnimate({ running: true, hidden: true }),
      shouldAnimate({ running: true, hidden: false }),
    ];
    expect(hiddenThenVisible).toEqual([false, true]);
  });
});
