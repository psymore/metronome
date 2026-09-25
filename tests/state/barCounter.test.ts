import { describe, expect, it } from 'vitest';
import {
  barCounterFinished,
  barCounterProgress,
  formatBarCounter,
} from '../../src/state/barCounter';

describe('barCounterProgress', () => {
  it('counts up plainly when there is no target', () => {
    expect(barCounterProgress(0, 0)).toEqual({ bar: 1, loop: 1 });
    expect(barCounterProgress(6, 0)).toEqual({ bar: 7, loop: 1 });
  });

  it('wraps bar and advances loop once a target is set', () => {
    expect(barCounterProgress(0, 7)).toEqual({ bar: 1, loop: 1 });
    expect(barCounterProgress(6, 7)).toEqual({ bar: 7, loop: 1 });
    expect(barCounterProgress(7, 7)).toEqual({ bar: 1, loop: 2 });
    expect(barCounterProgress(27, 7)).toEqual({ bar: 7, loop: 4 });
  });
});

describe('formatBarCounter', () => {
  it('shows plain bar count with no target', () => {
    expect(formatBarCounter(2, 0, 1)).toBe('Bar 3');
  });

  it('shows bar/total without a loop label for a single pass', () => {
    expect(formatBarCounter(2, 7, 1)).toBe('Bar 3 / 7');
  });

  it('shows bar and loop progress for a finite loop count', () => {
    expect(formatBarCounter(8, 7, 4)).toBe('Bar 2/7 Loop 2/4');
  });

  it('shows bar and loop progress for an infinite loop', () => {
    expect(formatBarCounter(15, 7, 0)).toBe('Bar 2/7 Loop 3');
  });
});

describe('barCounterFinished', () => {
  it('never finishes with no target', () => {
    expect(barCounterFinished(999, 0, 1)).toBe(false);
  });

  it('never finishes on an infinite loop', () => {
    expect(barCounterFinished(999, 7, 0)).toBe(false);
  });

  it('finishes once all loops of the target complete', () => {
    expect(barCounterFinished(27, 7, 4)).toBe(false);
    expect(barCounterFinished(28, 7, 4)).toBe(true);
  });

  it('matches existing single-pass behavior', () => {
    expect(barCounterFinished(6, 7, 1)).toBe(false);
    expect(barCounterFinished(7, 7, 1)).toBe(true);
  });
});
