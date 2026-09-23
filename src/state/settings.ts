import { clampBpm } from '../engine/timing';

export type BeatLevel = 'accent' | 'normal' | 'mute';
export type VisualizerKind = 'circular' | 'linear';
export const BEAT_UNITS = [2, 4, 8, 16] as const;
export type BeatUnit = (typeof BEAT_UNITS)[number];
export const THEMES = ['teal', 'amber', 'yellow'] as const;
export type ThemeName = (typeof THEMES)[number];

export const MIN_BEATS = 1;
export const MAX_BEATS = 16;
export const SYNC_OFFSET_LIMIT_MS = 200;
export const SETTINGS_KEY = 'metronome.settings.v1';

export interface Settings {
  bpm: number;
  beatsPerBar: number;
  beatUnit: BeatUnit;
  levels: BeatLevel[];
  visualizer: VisualizerKind;
  /** Positive values delay the visuals (for outputs that under-report latency). */
  syncOffsetMs: number;
  volume: number;
  accentSoundId: string;
  normalSoundId: string;
  theme: ThemeName;
}

export const DEFAULT_SETTINGS: Settings = {
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  levels: ['accent', 'normal', 'normal', 'normal'],
  visualizer: 'circular',
  syncOffsetMs: 0,
  volume: 0.8,
  accentSoundId: 'builtin:click-high',
  normalSoundId: 'builtin:click',
  theme: 'teal',
};

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, levels: [...DEFAULT_SETTINGS.levels] };
}

export function isBeatLevel(v: unknown): v is BeatLevel {
  return v === 'accent' || v === 'normal' || v === 'mute';
}

export function isBeatUnit(v: unknown): v is BeatUnit {
  return (BEAT_UNITS as readonly unknown[]).includes(v);
}

export function isThemeName(v: unknown): v is ThemeName {
  return (THEMES as readonly unknown[]).includes(v);
}

function defaultLevel(index: number): BeatLevel {
  return index === 0 ? 'accent' : 'normal';
}

export function resizeLevels(levels: readonly BeatLevel[], n: number): BeatLevel[] {
  return Array.from({ length: n }, (_, i) => levels[i] ?? defaultLevel(i));
}

/**
 * Canonical accent pattern for compound meters (6/8, 9/8, 12/8, ...): each
 * dotted-quarter group of 3 gets its own accent ("ONE-two-three FOUR-five-six"),
 * not just beat 1.
 */
export function compoundAccentLevels(beatsPerBar: number): BeatLevel[] {
  return Array.from({ length: beatsPerBar }, (_, i) => (i % 3 === 0 ? 'accent' : 'normal'));
}

export function isCompoundMeter(beatsPerBar: number, beatUnit: BeatUnit): boolean {
  return beatUnit === 8 && beatsPerBar > 3 && beatsPerBar % 3 === 0;
}

export function nextLevel(level: BeatLevel): BeatLevel {
  if (level === 'accent') return 'normal';
  if (level === 'normal') return 'mute';
  return 'accent';
}

export function withBeatsPerBar(s: Settings, n: number): Pick<Settings, 'beatsPerBar' | 'levels'> {
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(MIN_BEATS, Math.round(n)));
  return { beatsPerBar, levels: resizeLevels(s.levels, beatsPerBar) };
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function isSoundId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length < 200;
}

export function sanitizeSettings(raw: unknown): Settings {
  const r: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = defaultSettings();
  const beatsPerBar = isIntInRange(r.beatsPerBar, MIN_BEATS, MAX_BEATS)
    ? r.beatsPerBar
    : d.beatsPerBar;
  const levels = Array.isArray(r.levels)
    ? r.levels.map((l, i): BeatLevel => (isBeatLevel(l) ? l : defaultLevel(i)))
    : [];
  return {
    bpm: typeof r.bpm === 'number' ? clampBpm(r.bpm) : d.bpm,
    beatsPerBar,
    beatUnit: isBeatUnit(r.beatUnit) ? r.beatUnit : d.beatUnit,
    levels: resizeLevels(levels, beatsPerBar),
    visualizer: r.visualizer === 'linear' ? 'linear' : 'circular',
    syncOffsetMs: Math.round(
      clampNumber(r.syncOffsetMs, d.syncOffsetMs, -SYNC_OFFSET_LIMIT_MS, SYNC_OFFSET_LIMIT_MS),
    ),
    volume: clampNumber(r.volume, d.volume, 0, 1),
    accentSoundId: isSoundId(r.accentSoundId) ? r.accentSoundId : d.accentSoundId,
    normalSoundId: isSoundId(r.normalSoundId) ? r.normalSoundId : d.normalSoundId,
    theme: isThemeName(r.theme) ? r.theme : d.theme,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings {
  try {
    const json = storage?.getItem(SETTINGS_KEY);
    return json ? sanitizeSettings(JSON.parse(json)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, s: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked (private window): settings simply don't persist.
  }
}
