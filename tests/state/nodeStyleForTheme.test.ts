import { describe, expect, it } from 'vitest';
import { nodeStyleForTheme, sanitizeSettings } from '../../src/state/settings';

describe('nodeStyleForTheme', () => {
  it('falls back from Prism to Frosted in the light theme', () => {
    expect(nodeStyleForTheme('light', 'wireframe')).toBe('frosted');
  });

  it('keeps every style in the dark themes', () => {
    for (const theme of ['teal', 'amber', 'blue', 'chrome'] as const) {
      expect(nodeStyleForTheme(theme, 'wireframe')).toBe('wireframe');
    }
  });

  it('leaves the non-Prism styles alone in the light theme', () => {
    for (const style of ['classic', 'metallic', 'frosted'] as const) {
      expect(nodeStyleForTheme('light', style)).toBe(style);
    }
  });
});

describe('sanitizeSettings with the light theme', () => {
  it('does not restore a saved Prism style when the theme is light', () => {
    const s = sanitizeSettings({ theme: 'light', nodeStyle: 'wireframe' });
    expect(s.nodeStyle).toBe('frosted');
  });

  it('keeps a saved Prism style for a dark theme', () => {
    const s = sanitizeSettings({ theme: 'teal', nodeStyle: 'wireframe' });
    expect(s.nodeStyle).toBe('wireframe');
  });
});
