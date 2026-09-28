import { describe, expect, it } from 'vitest';
import {
  clampPolyCount,
  compoundAccentLevels,
  DEFAULT_SETTINGS,
  defaultSettings,
  isCompoundMeter,
  loadSettings,
  nextLevel,
  resizeLevels,
  SETTINGS_KEY,
  sanitizeSettings,
  saveSettings,
  withBeatsPerBar,
} from '../../src/state/settings';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('defaults', () => {
  it('returns a fresh copy each time', () => {
    const a = defaultSettings();
    a.levels[0] = 'mute';
    expect(defaultSettings().levels[0]).toBe('accent');
    expect(DEFAULT_SETTINGS.levels[0]).toBe('accent');
  });

  it('loads defaults when storage is unavailable or empty', () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const s = { ...defaultSettings(), bpm: 93, visualizer: 'linear' as const };
    saveSettings(storage, s);
    expect(storage.map.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('returns defaults for corrupt JSON', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('swallows storage write errors', () => {
    const throwing = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveSettings(throwing, defaultSettings())).not.toThrow();
  });

  it('swallows storage read errors', () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('sanitizeSettings', () => {
  it('sanitises every field independently', () => {
    const s = sanitizeSettings({
      bpm: 999,
      beatsPerBar: 3,
      beatUnit: 5,
      levels: ['accent', 'bogus'],
      visualizer: 'spiral',
      syncOffsetMs: 1000,
      volume: -1,
      accentSoundId: '',
      normalSoundId: 42,
      theme: 'bogus',
    });
    expect(s).toEqual({
      bpm: 400,
      beatsPerBar: 3,
      beatUnit: 4,
      levels: ['accent', 'normal', 'normal'],
      visualizer: 'circular',
      syncOffsetMs: 200,
      volume: 0,
      accentSoundId: 'builtin:click-high',
      normalSoundId: 'builtin:click',
      theme: 'teal',
      beatsClickable: true,
      haptics: false,
      targetBars: 0,
      loopCount: 1,
      practiceSeconds: 0,
      subdivision: 1,
      language: 'en',
      depth25d: false,
      polyrhythm: { enabled: false, a: 3, b: 4, soundIdA: 'builtin:click-high', soundIdB: 'builtin:click' },
    });
  });

  it('migrates the old whole-minutes practice field to seconds', () => {
    expect(sanitizeSettings({ practiceMinutes: 5 }).practiceSeconds).toBe(300);
    // A practiceSeconds value, once present, wins outright over the legacy field.
    expect(sanitizeSettings({ practiceMinutes: 5, practiceSeconds: 90 }).practiceSeconds).toBe(90);
    expect(sanitizeSettings({ practiceMinutes: -1 }).practiceSeconds).toBe(0);
  });

  it('rejects out-of-range or fractional beat counts', () => {
    expect(sanitizeSettings({ beatsPerBar: 0 }).beatsPerBar).toBe(4);
    expect(sanitizeSettings({ beatsPerBar: 17 }).beatsPerBar).toBe(4);
    expect(sanitizeSettings({ beatsPerBar: 2.5 }).beatsPerBar).toBe(4);
  });

  it('treats non-objects as empty', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const s = {
      ...defaultSettings(),
      bpm: 77,
      syncOffsetMs: -35,
      volume: 0.3,
      accentSoundId: 'user:abc',
      theme: 'blue' as const,
    };
    expect(sanitizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('level helpers', () => {
  it('resizes levels keeping existing ones and defaulting new ones', () => {
    expect(resizeLevels(['mute', 'accent'], 4)).toEqual(['mute', 'accent', 'normal', 'normal']);
    expect(resizeLevels(['accent', 'normal', 'mute'], 2)).toEqual(['accent', 'normal']);
    expect(resizeLevels([], 2)).toEqual(['accent', 'normal']);
  });

  it('cycles accent → normal → mute → accent', () => {
    expect(nextLevel('accent')).toBe('normal');
    expect(nextLevel('normal')).toBe('mute');
    expect(nextLevel('mute')).toBe('accent');
  });

  it('accents the start of every group of 3 in a compound meter', () => {
    expect(compoundAccentLevels(6)).toEqual([
      'accent',
      'normal',
      'normal',
      'accent',
      'normal',
      'normal',
    ]);
    expect(compoundAccentLevels(9)).toEqual([
      'accent',
      'normal',
      'normal',
      'accent',
      'normal',
      'normal',
      'accent',
      'normal',
      'normal',
    ]);
  });

  it('recognises compound meters as multiples of 3 eighth-note beats', () => {
    expect(isCompoundMeter(6, 8)).toBe(true);
    expect(isCompoundMeter(9, 8)).toBe(true);
    expect(isCompoundMeter(12, 8)).toBe(true);
    expect(isCompoundMeter(3, 8)).toBe(false); // a single group needs no secondary accent
    expect(isCompoundMeter(6, 4)).toBe(false); // only eighth-denominator meters are treated as compound
    expect(isCompoundMeter(7, 8)).toBe(false); // not evenly divisible into groups of 3
  });

  it('withBeatsPerBar clamps and resizes', () => {
    const s = defaultSettings();
    expect(withBeatsPerBar(s, 6)).toEqual({
      beatsPerBar: 6,
      levels: ['accent', 'normal', 'normal', 'normal', 'normal', 'normal'],
    });
    expect(withBeatsPerBar(s, 0).beatsPerBar).toBe(1);
    expect(withBeatsPerBar(s, 99).beatsPerBar).toBe(16);
  });
});

describe('polyrhythm settings', () => {
  it('defaults to disabled, 3:4, with distinct builtin sounds', () => {
    const d = defaultSettings();
    expect(d.polyrhythm).toEqual({
      enabled: false,
      a: 3,
      b: 4,
      soundIdA: 'builtin:click-high',
      soundIdB: 'builtin:click',
    });
  });

  it('clampPolyCount clamps to 2..16 and rounds', () => {
    expect(clampPolyCount(1)).toBe(2);
    expect(clampPolyCount(17)).toBe(16);
    expect(clampPolyCount(4.6)).toBe(5);
  });

  it('sanitizeSettings clamps a/b and falls back on malformed polyrhythm data', () => {
    const s = sanitizeSettings({ polyrhythm: { enabled: true, a: 99, b: -3, soundIdA: 'x', soundIdB: '' } });
    expect(s.polyrhythm.enabled).toBe(true);
    expect(s.polyrhythm.a).toBe(16);
    expect(s.polyrhythm.b).toBe(2);
    expect(s.polyrhythm.soundIdA).toBe('x');
    expect(s.polyrhythm.soundIdB).toBe('builtin:click'); // empty string is not a valid sound id -> default
  });

  it('sanitizeSettings falls back to defaults when polyrhythm is missing or malformed entirely', () => {
    expect(sanitizeSettings({}).polyrhythm).toEqual(defaultSettings().polyrhythm);
    expect(sanitizeSettings({ polyrhythm: 'nonsense' }).polyrhythm).toEqual(defaultSettings().polyrhythm);
  });
});
