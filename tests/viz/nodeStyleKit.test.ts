import { describe, expect, it } from 'vitest';
import { darken, lighten } from '../../src/viz/nodeStyleKit';

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
