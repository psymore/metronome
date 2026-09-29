import { clampBpm } from '../engine/timing';

export type BeatLevel = 'accent' | 'normal' | 'mute';
export type VisualizerKind = 'circular' | 'linear';
export const SUBDIVISIONS = [1, 2, 3, 4] as const;
export type Subdivision = (typeof SUBDIVISIONS)[number];
export const BEAT_UNITS = [2, 4, 8, 16] as const;
export type BeatUnit = (typeof BEAT_UNITS)[number];
export const THEMES = ['teal', 'amber', 'blue', 'chrome'] as const;
export type ThemeName = (typeof THEMES)[number];
export const NODE_STYLES = ['classic', 'metallic', 'wireframe', 'frosted'] as const;
export type NodeStyleName = (typeof NODE_STYLES)[number];
export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MIN_BEATS = 1;
export const MAX_BEATS = 16;
export const MIN_POLY = 2;
export const MAX_POLY = 16;
export const SYNC_OFFSET_LIMIT_MS = 200;
export const MAX_TARGET_BARS = 999;
export const MAX_PRACTICE_SECONDS = 180 * 60;
export const SETTINGS_KEY = 'metronome.settings.v1';
/** Loop count choices for the bar counter: 0 means infinite. */
export const LOOP_COUNTS = [1, 2, 4, 8, 0] as const;
export type LoopCount = (typeof LOOP_COUNTS)[number];

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
  nodeStyle: NodeStyleName;
  /** Whether tapping a beat node directly on the circular/linear visualizer cycles its level. */
  beatsClickable: boolean;
  /** Whether to vibrate briefly on each beat, on devices that support it. */
  haptics: boolean;
  /** Song length in bars, set up before playing; 0 means no target (just count up). */
  targetBars: number;
  /** Times to repeat the targetBars-bar loop; 1 = play once (default), 0 = infinite. Ignored when targetBars is 0. */
  loopCount: number;
  /** Seconds to play before auto-stopping; 0 means no limit. */
  practiceSeconds: number;
  /** Clicks per beat: 1 = off, 2/3/4 = 8th/triplet/16th subdivision clicks. */
  subdivision: Subdivision;
  language: Language;
  /** Tilted, cylindrical 3D shape for the BPM knob instead of a flat disc. */
  depth25d: boolean;
  /** Two-layer polyrhythm mode; replaces the standard beat while enabled. */
  polyrhythm: {
    enabled: boolean;
    a: number;
    b: number;
    soundIdA: string;
    soundIdB: string;
    /** Per-node level for layer A (length matches `a`). */
    levelsA: BeatLevel[];
    /** Per-node level for layer B (length matches `b`). */
    levelsB: BeatLevel[];
  };
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
  nodeStyle: 'classic',
  beatsClickable: true,
  haptics: false,
  targetBars: 0,
  loopCount: 1,
  practiceSeconds: 0,
  subdivision: 1,
  language: 'en',
  depth25d: false,
  polyrhythm: {
    enabled: false,
    a: 3,
    b: 4,
    soundIdA: 'builtin:click-high',
    soundIdB: 'builtin:click',
    levelsA: defaultPolyLevels(3),
    levelsB: defaultPolyLevels(4),
  },
};

/** First node accents, the rest are normal — matches the standard beat row's initial pattern. */
export function defaultPolyLevels(n: number): BeatLevel[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 'accent' : 'normal'));
}

/** Grows or shrinks a per-node level array to length `n`, filling new slots with defaults. */
export function resizePolyLevels(levels: readonly BeatLevel[], n: number): BeatLevel[] {
  return Array.from({ length: n }, (_, i) => levels[i] ?? (i === 0 ? 'accent' : 'normal'));
}

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

export function isNodeStyleName(v: unknown): v is NodeStyleName {
  return (NODE_STYLES as readonly unknown[]).includes(v);
}

export function isSubdivision(v: unknown): v is Subdivision {
  return (SUBDIVISIONS as readonly unknown[]).includes(v);
}

export function isLanguage(v: unknown): v is Language {
  return (LANGUAGES as readonly unknown[]).includes(v);
}

export function isLoopCount(v: unknown): v is LoopCount {
  return (LOOP_COUNTS as readonly unknown[]).includes(v);
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
  if (level === 'mute') return 'normal';
  if (level === 'normal') return 'accent';
  return 'mute';
}

/** Cycles a single beat's level, leaving the array untouched if the index is out of range. */
export function cycleBeatLevel(levels: readonly BeatLevel[], index: number): BeatLevel[] {
  const current = levels[index];
  if (current === undefined) return [...levels];
  const next = [...levels];
  next[index] = nextLevel(current);
  return next;
}

export function withBeatsPerBar(s: Settings, n: number): Pick<Settings, 'beatsPerBar' | 'levels'> {
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(MIN_BEATS, Math.round(n)));
  return { beatsPerBar, levels: resizeLevels(s.levels, beatsPerBar) };
}

/** Clamps a song-length-in-bars value; 0 means no target. */
export function clampTargetBars(n: number): number {
  return Math.min(MAX_TARGET_BARS, Math.max(0, Math.round(n)));
}

/** Clamps a practice-timer length in seconds; 0 means off. */
export function clampPracticeSeconds(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_PRACTICE_SECONDS, Math.max(0, Math.round(n)));
}

export function clampPolyCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_POLY;
  return Math.min(MAX_POLY, Math.max(MIN_POLY, Math.round(n)));
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
  const rp =
    typeof r.polyrhythm === 'object' && r.polyrhythm !== null
      ? (r.polyrhythm as Record<string, unknown>)
      : {};
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
    nodeStyle: isNodeStyleName(r.nodeStyle) ? r.nodeStyle : d.nodeStyle,
    beatsClickable: typeof r.beatsClickable === 'boolean' ? r.beatsClickable : d.beatsClickable,
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
    targetBars: isIntInRange(r.targetBars, 0, MAX_TARGET_BARS) ? r.targetBars : d.targetBars,
    loopCount: isLoopCount(r.loopCount) ? r.loopCount : d.loopCount,
    practiceSeconds: isIntInRange(r.practiceSeconds, 0, MAX_PRACTICE_SECONDS)
      ? r.practiceSeconds
      : isIntInRange(r.practiceMinutes, 0, MAX_PRACTICE_SECONDS / 60)
        ? r.practiceMinutes * 60
        : d.practiceSeconds,
    subdivision: isSubdivision(r.subdivision) ? r.subdivision : d.subdivision,
    language: isLanguage(r.language) ? r.language : d.language,
    depth25d: typeof r.depth25d === 'boolean' ? r.depth25d : d.depth25d,
    polyrhythm: (() => {
      const enabled = typeof rp.enabled === 'boolean' ? rp.enabled : d.polyrhythm.enabled;
      const a = typeof rp.a === 'number' ? clampPolyCount(rp.a) : d.polyrhythm.a;
      const b = typeof rp.b === 'number' ? clampPolyCount(rp.b) : d.polyrhythm.b;
      const rawA = Array.isArray(rp.levelsA)
        ? rp.levelsA.map((l): BeatLevel => (isBeatLevel(l) ? l : 'normal'))
        : [];
      const rawB = Array.isArray(rp.levelsB)
        ? rp.levelsB.map((l): BeatLevel => (isBeatLevel(l) ? l : 'normal'))
        : [];
      return {
        enabled,
        a,
        b,
        soundIdA: isSoundId(rp.soundIdA) ? rp.soundIdA : d.polyrhythm.soundIdA,
        soundIdB: isSoundId(rp.soundIdB) ? rp.soundIdB : d.polyrhythm.soundIdB,
        levelsA: resizePolyLevels(rawA, a),
        levelsB: resizePolyLevels(rawB, b),
      };
    })(),
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
