import { describe, expect, it } from 'vitest';
import {
  accentProfile,
  clampPolyCount,
  DEFAULT_SETTINGS,
  defaultSettings,
  groupSizes,
  isCompoundMeter,
  isSubOn,
  loadSettings,
  nextLevel,
  patternFromSettings,
  resizeLevels,
  SETTINGS_KEY,
  sanitizeSettings,
  saveSettings,
  toggleSub,
  withSignature,
  withSubdivision,
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
      accentGain: -1,
      mediumGain: 2,
      normalGain: 'x',
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
      accentGain: 0,
      mediumGain: 1,
      normalGain: 1,
      accentSoundId: 'builtin:click-high',
      normalSoundId: 'builtin:click',
      theme: 'teal',
      nodeStyle: 'classic',
      beatsClickable: true,
      haptics: false,
      targetBars: 0,
      loopCount: 1,
      practiceSeconds: 0,
      subdivision: 1,
      subOff: [],
      language: 'en',
      depth25d: false,
      polyrhythm: {
        enabled: false,
        a: 3,
        b: 4,
        soundIdA: 'builtin:click-high',
        soundIdB: 'builtin:click',
        levelsA: ['accent', 'normal', 'normal'],
        levelsB: ['accent', 'normal', 'normal', 'normal'],
      },
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
      accentGain: 0.25,
      mediumGain: 0.4,
      normalGain: 0.7,
      accentSoundId: 'user:abc',
      theme: 'blue' as const,
    };
    expect(sanitizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('keeps the light theme selection', () => {
    expect(sanitizeSettings({ ...defaultSettings(), theme: 'light' }).theme).toBe('light');
  });
});

describe('level helpers', () => {
  it('resizes levels keeping existing ones and defaulting new ones', () => {
    expect(resizeLevels(['mute', 'accent'], 4)).toEqual(['mute', 'accent', 'normal', 'normal']);
    expect(resizeLevels(['accent', 'normal', 'mute'], 2)).toEqual(['accent', 'normal']);
    expect(resizeLevels([], 2)).toEqual(['accent', 'normal']);
  });

  it('cycles mute → normal → medium → accent → mute', () => {
    expect(nextLevel('mute')).toBe('normal');
    expect(nextLevel('normal')).toBe('medium');
    expect(nextLevel('medium')).toBe('accent');
    expect(nextLevel('accent')).toBe('mute');
  });

  it('groupSizes groups a bar per the accent-profile table', () => {
    expect(groupSizes(2, 4)).toEqual([2]);
    expect(groupSizes(3, 4)).toEqual([3]);
    expect(groupSizes(4, 4)).toEqual([2, 2]);
    expect(groupSizes(5, 4)).toEqual([3, 2]);
    expect(groupSizes(6, 8)).toEqual([3, 3]);
    expect(groupSizes(7, 8)).toEqual([2, 2, 3]);
    expect(groupSizes(9, 8)).toEqual([3, 3, 3]);
    expect(groupSizes(12, 8)).toEqual([3, 3, 3, 3]);
    expect(groupSizes(6, 4)).toEqual([3, 3]);
  });

  it('accentProfile accents only the first pulse', () => {
    expect(accentProfile(2, 4)).toEqual(['accent', 'normal']);
    expect(accentProfile(4, 4)).toEqual(['accent', 'normal', 'normal', 'normal']);
    expect(accentProfile(6, 8)).toEqual(['accent', 'normal', 'normal', 'normal', 'normal', 'normal']);
  });

  it('recognises compound meters as multiples of 3 eighth-note beats', () => {
    expect(isCompoundMeter(6, 8)).toBe(true);
    expect(isCompoundMeter(9, 8)).toBe(true);
    expect(isCompoundMeter(12, 8)).toBe(true);
    expect(isCompoundMeter(3, 8)).toBe(false); // a single group needs no secondary accent
    expect(isCompoundMeter(6, 4)).toBe(false); // only eighth-denominator meters are treated as compound
    expect(isCompoundMeter(7, 8)).toBe(false); // not evenly divisible into groups of 3
  });

  it('sanitizeSettings keeps medium as a valid beat level', () => {
    expect(sanitizeSettings({ beatsPerBar: 2, levels: ['medium', 'medium'] }).levels).toEqual([
      'medium',
      'medium',
    ]);
  });

  it('patternFromSettings zeroes subdivision and sets pulsesPerBeat 3 in a compound meter', () => {
    const s = {
      ...defaultSettings(),
      beatsPerBar: 6,
      beatUnit: 8 as const,
      subdivision: 3 as const,
    };
    expect(patternFromSettings(s)).toEqual({
      bpm: s.bpm,
      beatsPerBar: 6,
      levels: s.levels,
      subdivision: 1,
      pulsesPerBeat: 3,
      subOff: [],
    });
  });

  it('patternFromSettings keeps the configured subdivision and pulsesPerBeat 1 in 4/4', () => {
    const s = { ...defaultSettings(), subdivision: 3 as const };
    expect(patternFromSettings(s)).toEqual({
      bpm: s.bpm,
      beatsPerBar: 4,
      levels: s.levels,
      subdivision: 3,
      pulsesPerBeat: 1,
      subOff: [],
    });
  });

  it('keeps 32nd-note subdivisions in simple meters', () => {
    const s = sanitizeSettings({ ...defaultSettings(), subdivision: 8 });
    expect(s.subdivision).toBe(8);
    expect(patternFromSettings(s).subdivision).toBe(8);
  });

  it('patternFromSettings keeps pulsesPerBeat 1 for a non-compound 7/8', () => {
    const s = { ...defaultSettings(), beatsPerBar: 7, beatUnit: 8 as const };
    expect(patternFromSettings(s).pulsesPerBeat).toBe(1);
  });

  it('withSignature clamps beats and applies the accent profile for the new meter', () => {
    expect(withSignature(6, 8)).toEqual({
      beatsPerBar: 6,
      beatUnit: 8,
      levels: ['accent', 'normal', 'normal', 'normal', 'normal', 'normal'],
      subOff: [],
    });
    expect(withSignature(0, 4).beatsPerBar).toBe(1);
    expect(withSignature(99, 4).beatsPerBar).toBe(16);
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
      levelsA: ['accent', 'normal', 'normal'],
      levelsB: ['accent', 'normal', 'normal', 'normal'],
    });
  });

  it('clampPolyCount clamps to 2..16 and rounds', () => {
    expect(clampPolyCount(1)).toBe(2);
    expect(clampPolyCount(17)).toBe(16);
    expect(clampPolyCount(4.6)).toBe(5);
  });

  it('sanitizeSettings clamps a/b and falls back on malformed polyrhythm data', () => {
    const s = sanitizeSettings({
      polyrhythm: { enabled: true, a: 99, b: -3, soundIdA: 'x', soundIdB: '' },
    });
    expect(s.polyrhythm.enabled).toBe(true);
    expect(s.polyrhythm.a).toBe(16);
    expect(s.polyrhythm.b).toBe(2);
    expect(s.polyrhythm.soundIdA).toBe('x');
    expect(s.polyrhythm.soundIdB).toBe('builtin:click'); // empty string is not a valid sound id -> default
  });

  it('sanitizeSettings falls back to defaults when polyrhythm is missing or malformed entirely', () => {
    expect(sanitizeSettings({}).polyrhythm).toEqual(defaultSettings().polyrhythm);
    expect(sanitizeSettings({ polyrhythm: 'nonsense' }).polyrhythm).toEqual(
      defaultSettings().polyrhythm,
    );
  });
});

describe('subdivision pattern (subOff)', () => {
  it('treats an empty or short array as all on', () => {
    expect(isSubOn([], 4, 2, 3)).toBe(true);
    expect(isSubOn([true], 4, 2, 3)).toBe(true);
  });

  it('indexes beat-major, k from 1', () => {
    // 16ths: 3 clicks per beat; beat 1, k 2 → index 1 * 3 + 1 = 4
    const off = [false, false, false, false, true, false];
    expect(isSubOn(off, 4, 1, 2)).toBe(false);
    expect(isSubOn(off, 4, 1, 1)).toBe(true);
  });

  it('toggles one click and sizes the array to the full layout', () => {
    const next = toggleSub([], 4, 2, 3, 1);
    expect(next).toHaveLength(4); // 4 beats × (2 − 1)
    expect(next[3]).toBe(true);
    expect(toggleSub(next, 4, 2, 3, 1)[3]).toBe(false);
  });

  it('ignores out-of-range beats and clicks', () => {
    expect(toggleSub([], 4, 2, 9, 1)).toEqual([false, false, false, false]);
    expect(toggleSub([], 4, 2, 0, 2)).toEqual([false, false, false, false]);
  });

  it('resets the pattern on a signature or subdivision change', () => {
    expect(withSignature(3, 4).subOff).toEqual([]);
    expect(withSubdivision(3)).toEqual({ subdivision: 3, subOff: [] });
  });

  it('drops a stored pattern that does not fit the stored layout', () => {
    const s = sanitizeSettings({ beatsPerBar: 4, subdivision: 2, subOff: [true, false] });
    expect(s.subOff).toEqual([]);
    const ok = sanitizeSettings({ beatsPerBar: 2, subdivision: 2, subOff: [true, 'x'] });
    expect(ok.subOff).toEqual([true, false]);
  });

  it('passes the pattern to the scheduler, and none in a compound meter', () => {
    const s = {
      ...defaultSettings(),
      subdivision: 2 as const,
      subOff: [true, false, false, false],
    };
    expect(patternFromSettings(s).subOff).toEqual([true, false, false, false]);
    expect(patternFromSettings({ ...s, ...withSignature(6, 8), subOff: [true] }).subOff).toEqual(
      [],
    );
  });
});
