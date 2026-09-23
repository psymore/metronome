# Metronome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sample-accurate browser metronome with custom click sounds and two audio-synced visualisers (circular and linear). It ships as a web app, an offline PWA on GitHub Pages, and a Windows desktop app via Tauri 2.

**Architecture:** A pure, unit-tested scheduler places every click on the Web Audio clock with `AudioBufferSourceNode.start(t)`. It looks 100 ms ahead and is woken by a Web Worker timer every 25 ms. Scheduled beats go into a timeline. Each animation frame draws the canvas visualiser as a pure function of the *heard* audio time, taken from `getOutputTimestamp()` minus a user sync offset. The UI is plain TypeScript DOM code with no framework. Settings live in `localStorage` and uploaded sounds in IndexedDB.

**Tech Stack:** TypeScript, Vite, Vitest, Biome, `idb-keyval`, `fake-indexeddb` (tests), `vite-plugin-pwa`, `@vite-pwa/assets-generator`, Tauri 2 (Rust toolchain already installed: cargo 1.98), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-23-metronome-design.md`. Read it fully before Task 1. Open `docs/superpowers/specs/reference-ui.jpg` too, because the circular visualiser and control panel are modelled on it.

## Global Constraints

- Node 22+, npm. All code is TypeScript `strict`, ES modules (`"type": "module"`).
- No UI framework. Runtime dependencies: **only** `idb-keyval` (plus the `virtual:pwa-register` module from `vite-plugin-pwa`).
- The repo already exists: branch `master`, remote `origin` = `https://github.com/psymore/metronome.git`, no commits yet. Commit directly on `master`. **Never push without asking the user first.**
- Shell snippets use bash syntax (Git Bash on Windows). In PowerShell, adapt `&&` chains.
- BPM: integer 20–400, default 120. Beats per bar: 1–16. Beat unit: 2 | 4 | 8 | 16 (label only). Sync offset: integer −200…+200 ms. Volume: 0–1, default 0.8.
- Scheduler constants: LOOKAHEAD = 0.1 s, worker TICK = 25 ms, START_DELAY = 0.05 s. Glow decay = min(0.35 s, 0.9 × beat duration). Dial = 4° per BPM. Tap tempo = last ≤ 6 taps, resets after 3.1 s.
- Sound uploads: MIME `audio/*` or extension in `.wav .mp3 .ogg .oga .flac .m4a .aac .webm .opus`. Size 1 B–2 MB. Decoded duration > 0 and ≤ 2 s. Leading-silence threshold 0.003 with 1 ms pre-roll.
- Storage keys: `localStorage['metronome.settings.v1']`; IndexedDB db `metronome`, store `sounds`. Sound ids: `builtin:click-high`, `builtin:click`, `builtin:wood`, `builtin:beep`, `user:<uuid>`.
- Colours: background `#141416`, pink accent `#ff2f7d`, ring `#b9b9c0`. Dark theme only.
- Tauri: identifier `com.psymore.metronome`, window 460×860 (min 360×640), bundle target `nsis`, `dragDropEnabled: false`.
- GitHub Pages build: Vite `base` = `/metronome/` when env `GITHUB_PAGES=true`, else `/`.
- Rule: `setTimeout`/`setInterval`/`requestAnimationFrame` never decide *when* a click sounds. Only `ctx.currentTime` plus scheduling does.
- Tests are in `tests/`, mirror `src/`, and run in the Vitest **node** environment. Never touch the DOM or Web Audio in tests.

## Review Focus

- **Time-signature change mid-bar** (e.g. 7/8 → 3/4 while on beat 6): the next beat must be beat 1 of a new bar, with no index ≥ beatsPerBar and no double downbeat. *Test: Task 3, "shrinking the signature mid-bar restarts at a downbeat".*
- **Tab suspended / laptop asleep, then resumed**: no burst of catch-up clicks, and the grid and bar position are preserved. *Test: Task 3, "skips missed beats after a stall instead of bursting".*
- **`decodeAudioData` detaches its ArrayBuffer**: the saved bytes must still be intact after decoding. *Test: Task 7, "saves intact bytes even though decoding detaches its input".*
- **The selected user sound is gone or unreadable** (deleted, IndexedDB blocked in a private window, corrupt data): fall back to the built-in sound with an explanation, never go silent or crash. *Tests: Task 7, "falls back when a user sound is missing" and "falls back when decoding fails".*
- **Corrupt or hand-edited `localStorage`, or storage that throws**: the app loads with sanitised or default values and never crashes. *Tests: Task 2, "sanitises every field independently", "returns defaults for corrupt JSON" and "swallows storage write errors".*

---

## File Structure

```
metronome/
  index.html                     # full app markup (Task 8)
  package.json  tsconfig.json  vite.config.ts  biome.json  .gitignore  .gitattributes
  pwa-assets.config.ts           # Task 14
  public/icon.svg (+ generated PWA icons)   # Task 14
  src/
    main.ts                      # composition root: builds store, engine, library, viz and mounts UI
    styles.css                   # all styling (Task 8)
    engine/
      timing.ts                  # BPM clamp and seconds-per-beat (pure)
      scheduler.ts               # look-ahead scheduler, BeatEvent (pure)
      beatTimeline.ts            # ring buffer of scheduled beats, beatPhase (pure)
      clock.ts                   # computeHeardTime (pure)
      timerWorker.ts             # 25 ms tick worker
      audioEngine.ts             # AudioContext, voices, worker glue (browser only)
    state/
      settings.ts                # Settings type, defaults, sanitise/load/save (pure)
      store.ts                   # tiny observable store (pure)
      tapTempo.ts                # tap tempo (pure)
    sounds/
      pcm.ts                     # PcmData type
      synth.ts                   # built-in click synthesis (pure)
      trim.ts                    # leading-silence trimming (pure)
      validate.ts                # upload validation (pure)
      importSound.ts             # validate → decode → check → save (pure with injected deps)
      soundStore.ts              # IndexedDB persistence
      soundLibrary.ts            # id → PcmData with cache and fallback (pure with injected deps)
    viz/
      types.ts                   # Visualizer, VizTheme
      geometry.ts                # angles, positions, layouts, glow curve (pure)
      frame.ts                   # computeFrame (pure)
      drawNode.ts                # shared sphere drawing
      circular.ts  linear.ts     # the two renderers
      vizController.ts           # rAF loop, resize/DPR, theme
    ui/
      dom.ts  toast.ts  transport.ts  debugOverlay.ts  vizSwitch.ts
      dialMath.ts                # dial angle math (pure)
      controls.ts                # dial, nudges, tap, beat row, keyboard
      signatureDialog.ts  settingsDialog.ts  soundDialog.ts
  tests/  (mirrors src/ for the pure modules)
  src-tauri/                     # Task 15 (generated by tauri init, then configured)
  .github/workflows/ci.yml  pages.yml   # Task 16
  docs/architecture/*.md  README.md     # Task 17
```

---

### Task 1: Project scaffold and timing math

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `.gitignore`, `.gitattributes`, `index.html`, `src/main.ts`, `src/engine/timing.ts`
- Test: `tests/engine/timing.test.ts`

**Interfaces:**
- Produces: `MIN_BPM = 20`, `MAX_BPM = 400`, `clampBpm(bpm: number): number` (rounds; non-finite → 120), `secondsPerBeat(bpm: number): number`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "metronome",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome check --write .",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i -D vite typescript vitest @biomejs/biome fake-indexeddb
npm i idb-keyval
```
Expected: installs cleanly. These are the latest majors, and the code here only uses long-stable APIs of each.

- [ ] **Step 3: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/metronome/' : '/',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "includes": ["**", "!**/dist", "!**/dev-dist", "!**/node_modules", "!**/src-tauri/target", "!**/src-tauri/gen"]
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```
If `npx biome check .` warns that the schema version differs from the installed Biome, run `npx biome migrate --write` and keep the result.

`.gitignore`:
```
node_modules/
dist/
dev-dist/
*.local
.DS_Store
src-tauri/target/
src-tauri/gen/schemas/
```

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.icns binary
```

`index.html` (temporary; replaced in Task 8):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Metronome</title>
    <script type="module" src="/src/main.ts"></script>
  </head>
  <body>
    <p>Metronome is under construction.</p>
  </body>
</html>
```

`src/main.ts` (temporary; replaced in Task 8):
```ts
export {};
```

- [ ] **Step 4: Write the failing test** — `tests/engine/timing.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { clampBpm, MAX_BPM, MIN_BPM, secondsPerBeat } from '../../src/engine/timing';

describe('clampBpm', () => {
  it('rounds and keeps values inside 20–400', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(5)).toBe(MIN_BPM);
    expect(clampBpm(999)).toBe(MAX_BPM);
  });

  it('falls back to 120 for non-finite input', () => {
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(Number.POSITIVE_INFINITY)).toBe(120);
  });
});

describe('secondsPerBeat', () => {
  it('converts beats per minute to seconds', () => {
    expect(secondsPerBeat(120)).toBe(0.5);
    expect(secondsPerBeat(60)).toBe(1);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run tests/engine/timing.test.ts`
Expected: FAIL, cannot resolve `../../src/engine/timing`.

- [ ] **Step 6: Implement** — `src/engine/timing.ts`

```ts
export const MIN_BPM = 20;
export const MAX_BPM = 400;
const FALLBACK_BPM = 120;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return FALLBACK_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function secondsPerBeat(bpm: number): number {
  return 60 / clampBpm(bpm);
}
```

- [ ] **Step 7: Verify tests, lint and build**

Run: `npm test && npx biome check --write . && npm run lint && npm run build`
Expected: 3 tests pass, lint is clean, and `dist/` is produced.

- [ ] **Step 8: Commit** (this first commit also includes the spec, plan, reference image, `CLAUDE.md` and `docs/superpowers/FOLLOWUP.md` that already exist)

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript project with spec, plan and timing math"
```

---

### Task 2: Settings model and observable store

**Files:**
- Create: `src/state/settings.ts`, `src/state/store.ts`
- Test: `tests/state/settings.test.ts`, `tests/state/store.test.ts`

**Interfaces:**
- Consumes: `clampBpm` (Task 1).
- Produces:
  - `type BeatLevel = 'accent' | 'normal' | 'mute'`, `type VisualizerKind = 'circular' | 'linear'`, `BEAT_UNITS = [2, 4, 8, 16] as const`, `type BeatUnit`
  - `MIN_BEATS = 1`, `MAX_BEATS = 16`, `SYNC_OFFSET_LIMIT_MS = 200`, `SETTINGS_KEY = 'metronome.settings.v1'`
  - `interface Settings { bpm; beatsPerBar; beatUnit: BeatUnit; levels: BeatLevel[]; visualizer: VisualizerKind; syncOffsetMs; volume; accentSoundId: string; normalSoundId: string }`
  - `DEFAULT_SETTINGS: Settings` and `defaultSettings(): Settings` (a fresh copy)
  - `isBeatLevel(v): v is BeatLevel`, `isBeatUnit(v): v is BeatUnit`
  - `resizeLevels(levels: readonly BeatLevel[], n: number): BeatLevel[]`, `nextLevel(l: BeatLevel): BeatLevel`
  - `withBeatsPerBar(s: Settings, n: number): Pick<Settings, 'beatsPerBar' | 'levels'>`
  - `sanitizeSettings(raw: unknown): Settings`
  - `loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings`
  - `saveSettings(storage: Pick<Storage, 'setItem'> | undefined, s: Settings): void`
  - `interface Store<T> { get(): T; set(patch: Partial<T>): void; subscribe(fn: (state: T, prev: T) => void): () => void }` and `createStore<T extends object>(initial: T): Store<T>`

- [ ] **Step 1: Write the failing tests**

`tests/state/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  defaultSettings,
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
    });
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
    const s = { ...defaultSettings(), bpm: 77, syncOffsetMs: -35, volume: 0.3, accentSoundId: 'user:abc' };
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
```

`tests/state/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/state/store';

describe('createStore', () => {
  it('merges patches and notifies with the previous state', () => {
    const store = createStore({ a: 1, b: 2 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ b: 3 });
    expect(store.get()).toEqual({ a: 1, b: 3 });
    expect(listener).toHaveBeenCalledWith({ a: 1, b: 3 }, { a: 1, b: 2 });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/state`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** — `src/state/settings.ts`

```ts
import { clampBpm } from '../engine/timing';

export type BeatLevel = 'accent' | 'normal' | 'mute';
export type VisualizerKind = 'circular' | 'linear';
export const BEAT_UNITS = [2, 4, 8, 16] as const;
export type BeatUnit = (typeof BEAT_UNITS)[number];

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

function defaultLevel(index: number): BeatLevel {
  return index === 0 ? 'accent' : 'normal';
}

export function resizeLevels(levels: readonly BeatLevel[], n: number): BeatLevel[] {
  return Array.from({ length: n }, (_, i) => levels[i] ?? defaultLevel(i));
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
  const beatsPerBar = isIntInRange(r.beatsPerBar, MIN_BEATS, MAX_BEATS) ? r.beatsPerBar : d.beatsPerBar;
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
```

`src/state/store.ts`:
```ts
export type Listener<T> = (state: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(fn: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/state`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/state tests/state
git commit -m "feat: settings model with sanitising persistence and observable store"
```

---

### Task 3: Look-ahead scheduler

**Files:**
- Create: `src/engine/scheduler.ts`
- Test: `tests/engine/scheduler.test.ts`

**Interfaces:**
- Consumes: `secondsPerBeat` (Task 1), `BeatLevel` (Task 2).
- Produces:
  - `interface BeatEvent { time: number; duration: number; beatInBar: number; beatsPerBar: number; barIndex: number; level: BeatLevel }`
  - `interface Pattern { bpm: number; beatsPerBar: number; levels: readonly BeatLevel[] }` (`Settings` satisfies it structurally)
  - `interface SchedulerStats { scheduled: number; minLead: number; skipped: number }`
  - `class Scheduler { constructor(opts: { getPattern: () => Pattern; onBeat: (b: BeatEvent) => void; lookahead?: number; startDelay?: number }); readonly isRunning: boolean; stats: SchedulerStats; start(now: number): void; stop(): void; tick(now: number): void }`

- [ ] **Step 1: Write the failing test** — `tests/engine/scheduler.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { type BeatEvent, type Pattern, Scheduler } from '../../src/engine/scheduler';

function setup(pattern: Partial<Pattern> = {}, lookahead = 1) {
  const p: Pattern = {
    bpm: 120,
    beatsPerBar: 4,
    levels: ['accent', 'normal', 'normal', 'normal'],
    ...pattern,
  };
  const beats: BeatEvent[] = [];
  const s = new Scheduler({
    getPattern: () => p,
    onBeat: (b) => beats.push(b),
    lookahead,
    startDelay: 0.05,
  });
  return { s, beats, p };
}

describe('Scheduler', () => {
  it('schedules the first beat startDelay after start, as the accented downbeat', () => {
    const { s, beats } = setup();
    s.start(0);
    expect(beats[0]).toEqual({
      time: 0.05,
      duration: 0.5,
      beatInBar: 0,
      beatsPerBar: 4,
      barIndex: 0,
      level: 'accent',
    });
    expect(s.isRunning).toBe(true);
  });

  it('only schedules beats inside the look-ahead window', () => {
    const { s, beats } = setup();
    s.start(0); // window [0, 1): 0.05 and 0.55
    expect(beats).toHaveLength(2);
    expect(beats[1]?.time).toBeCloseTo(0.55, 9);
    s.tick(0.04); // window ends at 1.04; next beat is 1.05
    expect(beats).toHaveLength(2);
    s.tick(0.1);
    expect(beats).toHaveLength(3);
    expect(beats[2]?.time).toBeCloseTo(1.05, 9);
  });

  it('never drifts: beat k is exactly startDelay + k × period after 10 minutes', () => {
    const { s, beats } = setup({}, 0.1);
    s.start(0);
    for (let i = 1; i <= 24000; i++) s.tick(i * 0.025);
    expect(beats.length).toBe(1201);
    beats.forEach((b, k) => {
      expect(b.time).toBeCloseTo(0.05 + k * 0.5, 9);
      expect(b.beatInBar).toBe(k % 4);
    });
  });

  it('wraps bars and applies per-beat levels', () => {
    const { s, beats } = setup({ beatsPerBar: 3, levels: ['accent', 'mute', 'normal'] });
    s.start(0);
    s.tick(1.5);
    expect(beats.slice(0, 4).map((b) => [b.beatInBar, b.barIndex, b.level])).toEqual([
      [0, 0, 'accent'],
      [1, 0, 'mute'],
      [2, 0, 'normal'],
      [0, 1, 'accent'],
    ]);
  });

  it('defaults missing levels to an accented downbeat and normal beats', () => {
    const { s, beats } = setup({ levels: [] });
    s.start(0);
    expect(beats.map((b) => b.level)).toEqual(['accent', 'normal']);
  });

  it('applies a tempo change from the next unscheduled beat', () => {
    const { s, beats, p } = setup();
    s.start(0); // 0.05, 0.55 scheduled at 120 BPM
    p.bpm = 60;
    s.tick(0.6); // window ends 1.6: the beat at 1.05 now has duration 1
    expect(beats[2]?.time).toBeCloseTo(1.05, 9);
    expect(beats[2]?.duration).toBe(1);
    s.tick(1.5);
    expect(beats[3]?.time).toBeCloseTo(2.05, 9);
  });

  it('shrinking the signature mid-bar restarts at a downbeat', () => {
    const { s, beats, p } = setup({ beatsPerBar: 7, levels: Array(7).fill('normal') });
    s.start(0);
    s.tick(2); // up to 2.55 → beatInBar 0..5
    expect(beats.at(-1)?.beatInBar).toBe(5);
    p.beatsPerBar = 3;
    p.levels = ['accent', 'normal', 'normal'];
    s.tick(2.1); // schedules 3.05
    expect(beats.at(-1)).toMatchObject({ beatInBar: 0, barIndex: 1, beatsPerBar: 3, level: 'accent' });
    for (const b of beats) expect(b.beatInBar).toBeLessThan(b.beatsPerBar);
  });

  it('skips missed beats after a stall instead of bursting', () => {
    const { s, beats } = setup({}, 0.1);
    s.start(0); // only 0.05 fits in [0, 0.1)
    expect(beats).toHaveLength(1);
    s.tick(10); // tab was frozen for ~10 s
    expect(beats).toHaveLength(2);
    expect(beats[1]?.time).toBeCloseTo(10.05, 9);
    expect(beats[1]).toMatchObject({ beatInBar: 0, barIndex: 5 }); // beat #20 of the grid
    expect(s.stats.skipped).toBe(19);
  });

  it('stops scheduling after stop()', () => {
    const { s, beats } = setup();
    s.start(0);
    s.stop();
    s.tick(5);
    expect(beats).toHaveLength(2);
    expect(s.isRunning).toBe(false);
  });

  it('tracks the minimum lead time between scheduling and playback', () => {
    const { s } = setup({}, 0.1);
    s.start(0);
    expect(s.stats.minLead).toBeCloseTo(0.05, 9);
    s.tick(1.04); // beat at 0.55 is skipped as late; 1.05 has 10 ms lead
    expect(s.stats.minLead).toBeCloseTo(0.01, 9);
    expect(s.stats.scheduled).toBe(2);
  });

  it('resets stats and position on restart', () => {
    const { s, beats } = setup();
    s.start(0); // beats[0], beats[1]
    s.stop();
    s.start(100); // beats[2] is the new first beat
    expect(beats[2]).toMatchObject({ beatInBar: 0, barIndex: 0, level: 'accent' });
    expect(beats[2]?.time).toBeCloseTo(100.05, 9);
    expect(s.stats.skipped).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/engine/scheduler.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — `src/engine/scheduler.ts`

```ts
import type { BeatLevel } from '../state/settings';
import { secondsPerBeat } from './timing';

export interface BeatEvent {
  /** AudioContext time at which the click starts. */
  time: number;
  /** Seconds until the following beat, at the tempo in force when this beat was scheduled. */
  duration: number;
  /** 0-based position in the bar. */
  beatInBar: number;
  beatsPerBar: number;
  /** 0-based count of bars since start. */
  barIndex: number;
  level: BeatLevel;
}

export interface Pattern {
  bpm: number;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
}

export interface SchedulerOptions {
  getPattern: () => Pattern;
  onBeat: (beat: BeatEvent) => void;
  /** How far ahead of `now` to schedule, in seconds. */
  lookahead?: number;
  /** Gap between start() and the first beat, in seconds. */
  startDelay?: number;
}

export interface SchedulerStats {
  scheduled: number;
  /** Smallest (beat.time − now) seen when scheduling; > 0 means no click was ever late. */
  minLead: number;
  skipped: number;
}

const freshStats = (): SchedulerStats => ({
  scheduled: 0,
  minLead: Number.POSITIVE_INFINITY,
  skipped: 0,
});

/**
 * Places beats on the audio clock. Pure: it never reads a clock itself, callers pass `now`
 * (AudioContext.currentTime). Beat times are accumulated, never re-measured, so they never drift.
 */
export class Scheduler {
  private readonly lookahead: number;
  private readonly startDelay: number;
  private nextTime = 0;
  private beatInBar = 0;
  private barIndex = 0;
  private running = false;
  stats: SchedulerStats = freshStats();

  constructor(private readonly opts: SchedulerOptions) {
    this.lookahead = opts.lookahead ?? 0.1;
    this.startDelay = opts.startDelay ?? 0.05;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(now: number): void {
    this.running = true;
    this.nextTime = now + this.startDelay;
    this.beatInBar = 0;
    this.barIndex = 0;
    this.stats = freshStats();
    this.tick(now);
  }

  stop(): void {
    this.running = false;
  }

  tick(now: number): void {
    if (!this.running) return;
    if (this.nextTime < now) this.skipMissed(now);
    while (this.nextTime < now + this.lookahead) {
      const pattern = this.opts.getPattern();
      const beatsPerBar = Math.max(1, pattern.beatsPerBar);
      if (this.beatInBar >= beatsPerBar) {
        // The signature shrank mid-bar: start a new bar instead of overflowing.
        this.beatInBar = 0;
        this.barIndex++;
      }
      const duration = secondsPerBeat(pattern.bpm);
      const beat: BeatEvent = {
        time: this.nextTime,
        duration,
        beatInBar: this.beatInBar,
        beatsPerBar,
        barIndex: this.barIndex,
        level: pattern.levels[this.beatInBar] ?? (this.beatInBar === 0 ? 'accent' : 'normal'),
      };
      this.stats.scheduled++;
      this.stats.minLead = Math.min(this.stats.minLead, beat.time - now);
      this.opts.onBeat(beat);
      this.nextTime += duration;
      this.beatInBar++;
      if (this.beatInBar >= beatsPerBar) {
        this.beatInBar = 0;
        this.barIndex++;
      }
    }
  }

  /** After a stall, jump forward on the same grid instead of playing a burst of late clicks. */
  private skipMissed(now: number): void {
    const { bpm, beatsPerBar } = this.opts.getPattern();
    const duration = secondsPerBeat(bpm);
    const missed = Math.ceil((now - this.nextTime) / duration);
    this.nextTime += missed * duration;
    this.stats.skipped += missed;
    const n = Math.max(1, beatsPerBar);
    const total = this.beatInBar + missed;
    this.barIndex += Math.floor(total / n);
    this.beatInBar = total % n;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/scheduler.test.ts`
Expected: all pass. If "tracks the minimum lead time" fails, check the arithmetic, not the test: after `start(0)` the next beat is 0.55; `tick(1.04)` finds 0.55 < 1.04 and skips `ceil(0.49 / 0.5) = 1` beat to 1.05, which is scheduled with a lead of 0.01.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scheduler.ts tests/engine/scheduler.test.ts
git commit -m "feat: drift-free look-ahead scheduler with stall skipping"
```

---

### Task 4: Beat timeline and heard-time clock

**Files:**
- Create: `src/engine/beatTimeline.ts`, `src/engine/clock.ts`
- Test: `tests/engine/beatTimeline.test.ts`, `tests/engine/clock.test.ts`

**Interfaces:**
- Consumes: `BeatEvent` (Task 3).
- Produces:
  - `class BeatTimeline { constructor(capacity = 64); push(b: BeatEvent): void; clear(): void; beatAt(time: number): BeatEvent | null; readonly size: number }`
  - `beatPhase(beat: BeatEvent, time: number): number` (clamped to 0..1)
  - `interface OutputTimestamp { contextTime?: number; performanceTime?: number }`
  - `computeHeardTime(args: { timestamp: OutputTimestamp | null; perfNow: number; currentTime: number; outputLatency: number; syncOffsetMs: number }): number`

- [ ] **Step 1: Write the failing tests**

`tests/engine/beatTimeline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BeatTimeline, beatPhase } from '../../src/engine/beatTimeline';
import type { BeatEvent } from '../../src/engine/scheduler';

const beat = (time: number, duration = 0.5): BeatEvent => ({
  time,
  duration,
  beatInBar: 0,
  beatsPerBar: 4,
  barIndex: 0,
  level: 'normal',
});

describe('BeatTimeline', () => {
  it('returns the most recent beat at or before the given time', () => {
    const t = new BeatTimeline();
    for (const time of [1, 1.5, 2]) t.push(beat(time));
    expect(t.beatAt(1.7)?.time).toBe(1.5);
    expect(t.beatAt(2)?.time).toBe(2);
    expect(t.beatAt(0.9)).toBeNull();
  });

  it('ignores beats scheduled in the future', () => {
    const t = new BeatTimeline();
    t.push(beat(1));
    t.push(beat(1.5));
    expect(t.beatAt(1.2)?.time).toBe(1);
  });

  it('keeps only the newest `capacity` beats', () => {
    const t = new BeatTimeline(3);
    for (const time of [0, 1, 2, 3, 4]) t.push(beat(time));
    expect(t.size).toBe(3);
    expect(t.beatAt(1.5)).toBeNull();
    expect(t.beatAt(2.5)?.time).toBe(2);
  });

  it('clears', () => {
    const t = new BeatTimeline();
    t.push(beat(1));
    t.clear();
    expect(t.beatAt(5)).toBeNull();
  });
});

describe('beatPhase', () => {
  it('goes from 0 at the beat to 1 at the next one, clamped', () => {
    expect(beatPhase(beat(10), 10)).toBe(0);
    expect(beatPhase(beat(10), 10.25)).toBe(0.5);
    expect(beatPhase(beat(10), 11)).toBe(1);
    expect(beatPhase(beat(10), 9)).toBe(0);
  });

  it('returns 0 for a zero-length beat', () => {
    expect(beatPhase(beat(10, 0), 10.5)).toBe(0);
  });
});
```

`tests/engine/clock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeHeardTime } from '../../src/engine/clock';

const base = { perfNow: 5100, currentTime: 10.2, outputLatency: 0.05, syncOffsetMs: 0 };

describe('computeHeardTime', () => {
  it('extrapolates the output timestamp to now', () => {
    const t = computeHeardTime({ ...base, timestamp: { contextTime: 10, performanceTime: 5000 } });
    expect(t).toBeCloseTo(10.1, 9);
  });

  it('never runs ahead of currentTime', () => {
    const t = computeHeardTime({
      ...base,
      perfNow: 6000,
      timestamp: { contextTime: 10, performanceTime: 5000 },
    });
    expect(t).toBeCloseTo(10.2, 9);
  });

  it('falls back to currentTime − outputLatency without a timestamp', () => {
    expect(computeHeardTime({ ...base, timestamp: null })).toBeCloseTo(10.15, 9);
  });

  it('treats a zero performanceTime (not yet rendering) as missing', () => {
    const t = computeHeardTime({ ...base, timestamp: { contextTime: 0, performanceTime: 0 } });
    expect(t).toBeCloseTo(10.15, 9);
  });

  it('subtracts the sync offset so positive values delay the visuals', () => {
    const t = computeHeardTime({
      ...base,
      syncOffsetMs: 20,
      timestamp: { contextTime: 10, performanceTime: 5000 },
    });
    expect(t).toBeCloseTo(10.08, 9);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/engine/beatTimeline.test.ts tests/engine/clock.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/engine/beatTimeline.ts`:
```ts
import type { BeatEvent } from './scheduler';

/** Recently scheduled beats, oldest first, so visuals can look up what is being heard. */
export class BeatTimeline {
  private beats: BeatEvent[] = [];

  constructor(private readonly capacity = 64) {}

  push(beat: BeatEvent): void {
    this.beats.push(beat);
    if (this.beats.length > this.capacity) {
      this.beats.splice(0, this.beats.length - this.capacity);
    }
  }

  clear(): void {
    this.beats = [];
  }

  /** The latest beat whose start time is <= time, or null. */
  beatAt(time: number): BeatEvent | null {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const beat = this.beats[i];
      if (beat && beat.time <= time) return beat;
    }
    return null;
  }

  get size(): number {
    return this.beats.length;
  }
}

export function beatPhase(beat: BeatEvent, time: number): number {
  if (beat.duration <= 0) return 0;
  return Math.min(1, Math.max(0, (time - beat.time) / beat.duration));
}
```

`src/engine/clock.ts`:
```ts
export interface OutputTimestamp {
  contextTime?: number;
  performanceTime?: number;
}

export interface HeardTimeArgs {
  /** ctx.getOutputTimestamp(), or null where unsupported. */
  timestamp: OutputTimestamp | null;
  /** performance.now() */
  perfNow: number;
  /** ctx.currentTime */
  currentTime: number;
  /** ctx.outputLatency || ctx.baseLatency || 0 */
  outputLatency: number;
  syncOffsetMs: number;
}

/** AudioContext time of the sample leaving the speakers right now, shifted by the user offset. */
export function computeHeardTime(args: HeardTimeArgs): number {
  const ts = args.timestamp;
  let t: number;
  if (
    ts &&
    typeof ts.contextTime === 'number' &&
    typeof ts.performanceTime === 'number' &&
    ts.performanceTime > 0
  ) {
    t = ts.contextTime + (args.perfNow - ts.performanceTime) / 1000;
  } else {
    t = args.currentTime - args.outputLatency;
  }
  return Math.min(t, args.currentTime) - args.syncOffsetMs / 1000;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine tests/engine
git commit -m "feat: beat timeline and heard-time clock for audio-synced visuals"
```

---

### Task 5: Built-in click synthesis, silence trimming and upload validation

**Files:**
- Create: `src/sounds/pcm.ts`, `src/sounds/synth.ts`, `src/sounds/trim.ts`, `src/sounds/validate.ts`
- Test: `tests/sounds/synth.test.ts`, `tests/sounds/trim.test.ts`, `tests/sounds/validate.test.ts`

**Interfaces:**
- Produces:
  - `interface PcmData { sampleRate: number; channels: Float32Array<ArrayBuffer>[] }`
  - `interface ClickSpec { frequency: number; durationMs: number; decayMs: number; noise?: number }`
  - `BUILTIN_SOUNDS: Record<string, { name: string; spec: ClickSpec }>`, with keys `builtin:click-high`, `builtin:click`, `builtin:wood`, `builtin:beep`
  - `renderClick(spec: ClickSpec, sampleRate: number, random?: () => number): Float32Array<ArrayBuffer>`
  - `leadingSilenceSamples(channels: readonly Float32Array[], sampleRate: number, threshold?: number): number`
  - `trimLeadingSilence(pcm: PcmData): PcmData`
  - `MAX_SOUND_BYTES`, `MAX_SOUND_SECONDS`, `type ValidationResult = { ok: true } | { ok: false; reason: string }`
  - `validateSoundFile(file: { name: string; size: number; type: string }): ValidationResult`
  - `validateDecodedDuration(seconds: number, name: string): ValidationResult`

- [ ] **Step 1: Write the failing tests**

`tests/sounds/synth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUILTIN_SOUNDS, renderClick } from '../../src/sounds/synth';

describe('renderClick', () => {
  it('renders the requested length', () => {
    expect(renderClick({ frequency: 1000, durationMs: 50, decayMs: 10 }, 48000).length).toBe(2400);
  });

  it('starts sounding within the first millisecond (no late onset)', () => {
    const pcm = renderClick(BUILTIN_SOUNDS['builtin:click'].spec, 48000);
    const onset = pcm.findIndex((v) => Math.abs(v) >= 0.1);
    expect(onset).toBeGreaterThanOrEqual(0);
    expect(onset).toBeLessThan(48);
  });

  it('never clips and ends in silence', () => {
    for (const { spec } of Object.values(BUILTIN_SOUNDS)) {
      const pcm = renderClick(spec, 44100, () => 0.99);
      expect(Math.max(...pcm.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(Math.abs(pcm[pcm.length - 1] ?? 1)).toBe(0);
    }
  });

  it('offers the four built-in sounds', () => {
    expect(Object.keys(BUILTIN_SOUNDS)).toEqual([
      'builtin:click-high',
      'builtin:click',
      'builtin:wood',
      'builtin:beep',
    ]);
  });
});
```

`tests/sounds/trim.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { leadingSilenceSamples, trimLeadingSilence } from '../../src/sounds/trim';

describe('leadingSilenceSamples', () => {
  it('finds the first loud sample minus 1 ms of pre-roll', () => {
    const c = new Float32Array(1000);
    c[200] = 0.5;
    expect(leadingSilenceSamples([c], 48000)).toBe(152);
  });

  it('checks every channel', () => {
    const left = new Float32Array(500);
    const right = new Float32Array(500);
    right[100] = -0.2;
    expect(leadingSilenceSamples([left, right], 48000)).toBe(52);
  });

  it('returns 0 for pure silence or an immediate onset', () => {
    expect(leadingSilenceSamples([new Float32Array(100)], 48000)).toBe(0);
    const c = new Float32Array(100);
    c[10] = 1;
    expect(leadingSilenceSamples([c], 48000)).toBe(0);
  });
});

describe('trimLeadingSilence', () => {
  it('drops the silent head of every channel', () => {
    const c = new Float32Array(300);
    c[100] = 1;
    const out = trimLeadingSilence({ sampleRate: 1000, channels: [c] });
    expect(out.channels[0]?.length).toBe(201);
    expect(out.channels[0]?.[1]).toBe(1);
  });

  it('returns the same object when there is nothing to trim', () => {
    const pcm = { sampleRate: 1000, channels: [Float32Array.from([1, 0.5])] };
    expect(trimLeadingSilence(pcm)).toBe(pcm);
  });
});
```

`tests/sounds/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_SOUND_BYTES, validateDecodedDuration, validateSoundFile } from '../../src/sounds/validate';

describe('validateSoundFile', () => {
  it('accepts audio by MIME type or by extension', () => {
    expect(validateSoundFile({ name: 'a.bin', size: 10, type: 'audio/wav' }).ok).toBe(true);
    expect(validateSoundFile({ name: 'Kick.FLAC', size: 10, type: '' }).ok).toBe(true);
  });

  it('rejects non-audio files', () => {
    const r = validateSoundFile({ name: 'notes.txt', size: 10, type: 'text/plain' });
    expect(r).toEqual({ ok: false, reason: '"notes.txt" is not an audio file.' });
  });

  it('rejects empty and oversized files', () => {
    expect(validateSoundFile({ name: 'a.wav', size: 0, type: 'audio/wav' }).ok).toBe(false);
    const big = validateSoundFile({ name: 'a.wav', size: MAX_SOUND_BYTES + 1, type: 'audio/wav' });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toMatch(/larger than 2 MB/);
  });
});

describe('validateDecodedDuration', () => {
  it('allows up to 2 seconds', () => {
    expect(validateDecodedDuration(2, 'a').ok).toBe(true);
    const r = validateDecodedDuration(2.54, 'long.wav');
    expect(r).toEqual({ ok: false, reason: '"long.wav" is 2.5 s long. Sounds must be 2 s or shorter.' });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/sounds`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/sounds/pcm.ts`:
```ts
/** Decoded audio independent of any AudioContext (so it can be unit-tested and cached). */
export interface PcmData {
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
}
```

`src/sounds/synth.ts`:
```ts
export interface ClickSpec {
  frequency: number;
  durationMs: number;
  decayMs: number;
  /** 0–1 share of white noise mixed in (woodblock-style attack). */
  noise?: number;
}

export const BUILTIN_SOUNDS: Record<string, { name: string; spec: ClickSpec }> = {
  'builtin:click-high': {
    name: 'Click (high)',
    spec: { frequency: 1760, durationMs: 60, decayMs: 12 },
  },
  'builtin:click': { name: 'Click', spec: { frequency: 1320, durationMs: 60, decayMs: 12 } },
  'builtin:wood': {
    name: 'Woodblock',
    spec: { frequency: 900, durationMs: 80, decayMs: 18, noise: 0.25 },
  },
  'builtin:beep': { name: 'Beep', spec: { frequency: 880, durationMs: 90, decayMs: 60 } },
};

/** Sine burst with a 0.5 ms fade-in (no pop, onset well under 1 ms) and a 2 ms fade-out. */
export function renderClick(
  spec: ClickSpec,
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round((spec.durationMs / 1000) * sampleRate));
  const out = new Float32Array(length);
  const fadeIn = Math.max(1, Math.round(sampleRate * 0.0005));
  const decay = (spec.decayMs / 1000) * sampleRate;
  const noise = spec.noise ?? 0;
  for (let i = 0; i < length; i++) {
    const envelope = Math.min(1, (i + 1) / fadeIn) * Math.exp(-i / decay);
    const tone = Math.sin((2 * Math.PI * spec.frequency * i) / sampleRate);
    const hiss = noise > 0 ? (random() * 2 - 1) * noise : 0;
    out[i] = (tone * (1 - noise) + hiss) * envelope * 0.9;
  }
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.002));
  for (let i = 0; i < fadeOut; i++) {
    const idx = length - 1 - i;
    out[idx] = (out[idx] ?? 0) * (i / fadeOut);
  }
  return out;
}
```

`src/sounds/trim.ts`:
```ts
import type { PcmData } from './pcm';

const PRE_ROLL_SECONDS = 0.001;

/** Samples of near-silence before the sound starts, keeping 1 ms of pre-roll. */
export function leadingSilenceSamples(
  channels: readonly Float32Array[],
  sampleRate: number,
  threshold = 0.003,
): number {
  let length = 0;
  for (const c of channels) length = Math.max(length, c.length);
  for (let i = 0; i < length; i++) {
    for (const c of channels) {
      if (i < c.length && Math.abs(c[i] ?? 0) >= threshold) {
        return Math.max(0, i - Math.round(sampleRate * PRE_ROLL_SECONDS));
      }
    }
  }
  return 0;
}

/** Remove leading silence so the click is heard exactly at its scheduled time. */
export function trimLeadingSilence(pcm: PcmData): PcmData {
  const start = leadingSilenceSamples(pcm.channels, pcm.sampleRate);
  if (start === 0) return pcm;
  return { sampleRate: pcm.sampleRate, channels: pcm.channels.map((c) => c.slice(start)) };
}
```

`src/sounds/validate.ts`:
```ts
export const MAX_SOUND_BYTES = 2 * 1024 * 1024;
export const MAX_SOUND_SECONDS = 2;
const EXTENSIONS = ['.wav', '.mp3', '.ogg', '.oga', '.flac', '.m4a', '.aac', '.webm', '.opus'];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateSoundFile(file: { name: string; size: number; type: string }): ValidationResult {
  const lower = file.name.toLowerCase();
  const isAudio = file.type.startsWith('audio/') || EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!isAudio) return { ok: false, reason: `"${file.name}" is not an audio file.` };
  if (file.size === 0) return { ok: false, reason: `"${file.name}" is empty.` };
  if (file.size > MAX_SOUND_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" is larger than 2 MB. Use a short click or hit sample.`,
    };
  }
  return { ok: true };
}

export function validateDecodedDuration(seconds: number, name: string): ValidationResult {
  if (seconds > MAX_SOUND_SECONDS) {
    return {
      ok: false,
      reason: `"${name}" is ${seconds.toFixed(1)} s long. Sounds must be ${MAX_SOUND_SECONDS} s or shorter.`,
    };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/sounds`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/sounds tests/sounds
git commit -m "feat: synthesised built-in clicks, silence trimming and upload validation"
```

---

### Task 6: IndexedDB sound store

**Files:**
- Create: `src/sounds/soundStore.ts`
- Test: `tests/sounds/soundStore.test.ts`

**Interfaces:**
- Produces:
  - `interface StoredSound { id: string; name: string; bytes: ArrayBuffer; addedAt: number }`
  - `interface SoundMeta { id: string; name: string; addedAt: number }`
  - `class SoundStore { constructor(db?: UseStore, now?: () => number); add(name: string, bytes: ArrayBuffer): Promise<StoredSound>; get(id: string): Promise<StoredSound | undefined>; list(): Promise<SoundMeta[]>; remove(id: string): Promise<void> }`. The default `db` is `createStore('metronome', 'sounds')`.

- [ ] **Step 1: Write the failing test** — `tests/sounds/soundStore.test.ts`

```ts
import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { SoundStore } from '../../src/sounds/soundStore';

let dbCounter = 0;
const freshStore = (now?: () => number) =>
  new SoundStore(createStore(`test-${dbCounter++}`, 'sounds'), now);

describe('SoundStore', () => {
  it('adds a sound and reads its bytes back', async () => {
    const store = freshStore();
    const added = await store.add('Kick', Uint8Array.from([1, 2, 3]).buffer);
    expect(added.id).toMatch(/^user:/);
    const got = await store.get(added.id);
    expect(got?.name).toBe('Kick');
    expect(Array.from(new Uint8Array(got?.bytes ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
  });

  it('lists metadata oldest first without the bytes', async () => {
    let clock = 2;
    const store = freshStore(() => clock--); // B gets 2, A gets 1
    await store.add('B', new ArrayBuffer(1));
    await store.add('A', new ArrayBuffer(1));
    const list = await store.list();
    expect(list.map((s) => s.name)).toEqual(['A', 'B']);
    expect(list[0]).not.toHaveProperty('bytes');
  });

  it('removes sounds', async () => {
    const store = freshStore();
    const added = await store.add('Kick', new ArrayBuffer(1));
    await store.remove(added.id);
    expect(await store.get(added.id)).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/sounds/soundStore.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — `src/sounds/soundStore.ts`

```ts
import { createStore, del, get, set, type UseStore, values } from 'idb-keyval';

export interface StoredSound {
  id: string;
  name: string;
  /** Original file bytes, decoded on demand. */
  bytes: ArrayBuffer;
  addedAt: number;
}

export interface SoundMeta {
  id: string;
  name: string;
  addedAt: number;
}

export class SoundStore {
  constructor(
    private readonly db: UseStore = createStore('metronome', 'sounds'),
    private readonly now: () => number = Date.now,
  ) {}

  async add(name: string, bytes: ArrayBuffer): Promise<StoredSound> {
    const sound: StoredSound = {
      id: `user:${crypto.randomUUID()}`,
      name,
      bytes,
      addedAt: this.now(),
    };
    await set(sound.id, sound, this.db);
    return sound;
  }

  get(id: string): Promise<StoredSound | undefined> {
    return get<StoredSound>(id, this.db);
  }

  async list(): Promise<SoundMeta[]> {
    const all = await values<StoredSound>(this.db);
    return all
      .map(({ id, name, addedAt }) => ({ id, name, addedAt }))
      .sort((a, b) => a.addedAt - b.addedAt);
  }

  remove(id: string): Promise<void> {
    return del(id, this.db);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/sounds/soundStore.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/sounds/soundStore.ts tests/sounds/soundStore.test.ts
git commit -m "feat: IndexedDB store for user sounds"
```

---

### Task 7: Sound import flow and sound library

**Files:**
- Create: `src/sounds/importSound.ts`, `src/sounds/soundLibrary.ts`
- Test: `tests/sounds/importSound.test.ts`, `tests/sounds/soundLibrary.test.ts`

**Interfaces:**
- Consumes: `PcmData`, `BUILTIN_SOUNDS`, `renderClick`, `trimLeadingSilence`, `validateSoundFile`, `validateDecodedDuration` (Task 5).
- Produces:
  - `interface ImportDeps { decode(bytes: ArrayBuffer): Promise<PcmData>; save(name: string, bytes: ArrayBuffer): Promise<{ id: string; name: string }> }`
  - `type ImportResult = { ok: true; id: string; name: string } | { ok: false; reason: string }`
  - `importSoundFile(file: { name; size; type; arrayBuffer(): Promise<ArrayBuffer> }, deps: ImportDeps): Promise<ImportResult>`
  - `interface SoundLibraryDeps { sampleRate: number; decode(bytes: ArrayBuffer): Promise<PcmData>; loadBytes(id: string): Promise<ArrayBuffer | undefined> }`
  - `interface ResolvedSound { pcm: PcmData; usedId: string; error?: string }`
  - `class SoundLibrary { constructor(deps); load(id): Promise<PcmData>; resolve(id: string, fallbackId: string): Promise<ResolvedSound>; forget(id: string): void }`

- [ ] **Step 1: Write the failing tests**

`tests/sounds/importSound.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { type ImportDeps, importSoundFile } from '../../src/sounds/importSound';
import type { PcmData } from '../../src/sounds/pcm';

function fakeFile(name: string, size = 1000, type = 'audio/wav') {
  const data = new ArrayBuffer(size);
  return { name, size, type, arrayBuffer: async () => data };
}

const pcmOf = (seconds: number, sampleRate = 1000): PcmData => ({
  sampleRate,
  channels: [new Float32Array(Math.round(seconds * sampleRate)).fill(0.5)],
});

function makeDeps(overrides: Partial<ImportDeps> = {}) {
  const deps = {
    // Mimic decodeAudioData: it detaches (transfers) the buffer it is given.
    decode: vi.fn(async (bytes: ArrayBuffer) => {
      structuredClone(bytes, { transfer: [bytes] });
      return pcmOf(0.2);
    }),
    save: vi.fn(async (name: string, _bytes: ArrayBuffer) => ({ id: 'user:1', name })),
    ...overrides,
  };
  return deps;
}

describe('importSoundFile', () => {
  it('stores a valid sound under its file name without the extension', async () => {
    const deps = makeDeps();
    expect(await importSoundFile(fakeFile('Kick 01.wav'), deps)).toEqual({
      ok: true,
      id: 'user:1',
      name: 'Kick 01',
    });
  });

  it('saves intact bytes even though decoding detaches its input', async () => {
    const deps = makeDeps();
    await importSoundFile(fakeFile('a.wav', 1234), deps);
    expect(deps.save.mock.calls[0]?.[1].byteLength).toBe(1234);
  });

  it('rejects non-audio files before reading them', async () => {
    const deps = makeDeps();
    const r = await importSoundFile(fakeFile('notes.txt', 10, 'text/plain'), deps);
    expect(r.ok).toBe(false);
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('rejects files over 2 MB', async () => {
    const r = await importSoundFile(fakeFile('big.wav', 3 * 1024 * 1024), makeDeps());
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/larger than 2 MB/) });
  });

  it('explains files that cannot be decoded and stores nothing', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => Promise.reject(new Error('EncodingError'))) });
    const r = await importSoundFile(fakeFile('broken.mp3'), deps);
    expect(r).toEqual({
      ok: false,
      reason: '"broken.mp3" could not be decoded. Try WAV, MP3, OGG or FLAC.',
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('rejects sounds longer than 2 seconds', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => pcmOf(2.5)) });
    const r = await importSoundFile(fakeFile('pad.wav'), deps);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/2\.5 s long/) });
  });

  it('rejects files that decode to no audio', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => pcmOf(0)) });
    const r = await importSoundFile(fakeFile('empty.wav'), deps);
    expect(r).toEqual({ ok: false, reason: '"empty.wav" contains no audio.' });
  });

  it('reports storage failures', async () => {
    const deps = makeDeps({ save: vi.fn(async () => Promise.reject(new Error('QuotaExceeded'))) });
    const r = await importSoundFile(fakeFile('a.wav'), deps);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/Could not save the sound/) });
  });

  it('shortens long names to 40 characters', async () => {
    const r = await importSoundFile(fakeFile(`${'x'.repeat(60)}.mp3`), makeDeps());
    expect(r.ok && r.name.length).toBe(40);
  });
});
```

`tests/sounds/soundLibrary.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { SoundLibrary, type SoundLibraryDeps } from '../../src/sounds/soundLibrary';

function makeLibrary(overrides: Partial<SoundLibraryDeps> = {}) {
  const deps = {
    sampleRate: 8000,
    // 10 silent samples, then sound. At 8 kHz the 1 ms pre-roll is 8 samples → trim 2.
    decode: vi.fn(async () => ({
      sampleRate: 8000,
      channels: [Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0.5])],
    })),
    loadBytes: vi.fn(async (_id: string): Promise<ArrayBuffer | undefined> => new ArrayBuffer(8)),
    ...overrides,
  };
  return { library: new SoundLibrary(deps), deps };
}

describe('SoundLibrary', () => {
  it('renders built-ins at the engine sample rate without touching storage', async () => {
    const { library, deps } = makeLibrary();
    const r = await library.resolve('builtin:click', 'builtin:click');
    expect(r.usedId).toBe('builtin:click');
    expect(r.pcm.sampleRate).toBe(8000);
    expect(r.pcm.channels[0]?.length).toBe(480); // 60 ms at 8 kHz
    expect(deps.loadBytes).not.toHaveBeenCalled();
  });

  it('decodes, trims and caches user sounds', async () => {
    const { library, deps } = makeLibrary();
    const first = await library.resolve('user:a', 'builtin:click');
    await library.resolve('user:a', 'builtin:click');
    expect(first.usedId).toBe('user:a');
    expect(first.error).toBeUndefined();
    expect(first.pcm.channels[0]?.length).toBe(10);
    expect(deps.decode).toHaveBeenCalledTimes(1);
  });

  it('falls back when a user sound is missing', async () => {
    const { library } = makeLibrary({ loadBytes: vi.fn(async () => undefined) });
    const r = await library.resolve('user:gone', 'builtin:click');
    expect(r.usedId).toBe('builtin:click');
    expect(r.error).toBe('Sound not found');
  });

  it('falls back when decoding fails', async () => {
    const { library } = makeLibrary({ decode: vi.fn(async () => Promise.reject(new Error('bad data'))) });
    const r = await library.resolve('user:x', 'builtin:click-high');
    expect(r.usedId).toBe('builtin:click-high');
    expect(r.error).toBe('bad data');
  });

  it('falls back when storage itself throws (IndexedDB blocked)', async () => {
    const { library } = makeLibrary({
      loadBytes: vi.fn(async () => Promise.reject(new Error('IndexedDB unavailable'))),
    });
    const r = await library.resolve('user:x', 'builtin:click');
    expect(r).toMatchObject({ usedId: 'builtin:click', error: 'IndexedDB unavailable' });
  });

  it('forget() drops the cached copy', async () => {
    const { library, deps } = makeLibrary();
    await library.resolve('user:a', 'builtin:click');
    library.forget('user:a');
    await library.resolve('user:a', 'builtin:click');
    expect(deps.decode).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/sounds/importSound.test.ts tests/sounds/soundLibrary.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/sounds/importSound.ts`:
```ts
import type { PcmData } from './pcm';
import { validateDecodedDuration, validateSoundFile } from './validate';

export interface ImportDeps {
  decode(bytes: ArrayBuffer): Promise<PcmData>;
  save(name: string, bytes: ArrayBuffer): Promise<{ id: string; name: string }>;
}

export type ImportResult = { ok: true; id: string; name: string } | { ok: false; reason: string };

export interface ImportableFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function displayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim().slice(0, 40) || 'Untitled sound';
}

export async function importSoundFile(file: ImportableFile, deps: ImportDeps): Promise<ImportResult> {
  const check = validateSoundFile(file);
  if (!check.ok) return check;

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, reason: `Could not read "${file.name}".` };
  }

  let pcm: PcmData;
  try {
    // decodeAudioData detaches the buffer it gets, so decode a copy and keep `bytes` for storage.
    pcm = await deps.decode(bytes.slice(0));
  } catch {
    return { ok: false, reason: `"${file.name}" could not be decoded. Try WAV, MP3, OGG or FLAC.` };
  }

  const seconds = (pcm.channels[0]?.length ?? 0) / pcm.sampleRate;
  if (seconds === 0) return { ok: false, reason: `"${file.name}" contains no audio.` };
  const duration = validateDecodedDuration(seconds, file.name);
  if (!duration.ok) return duration;

  try {
    const saved = await deps.save(displayName(file.name), bytes);
    return { ok: true, id: saved.id, name: saved.name };
  } catch {
    return {
      ok: false,
      reason: 'Could not save the sound. Browser storage may be full or disabled (private window).',
    };
  }
}
```

`src/sounds/soundLibrary.ts`:
```ts
import type { PcmData } from './pcm';
import { BUILTIN_SOUNDS, renderClick } from './synth';
import { trimLeadingSilence } from './trim';

export interface SoundLibraryDeps {
  /** Sample rate built-ins are rendered at (the AudioContext's). */
  sampleRate: number;
  decode(bytes: ArrayBuffer): Promise<PcmData>;
  loadBytes(id: string): Promise<ArrayBuffer | undefined>;
}

export interface ResolvedSound {
  pcm: PcmData;
  /** The id actually used: the requested one, or the fallback after an error. */
  usedId: string;
  error?: string;
}

export class SoundLibrary {
  private readonly cache = new Map<string, PcmData>();

  constructor(private readonly deps: SoundLibraryDeps) {}

  async load(id: string): Promise<PcmData> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    let pcm: PcmData;
    const builtin = Object.hasOwn(BUILTIN_SOUNDS, id) ? BUILTIN_SOUNDS[id] : undefined;
    if (builtin) {
      pcm = {
        sampleRate: this.deps.sampleRate,
        channels: [renderClick(builtin.spec, this.deps.sampleRate)],
      };
    } else {
      const bytes = await this.deps.loadBytes(id);
      if (!bytes) throw new Error('Sound not found');
      pcm = trimLeadingSilence(await this.deps.decode(bytes));
    }
    this.cache.set(id, pcm);
    return pcm;
  }

  /** Load `id`; on any failure load `fallbackId` (a built-in) and report why. */
  async resolve(id: string, fallbackId: string): Promise<ResolvedSound> {
    try {
      return { pcm: await this.load(id), usedId: id };
    } catch (e) {
      return {
        pcm: await this.load(fallbackId),
        usedId: fallbackId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  forget(id: string): void {
    this.cache.delete(id);
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/sounds tests/sounds
git commit -m "feat: sound import flow and cached sound library with fallback"
```

---

### Task 8: Audio engine, app shell and transport

This task produces the first thing you can hear. It creates the full page markup and styles (later tasks only wire behaviour into them), the audio engine and the Play button.

**Files:**
- Create: `src/engine/timerWorker.ts`, `src/engine/audioEngine.ts`, `src/ui/dom.ts`, `src/ui/toast.ts`, `src/ui/transport.ts`, `src/ui/debugOverlay.ts`, `src/styles.css`
- Replace: `index.html`, `src/main.ts`

**Interfaces:**
- Consumes: `Scheduler`, `BeatEvent`, `Pattern` (Task 3); `BeatTimeline`, `computeHeardTime` (Task 4); `PcmData` (Task 5); `SoundStore` (Task 6); `SoundLibrary` (Task 7); settings and store (Task 2).
- Produces:
  - `class AudioEngine { constructor(opts: { getPattern: () => Pattern }); readonly ctx: AudioContext; readonly timeline: BeatTimeline; readonly running: boolean; readonly sampleRate: number; readonly stats: SchedulerStats; start(): Promise<void>; stop(): void; setVolume(v: number): void; setSound(slot: 'accent' | 'normal', pcm: PcmData): void; decode(bytes: ArrayBuffer): Promise<PcmData>; preview(pcm: PcmData): Promise<void>; heardTime(syncOffsetMs: number): number }`
  - `byId<T extends HTMLElement = HTMLElement>(id: string): T`
  - `type Toast = (message: string) => void`, `createToast(el: HTMLElement, durationMs?: number): Toast`
  - `interface Transport { toggle(): Promise<void> }`, `mountTransport(deps: { engine: AudioEngine; toast: Toast; onToggle: () => void }): Transport`
  - `mountDebugOverlay(el: HTMLElement, engine: AudioEngine): void`
  - DOM ids used by later tasks: `stage` (with `data-viz`), `viz` (canvas), `playBtn`, `beatRow`, `signatureBtn`, `sigTop`, `sigBottom`, `soundBtn`, `dial`, `dialRing`, `bpmValue`, `bpmDown`, `bpmUp`, `tapBtn`, `settingsBtn`, `toast`, `debug`, `signatureDialog`, `beatsDown`, `beatsValue`, `beatsUp`, `settingsDialog`, `volumeInput`, `volumeValue`, `offsetInput`, `offsetValue`, `resetBtn`, `soundDialog`, `accentSelect`, `normalSelect`, `dropZone`, `soundFile`, `userSounds`. Also the classes `.seg-btn[data-viz]`, `[data-unit]`, `[data-preset]`, `[data-preview]`.

- [x] **Step 1: Worker** — `src/engine/timerWorker.ts`

```ts
// Wakes the scheduler. Worker timers are throttled far less than main-thread timers in
// background tabs. The tick only *wakes* the scheduler; it never decides when a click sounds.
const TICK_MS = 25;
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  if (e.data === 'start' && timer === undefined) {
    timer = setInterval(() => self.postMessage('tick'), TICK_MS);
  } else if (e.data === 'stop' && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
};

export {};
```

- [x] **Step 2: Engine** — `src/engine/audioEngine.ts`

```ts
import type { PcmData } from '../sounds/pcm';
import { BeatTimeline } from './beatTimeline';
import { computeHeardTime } from './clock';
import { type BeatEvent, type Pattern, Scheduler, type SchedulerStats } from './scheduler';

export type SoundSlot = 'accent' | 'normal';

export interface AudioEngineOptions {
  getPattern: () => Pattern;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly timeline = new BeatTimeline();
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly worker: Worker;
  private readonly buffers: Record<SoundSlot, AudioBuffer | null> = { accent: null, normal: null };
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(opts: AudioEngineOptions) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.scheduler = new Scheduler({ getPattern: opts.getPattern, onBeat: (b) => this.playBeat(b) });
    this.worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => this.scheduler.tick(this.ctx.currentTime);
    this.ctx.addEventListener('statechange', () => {
      // Device change or OS interruption while playing: try to get the clock running again.
      if (this.scheduler.isRunning && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    });
  }

  get running(): boolean {
    return this.scheduler.isRunning;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get stats(): SchedulerStats {
    return this.scheduler.stats;
  }

  /** Must be called from a user gesture (autoplay policy). */
  async start(): Promise<void> {
    if (this.scheduler.isRunning) return;
    await this.ctx.resume();
    this.timeline.clear();
    this.scheduler.start(this.ctx.currentTime);
    this.worker.postMessage('start');
  }

  stop(): void {
    this.scheduler.stop();
    this.worker.postMessage('stop');
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.active.clear();
    this.timeline.clear();
  }

  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
  }

  setSound(slot: SoundSlot, pcm: PcmData): void {
    this.buffers[slot] = this.toBuffer(pcm);
  }

  /** Note: decodeAudioData detaches `bytes`; pass a copy if you still need them. */
  async decode(bytes: ArrayBuffer): Promise<PcmData> {
    const buffer = await this.ctx.decodeAudioData(bytes);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    return { sampleRate: buffer.sampleRate, channels };
  }

  async preview(pcm: PcmData): Promise<void> {
    await this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = this.toBuffer(pcm);
    source.connect(this.master);
    source.start(this.ctx.currentTime + 0.01);
  }

  heardTime(syncOffsetMs: number): number {
    const timestamp =
      typeof this.ctx.getOutputTimestamp === 'function' ? this.ctx.getOutputTimestamp() : null;
    return computeHeardTime({
      timestamp,
      perfNow: performance.now(),
      currentTime: this.ctx.currentTime,
      outputLatency: this.ctx.outputLatency || this.ctx.baseLatency || 0,
      syncOffsetMs,
    });
  }

  private playBeat(beat: BeatEvent): void {
    this.timeline.push(beat);
    if (beat.level === 'mute') return;
    const buffer = this.buffers[beat.level];
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
    };
    this.active.add(source);
    source.start(beat.time);
  }

  private toBuffer(pcm: PcmData): AudioBuffer {
    const length = Math.max(1, ...pcm.channels.map((c) => c.length));
    const buffer = this.ctx.createBuffer(Math.max(1, pcm.channels.length), length, pcm.sampleRate);
    pcm.channels.forEach((channel, i) => {
      buffer.copyToChannel(channel, i);
    });
    return buffer;
  }
}
```

- [x] **Step 3: Small UI helpers**

`src/ui/dom.ts`:
```ts
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}
```

`src/ui/toast.ts`:
```ts
export type Toast = (message: string) => void;

export function createToast(el: HTMLElement, durationMs = 4500): Toast {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (message) => {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  };
}
```

`src/ui/transport.ts`:
```ts
import type { AudioEngine } from '../engine/audioEngine';
import { byId } from './dom';
import type { Toast } from './toast';

export interface Transport {
  toggle(): Promise<void>;
}

export function mountTransport(deps: {
  engine: AudioEngine;
  toast: Toast;
  onToggle: () => void;
}): Transport {
  const button = byId<HTMLButtonElement>('playBtn');
  let busy = false;

  const render = () => {
    const on = deps.engine.running;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Stop' : 'Start');
  };

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (deps.engine.running) deps.engine.stop();
      else await deps.engine.start();
    } catch (e) {
      deps.toast(`Audio could not start: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
      render();
      deps.onToggle();
    }
  }

  button.addEventListener('click', () => {
    void toggle();
  });
  render();
  return { toggle };
}
```

`src/ui/debugOverlay.ts`:
```ts
import type { AudioEngine } from '../engine/audioEngine';

/** `?debug=1`: live scheduler health. minLead must stay > 0 ms and skipped must stay 0. */
export function mountDebugOverlay(el: HTMLElement, engine: AudioEngine): void {
  el.hidden = false;
  const ms = (seconds: number) => `${(seconds * 1000).toFixed(1)} ms`;
  const update = () => {
    const { scheduled, minLead, skipped } = engine.stats;
    const ctx = engine.ctx;
    el.textContent = [
      `context   ${ctx.state} @ ${ctx.sampleRate} Hz`,
      `scheduled ${scheduled}`,
      `minLead   ${Number.isFinite(minLead) ? ms(minLead) : '–'}`,
      `skipped   ${skipped}`,
      `output    ${ms(ctx.outputLatency || 0)}`,
      `base      ${ms(ctx.baseLatency || 0)}`,
    ].join('\n');
  };
  update();
  setInterval(update, 500);
}
```

- [x] **Step 4: Page markup** — replace `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#141416" />
    <meta name="description" content="A precise metronome with custom sounds and synced visualisers." />
    <title>Metronome</title>
    <script type="module" src="/src/main.ts"></script>
  </head>
  <body>
    <main class="app">
      <header class="topbar">
        <h1 class="title">Metronome</h1>
        <div class="seg" role="radiogroup" aria-label="Visualiser">
          <button type="button" role="radio" class="seg-btn" data-viz="circular" aria-checked="true">Circle</button>
          <button type="button" role="radio" class="seg-btn" data-viz="linear" aria-checked="false">Line</button>
        </div>
      </header>

      <section id="stage" class="stage" data-viz="circular">
        <canvas id="viz" class="viz" aria-hidden="true"></canvas>
        <button type="button" id="playBtn" class="play-btn" aria-pressed="false" aria-label="Start">
          <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
        </button>
      </section>

      <div class="side">
        <section class="panel beats" aria-label="Beat accents">
          <span class="label">Beats</span>
          <div id="beatRow" class="beat-row"></div>
        </section>

        <section class="panel controls" aria-label="Tempo controls">
          <span class="bolt tl"></span><span class="bolt tr"></span><span class="bolt bl"></span><span class="bolt br"></span>
          <div class="col">
            <button type="button" id="signatureBtn" class="square-btn" aria-label="Time signature">
              <span class="sig"><span id="sigTop">4</span><span id="sigBottom">4</span></span>
            </button>
            <span class="label">Signature</span>
            <button type="button" id="soundBtn" class="square-btn" aria-label="Sounds">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
            </button>
            <span class="label">Sound</span>
          </div>

          <div class="dial-col">
            <div id="dial" class="dial" role="slider" tabindex="0" aria-label="Tempo in BPM" aria-valuemin="20" aria-valuemax="400" aria-valuenow="120">
              <div id="dialRing" class="dial-ring"></div>
              <div class="dial-face">
                <output id="bpmValue" class="bpm-value">120</output>
                <span class="bpm-unit">BPM</span>
              </div>
            </div>
            <div class="nudges">
              <button type="button" id="bpmDown" class="nudge" aria-label="Slower">−</button>
              <button type="button" id="bpmUp" class="nudge" aria-label="Faster">+</button>
            </div>
          </div>

          <div class="col">
            <button type="button" id="tapBtn" class="square-btn tap" aria-label="Tap tempo">TAP</button>
            <span class="label">Tap</span>
            <button type="button" id="settingsBtn" class="square-btn" aria-label="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true" class="stroke"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
            </button>
            <span class="label">Settings</span>
          </div>
        </section>
      </div>

      <p id="toast" class="toast" role="status" aria-live="polite" hidden></p>
      <pre id="debug" class="debug" hidden></pre>
    </main>

    <dialog id="signatureDialog" class="sheet" aria-labelledby="sigTitle">
      <form method="dialog" class="sheet-head">
        <h2 id="sigTitle">Time signature</h2>
        <button class="icon-btn" aria-label="Close">✕</button>
      </form>
      <div class="sig-editor">
        <div class="stepper">
          <button type="button" id="beatsDown" class="nudge" aria-label="Fewer beats">−</button>
          <output id="beatsValue" class="stepper-value">4</output>
          <button type="button" id="beatsUp" class="nudge" aria-label="More beats">+</button>
        </div>
        <div class="unit-row" role="radiogroup" aria-label="Beat unit">
          <button type="button" role="radio" class="chip" data-unit="2">2</button>
          <button type="button" role="radio" class="chip" data-unit="4">4</button>
          <button type="button" role="radio" class="chip" data-unit="8">8</button>
          <button type="button" role="radio" class="chip" data-unit="16">16</button>
        </div>
      </div>
      <h3 class="sheet-sub">Presets</h3>
      <div class="preset-row">
        <button type="button" class="chip" data-preset="2/4">2/4</button>
        <button type="button" class="chip" data-preset="3/4">3/4</button>
        <button type="button" class="chip" data-preset="4/4">4/4</button>
        <button type="button" class="chip" data-preset="5/4">5/4</button>
        <button type="button" class="chip" data-preset="6/8">6/8</button>
        <button type="button" class="chip" data-preset="7/8">7/8</button>
        <button type="button" class="chip" data-preset="12/8">12/8</button>
      </div>
    </dialog>

    <dialog id="settingsDialog" class="sheet" aria-labelledby="setTitle">
      <form method="dialog" class="sheet-head">
        <h2 id="setTitle">Settings</h2>
        <button class="icon-btn" aria-label="Close">✕</button>
      </form>
      <label class="field">
        <span>Volume <output id="volumeValue">80%</output></span>
        <input id="volumeInput" type="range" min="0" max="100" step="1" />
      </label>
      <label class="field">
        <span>Visual sync offset <output id="offsetValue">0 ms</output></span>
        <input id="offsetInput" type="range" min="-200" max="200" step="1" />
        <small class="hint">If the flash comes before you hear the click (common with Bluetooth headphones), move this right to delay the visuals.</small>
      </label>
      <button type="button" id="resetBtn" class="wide-btn danger">Reset all settings</button>
      <p class="hint">Keys: Space start/stop · ↑↓ tempo (Shift ×5) · PgUp/PgDn ±10 · T tap · V visualiser</p>
    </dialog>

    <dialog id="soundDialog" class="sheet" aria-labelledby="soundTitle">
      <form method="dialog" class="sheet-head">
        <h2 id="soundTitle">Sounds</h2>
        <button class="icon-btn" aria-label="Close">✕</button>
      </form>
      <div class="slot">
        <label for="accentSelect">Accent (beat 1)</label>
        <div class="slot-row">
          <select id="accentSelect"></select>
          <button type="button" class="small-btn" data-preview="accentSoundId" aria-label="Preview accent sound">▶</button>
        </div>
      </div>
      <div class="slot">
        <label for="normalSelect">Other beats</label>
        <div class="slot-row">
          <select id="normalSelect"></select>
          <button type="button" class="small-btn" data-preview="normalSoundId" aria-label="Preview beat sound">▶</button>
        </div>
      </div>
      <div id="dropZone" class="drop-zone">
        <p>Drop audio files here, or</p>
        <label class="small-btn">Choose files<input id="soundFile" type="file" accept="audio/*,.wav,.mp3,.ogg,.oga,.flac,.m4a,.aac,.webm,.opus" multiple hidden /></label>
        <p class="hint">WAV, MP3, OGG, FLAC · up to 2 MB and 2 s each</p>
      </div>
      <h3 class="sheet-sub">Your sounds</h3>
      <ul id="userSounds" class="sound-list"></ul>
    </dialog>
  </body>
</html>
```

- [x] **Step 5: Styles** — `src/styles.css`

```css
:root {
  color-scheme: dark;
  --bg: #141416;
  --bg-hi: #1d1d20;
  --panel: #232327;
  --panel-lo: #1a1a1d;
  --edge: #0c0c0e;
  --line: #34343a;
  --text: #ececf0;
  --muted: #8d8d96;
  --pink: #ff2f7d;
  --pink-soft: rgb(255 47 125 / 0.35);
  --radius: 18px;
  /* Visualiser palette, read by the canvas renderers */
  --viz-ring: #b9b9c0;
  --viz-spoke: #8e8e96;
  --viz-node: #d23c73;
  --viz-accent: #ff2f7d;
  --viz-node-idle: #5a5a62;
  --viz-hand: #ff2f7d;
  --viz-label: #b5b5bd;
  --viz-glow: #ff2f7d;
  --viz-core: #fff3f7;
  font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; min-height: 100%; }
body {
  background: radial-gradient(120% 80% at 50% 0%, var(--bg-hi), var(--bg) 60%);
  background-color: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, [tabindex]:focus-visible, select:focus-visible, input:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: 3px;
}
svg { width: 24px; height: 24px; fill: currentColor; }
svg.stroke { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.label { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }

.app {
  max-width: 480px;
  margin: 0 auto;
  padding: max(12px, env(safe-area-inset-top)) 16px 24px;
  display: grid;
  gap: 14px;
}
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.04em; }
.seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--panel-lo); border: 1px solid var(--line); }
.seg-btn { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; color: var(--muted); }
.seg-btn[aria-checked="true"] { background: var(--panel); color: var(--text); box-shadow: 0 0 0 1px var(--pink), 0 0 12px var(--pink-soft); }

.stage { position: relative; width: min(100%, 58vh); aspect-ratio: 1; margin: 0 auto; }
.viz { width: 100%; height: 100%; display: block; }
.play-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--hub, 96px);
  height: var(--hub, 96px);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 3px solid var(--edge);
  background: radial-gradient(circle at 50% 30%, #3b3b41, #151517 70%);
  box-shadow: 0 0 0 3px var(--pink), 0 0 26px var(--pink-soft), inset 0 2px 4px rgb(255 255 255 / 0.08);
  color: var(--pink);
  display: grid;
  place-items: center;
  transition: transform 80ms ease;
}
.play-btn:active { transform: translate(-50%, -50%) scale(0.96); }
.play-btn svg { width: 42%; height: 42%; filter: drop-shadow(0 0 6px var(--pink-soft)); }
.play-btn .icon-pause, .play-btn[aria-pressed="true"] .icon-play { display: none; }
.play-btn[aria-pressed="true"] .icon-pause { display: block; }
.stage[data-viz="linear"] .play-btn { top: 72%; }

.side { display: grid; gap: 14px; }
.panel {
  position: relative;
  background: linear-gradient(180deg, #2a2a2f, #1f1f23);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05), 0 10px 30px rgb(0 0 0 / 0.45);
  padding: 14px 16px;
}
.beats { display: flex; align-items: center; gap: 14px; }
.beat-row { display: flex; flex-wrap: wrap; gap: 8px; }
.beat {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 0;
  font-size: 12px;
  font-weight: 600;
  display: grid;
  place-items: center;
  color: #fff;
}
.beat.level-accent { background: radial-gradient(circle at 35% 30%, #ff8cb5, var(--pink) 55%, #a0164a); box-shadow: 0 0 14px var(--pink-soft); }
.beat.level-normal { background: radial-gradient(circle at 35% 30%, #e7729f, var(--viz-node) 55%, #6d1a3a); }
.beat.level-mute { background: transparent; box-shadow: inset 0 0 0 2px var(--viz-node-idle); color: var(--viz-node-idle); text-decoration: line-through; }

.controls { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 22px 18px; }
.bolt { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #9a9aa0, #3a3a40); box-shadow: inset 0 0 0 1px #111; }
.bolt.tl { top: 8px; left: 8px; }
.bolt.tr { top: 8px; right: 8px; }
.bolt.bl { bottom: 8px; left: 8px; }
.bolt.br { bottom: 8px; right: 8px; }
.col { display: grid; justify-items: center; gap: 6px; }
.col .label + .square-btn { margin-top: 10px; }
.square-btn {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  border: 2px solid var(--edge);
  background: linear-gradient(180deg, #1c1c1f, #141416);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 4px 10px rgb(0 0 0 / 0.5);
  display: grid;
  place-items: center;
}
.square-btn:active { transform: translateY(1px); }
.sig { display: grid; justify-items: center; font-size: 20px; font-weight: 700; line-height: 1; }
.sig span:first-child { border-bottom: 2px solid currentColor; padding: 0 6px 3px; margin-bottom: 3px; }
.tap { font-weight: 700; letter-spacing: 0.12em; font-size: 13px; }
.tap.flash { box-shadow: 0 0 0 2px var(--pink), 0 0 18px var(--pink-soft); color: var(--pink); }

.dial-col { display: grid; justify-items: center; gap: 10px; }
.dial {
  position: relative;
  width: min(176px, 42vw);
  aspect-ratio: 1;
  border-radius: 50%;
  touch-action: none;
  cursor: grab;
  user-select: none;
  background: conic-gradient(#8d8d93, #ececf1, #9a9aa0, #f6f6f9, #8d8d93, #dcdce1, #8d8d93);
  box-shadow: 0 0 0 7px #17171a, 0 0 0 8px #000, 0 12px 30px rgb(0 0 0 / 0.6);
}
.dial:active { cursor: grabbing; }
.dial-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform: rotate(var(--rotation, 0deg));
  background: repeating-conic-gradient(rgb(30 30 34 / 0.55) 0deg 1.2deg, transparent 1.2deg 10deg);
  -webkit-mask: radial-gradient(circle closest-side, transparent 0 64%, #000 65% 94%, transparent 95%);
  mask: radial-gradient(circle closest-side, transparent 0 64%, #000 65% 94%, transparent 95%);
}
.dial-ring::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 4%;
  width: 6px;
  height: 12%;
  margin-left: -3px;
  border-radius: 3px;
  background: var(--pink);
  box-shadow: 0 0 10px var(--pink);
}
.dial-face {
  position: absolute;
  inset: 21%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 30%, #2d2d32, #111113 75%);
  box-shadow: 0 0 0 5px #0b0b0d, inset 0 2px 5px rgb(255 255 255 / 0.07);
  display: grid;
  place-content: center;
  text-align: center;
  pointer-events: none;
}
.bpm-value { font-size: clamp(28px, 9vw, 40px); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.bpm-unit { font-size: 11px; letter-spacing: 0.3em; color: var(--pink); margin-top: 4px; }
.nudges { display: flex; gap: 12px; }
.nudge { width: 40px; height: 32px; border-radius: 10px; border: 1px solid var(--edge); background: var(--panel-lo); font-size: 18px; line-height: 1; }

.toast {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  max-width: min(92vw, 440px);
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: #2b2b30;
  border: 1px solid var(--line);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
  font-size: 14px;
  z-index: 10;
}
.debug {
  position: fixed;
  top: 8px;
  left: 8px;
  margin: 0;
  padding: 8px 10px;
  font: 12px/1.4 ui-monospace, Consolas, monospace;
  background: rgb(0 0 0 / 0.75);
  border: 1px solid var(--line);
  border-radius: 8px;
  z-index: 11;
  pointer-events: none;
}

.sheet {
  width: min(92vw, 420px);
  max-height: 86vh;
  overflow: auto;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--edge);
  border-radius: 18px;
  padding: 18px 20px 22px;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.6);
}
.sheet::backdrop { background: rgb(0 0 0 / 0.6); }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.sheet-head h2 { margin: 0; font-size: 18px; }
.sheet-sub { margin: 18px 0 8px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.icon-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); background: var(--panel-lo); }
.chip { min-width: 44px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel-lo); font-size: 14px; }
.chip[aria-checked="true"], .chip.active { border-color: var(--pink); color: var(--pink); box-shadow: 0 0 10px var(--pink-soft); }
.sig-editor { display: grid; gap: 14px; justify-items: center; }
.stepper { display: flex; align-items: center; gap: 16px; }
.stepper-value { font-size: 36px; font-weight: 700; min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
.unit-row, .preset-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.field { display: grid; gap: 6px; margin-bottom: 16px; }
.field > span { display: flex; justify-content: space-between; font-size: 14px; }
.field input[type="range"] { width: 100%; accent-color: var(--pink); }
.hint { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
.wide-btn { width: 100%; padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel-lo); }
.wide-btn.danger { color: #ff8a8a; border-color: #5a2a2a; }
.slot { display: grid; gap: 6px; margin-bottom: 14px; }
.slot label { font-size: 14px; }
.slot-row { display: flex; gap: 8px; }
.slot-row select { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel-lo); color: var(--text); font: inherit; }
.small-btn { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel-lo); font-size: 14px; display: inline-grid; place-items: center; cursor: pointer; }
.drop-zone { border: 2px dashed var(--line); border-radius: 14px; padding: 16px; text-align: center; display: grid; gap: 8px; justify-items: center; }
.drop-zone.over { border-color: var(--pink); background: rgb(255 47 125 / 0.06); }
.drop-zone p { margin: 0; }
.sound-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sound-list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; background: var(--panel-lo); }
.sound-list li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sound-list li.empty { color: var(--muted); background: none; }

@media (min-width: 900px) {
  .app { max-width: 1100px; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: center; column-gap: 32px; }
  .topbar { grid-column: 1 / -1; }
  .stage { width: min(100%, 78vh); }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [x] **Step 6: Composition root** — replace `src/main.ts`

```ts
import './styles.css';
import { AudioEngine, type SoundSlot } from './engine/audioEngine';
import { SoundLibrary } from './sounds/soundLibrary';
import { SoundStore } from './sounds/soundStore';
import { DEFAULT_SETTINGS, loadSettings, type Settings, saveSettings } from './state/settings';
import { createStore } from './state/store';
import { mountDebugOverlay } from './ui/debugOverlay';
import { byId } from './ui/dom';
import { createToast } from './ui/toast';
import { mountTransport } from './ui/transport';

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const storage = safeLocalStorage();
const store = createStore<Settings>(loadSettings(storage));
store.subscribe((s) => saveSettings(storage, s));

const toast = createToast(byId('toast'));
const engine = new AudioEngine({ getPattern: () => store.get() });
engine.setVolume(store.get().volume);
store.subscribe((s, prev) => {
  if (s.volume !== prev.volume) engine.setVolume(s.volume);
});

const sounds = new SoundStore();
const library = new SoundLibrary({
  sampleRate: engine.sampleRate,
  decode: (bytes) => engine.decode(bytes),
  loadBytes: async (id) => (await sounds.get(id))?.bytes,
});

const slotRequest: Record<SoundSlot, number> = { accent: 0, normal: 0 };

async function applySound(slot: SoundSlot): Promise<void> {
  const request = ++slotRequest[slot];
  const s = store.get();
  const id = slot === 'accent' ? s.accentSoundId : s.normalSoundId;
  const fallback =
    slot === 'accent' ? DEFAULT_SETTINGS.accentSoundId : DEFAULT_SETTINGS.normalSoundId;
  const result = await library.resolve(id, fallback);
  if (request !== slotRequest[slot]) return; // a newer selection finished first
  engine.setSound(slot, result.pcm);
  if (result.error) {
    toast(`Couldn't load that sound (${result.error}). Using the default.`);
    store.set(slot === 'accent' ? { accentSoundId: fallback } : { normalSoundId: fallback });
  }
}

void applySound('accent');
void applySound('normal');
store.subscribe((s, prev) => {
  if (s.accentSoundId !== prev.accentSoundId) void applySound('accent');
  if (s.normalSoundId !== prev.normalSoundId) void applySound('normal');
});

mountTransport({ engine, toast, onToggle: () => {} });

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugOverlay(byId('debug'), engine);
}
```

- [x] **Step 7: Type-check, test and build**

Run: `npm test && npm run build`
Expected: all tests pass and the build succeeds. If `copyToChannel` or `getChannelData` report a `Float32Array<ArrayBufferLike>` mismatch, the installed TypeScript is older than 5.7. Upgrade it (`npm i -D typescript@latest`) rather than casting.

- [ ] **Step 8: Manual check in the browser**

Run: `npm run dev`, then open `http://localhost:5173/?debug=1` in Chrome.
Expected:
- The dark page renders with the panel, dial showing 120, and Signature/Sound/Tap/Settings buttons. They are inert for now, and the canvas is empty.
- Clicking the pink Play button on the stage plays a steady 120 BPM click, higher-pitched on beat 1, and the icon turns into Pause.
- The debug overlay shows `context running`, a rising `scheduled`, `minLead` between about 50 and 100 ms, and `skipped 0`.
- Switch to another tab for 60 s, come back: the click never stopped and `skipped` is still 0.
- Clicking Pause stops the sound immediately.

- [x] **Step 9: Commit**

```bash
git add index.html src tests
git commit -m "feat: audio engine with worker-driven scheduling, app shell and transport"
```

---

### Task 9: Visualiser geometry and frame computation

**Files:**
- Create: `src/viz/geometry.ts`, `src/viz/frame.ts`
- Test: `tests/viz/geometry.test.ts`, `tests/viz/frame.test.ts`

**Interfaces:**
- Consumes: `BeatEvent` (Task 3), `beatPhase` (Task 4), `BeatLevel` (Task 2).
- Produces:
  - `TOP = −π/2`, `nodeAngle(i, n)`, `handAngle(beatInBar, phase, n)`, `polar(cx, cy, r, angle): { x; y }`
  - `linearNodeX(i, n, left, width)`, `linearStickX(beatInBar, phase, n, left, width)`
  - `GLOW_SECONDS = 0.35`, `glowIntensity(sinceBeat, decay = GLOW_SECONDS)`
  - `circularLayout(width, height): { cx; cy; r; hub; labelPad }`, `linearLayout(width, height): { left; width; y }`, `nodeRadius(count, span)`
  - `interface VizFrame { running: boolean; beatsPerBar: number; levels: readonly BeatLevel[]; activeBeat: number; phase: number; glow: number; reducedMotion: boolean }`
  - `computeFrame(input: { running: boolean; beat: BeatEvent | null; heardTime: number; beatsPerBar: number; levels: readonly BeatLevel[]; reducedMotion: boolean }): VizFrame`

- [ ] **Step 1: Write the failing tests**

`tests/viz/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  circularLayout,
  glowIntensity,
  handAngle,
  linearNodeX,
  linearStickX,
  nodeAngle,
  nodeRadius,
  polar,
} from '../../src/viz/geometry';

describe('circular geometry', () => {
  it('puts beat 1 at 12 o’clock and goes clockwise on screen (y grows downward)', () => {
    const top = polar(0, 0, 10, nodeAngle(0, 4));
    const right = polar(0, 0, 10, nodeAngle(1, 4));
    const bottom = polar(0, 0, 10, nodeAngle(2, 4));
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(bottom.y).toBeCloseTo(10);
  });

  it('lands the hand exactly on a node at its beat', () => {
    expect(handAngle(1, 0, 4)).toBeCloseTo(nodeAngle(1, 4));
    const end = polar(0, 0, 1, handAngle(3, 1, 4));
    const first = polar(0, 0, 1, nodeAngle(0, 4));
    expect(end.x).toBeCloseTo(first.x);
    expect(end.y).toBeCloseTo(first.y);
  });

  it('sweeps between nodes with the phase', () => {
    const mid = polar(0, 0, 1, handAngle(3, 0.5, 4)); // between beat 4 (left) and beat 1 (top)
    expect(mid.x).toBeLessThan(0);
    expect(mid.y).toBeLessThan(0);
  });

  it('handles a one-beat bar as a full turn per beat', () => {
    const half = polar(0, 0, 1, handAngle(0, 0.5, 1));
    expect(half.y).toBeCloseTo(1);
  });

  it('lays out the circle inside the canvas with room for labels', () => {
    const l = circularLayout(400, 300);
    expect(l.cx).toBe(200);
    expect(l.cy).toBe(150);
    expect(l.r).toBeCloseTo(117);
    expect(l.hub).toBeCloseTo(117 * 0.24);
    expect(circularLayout(10, 10).r).toBe(10);
  });
});

describe('linear geometry', () => {
  it('spaces nodes across the bar and ends at the bar line', () => {
    expect(linearNodeX(0, 4, 10, 400)).toBe(10);
    expect(linearNodeX(4, 4, 10, 400)).toBe(410);
  });

  it('puts the stick on the node at its beat and between nodes mid-beat', () => {
    expect(linearStickX(2, 0, 4, 10, 400)).toBe(linearNodeX(2, 4, 10, 400));
    expect(linearStickX(1, 0.5, 4, 10, 400)).toBe(160);
  });
});

describe('glowIntensity and nodeRadius', () => {
  it('peaks at the beat and fades quadratically to zero', () => {
    expect(glowIntensity(0)).toBe(1);
    expect(glowIntensity(0.175, 0.35)).toBeCloseTo(0.25);
    expect(glowIntensity(0.35)).toBe(0);
    expect(glowIntensity(-0.01)).toBe(0);
  });

  it('shrinks nodes for busy bars and clamps to 5–16 px', () => {
    expect(nodeRadius(4, 200)).toBeCloseTo(14);
    expect(nodeRadius(16, 200)).toBeCloseTo(9);
    expect(nodeRadius(4, 10)).toBe(5);
    expect(nodeRadius(4, 1000)).toBe(16);
  });
});
```

`tests/viz/frame.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BeatEvent } from '../../src/engine/scheduler';
import type { BeatLevel } from '../../src/state/settings';
import { computeFrame } from '../../src/viz/frame';

const beat = (overrides: Partial<BeatEvent> = {}): BeatEvent => ({
  time: 10,
  duration: 0.5,
  beatInBar: 2,
  beatsPerBar: 4,
  barIndex: 0,
  level: 'normal',
  ...overrides,
});

const base = {
  running: true,
  beatsPerBar: 4,
  levels: ['accent', 'normal', 'normal', 'normal'] as BeatLevel[],
  reducedMotion: false,
};

describe('computeFrame', () => {
  it('is idle when stopped', () => {
    const f = computeFrame({ ...base, running: false, beat: beat(), heardTime: 10.1 });
    expect(f).toMatchObject({ running: false, activeBeat: -1, phase: 0, glow: 0 });
  });

  it('is idle while running before the first beat is heard', () => {
    const f = computeFrame({ ...base, beat: null, heardTime: 3 });
    expect(f).toMatchObject({ running: true, activeBeat: -1, glow: 0 });
  });

  it('peaks the glow exactly when the beat is heard', () => {
    const f = computeFrame({ ...base, beat: beat(), heardTime: 10 });
    expect(f).toMatchObject({ activeBeat: 2, phase: 0, glow: 1 });
  });

  it('reports the phase between beats', () => {
    expect(computeFrame({ ...base, beat: beat(), heardTime: 10.25 }).phase).toBe(0.5);
  });

  it('fades the glow out after 0.35 s', () => {
    expect(computeFrame({ ...base, beat: beat(), heardTime: 10.36 }).glow).toBe(0);
  });

  it('shortens the glow at fast tempos so flashes never blur together', () => {
    const f = computeFrame({ ...base, beat: beat({ duration: 0.15 }), heardTime: 10.14 });
    expect(f.glow).toBe(0);
  });

  it('dims muted beats to a quarter', () => {
    expect(computeFrame({ ...base, beat: beat({ level: 'mute' }), heardTime: 10 }).glow).toBe(0.25);
  });

  it("uses the heard beat's own bar length", () => {
    expect(computeFrame({ ...base, beat: beat({ beatsPerBar: 3 }), heardTime: 10 }).beatsPerBar).toBe(3);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/viz`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/viz/geometry.ts`:
```ts
/** Canvas angle of 12 o'clock. Canvas y grows downward, so increasing angles run clockwise. */
export const TOP = -Math.PI / 2;
export const GLOW_SECONDS = 0.35;

export function nodeAngle(index: number, count: number): number {
  return TOP + (2 * Math.PI * index) / count;
}

/** On node k exactly when beat k is heard; one revolution per bar. */
export function handAngle(beatInBar: number, phase: number, count: number): number {
  return TOP + (2 * Math.PI * (beatInBar + phase)) / count;
}

export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function linearNodeX(index: number, count: number, left: number, width: number): number {
  return left + (width * index) / count;
}

export function linearStickX(
  beatInBar: number,
  phase: number,
  count: number,
  left: number,
  width: number,
): number {
  return left + (width * (beatInBar + phase)) / count;
}

/** 1 at the beat, fading quadratically to 0 at `decay` seconds. */
export function glowIntensity(sinceBeat: number, decay = GLOW_SECONDS): number {
  if (sinceBeat < 0 || sinceBeat >= decay) return 0;
  const k = 1 - sinceBeat / decay;
  return k * k;
}

export function circularLayout(width: number, height: number) {
  const size = Math.min(width, height);
  const labelPad = Math.max(18, size * 0.07);
  const r = Math.max(10, size / 2 - labelPad - 12);
  return { cx: width / 2, cy: height / 2, r, hub: r * 0.24, labelPad };
}

export function linearLayout(width: number, height: number) {
  const pad = Math.max(24, width * 0.08);
  return { left: pad, width: Math.max(10, width - pad * 2), y: height * 0.36 };
}

/** `span`: circle radius (circular) or half the track width (linear). */
export function nodeRadius(count: number, span: number): number {
  const perNode = count > 8 ? 0.045 : 0.07;
  return Math.max(5, Math.min(16, span * perNode));
}
```

`src/viz/frame.ts`:
```ts
import { beatPhase } from '../engine/beatTimeline';
import type { BeatEvent } from '../engine/scheduler';
import type { BeatLevel } from '../state/settings';
import { GLOW_SECONDS, glowIntensity } from './geometry';

export interface VizFrame {
  running: boolean;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  /** Beat index (in bar) most recently heard; −1 when idle. */
  activeBeat: number;
  /** 0..1 progress from the active beat to the next. */
  phase: number;
  /** 0..1 flash intensity of the active beat's node. */
  glow: number;
  reducedMotion: boolean;
}

export interface FrameInput {
  running: boolean;
  beat: BeatEvent | null;
  heardTime: number;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  reducedMotion: boolean;
}

export function computeFrame(input: FrameInput): VizFrame {
  const { beat } = input;
  if (!input.running || !beat) {
    return {
      running: input.running,
      beatsPerBar: input.beatsPerBar,
      levels: input.levels,
      activeBeat: -1,
      phase: 0,
      glow: 0,
      reducedMotion: input.reducedMotion,
    };
  }
  const since = input.heardTime - beat.time;
  const decay = Math.min(GLOW_SECONDS, beat.duration * 0.9);
  const glow = glowIntensity(since, decay);
  return {
    running: true,
    beatsPerBar: beat.beatsPerBar,
    levels: input.levels,
    activeBeat: beat.beatInBar,
    phase: beatPhase(beat, input.heardTime),
    glow: beat.level === 'mute' ? glow * 0.25 : glow,
    reducedMotion: input.reducedMotion,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/viz`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/viz tests/viz
git commit -m "feat: visualiser geometry and audio-synced frame computation"
```

---

### Task 10: Canvas renderers, visualiser controller and switch

**Files:**
- Create: `src/viz/types.ts`, `src/viz/drawNode.ts`, `src/viz/circular.ts`, `src/viz/linear.ts`, `src/viz/vizController.ts`, `src/ui/vizSwitch.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything from Task 9; `AudioEngine.heardTime`, `.timeline`, `.running` (Task 8).
- Produces:
  - `interface VizTheme { ring; spoke; node; accent; nodeIdle; hand; label; glow; core: string }`
  - `interface Visualizer { draw(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, frame: VizFrame, theme: VizTheme): void }`
  - `circularVisualizer`, `linearVisualizer`
  - `interface VizSource { running(): boolean; heardTime(): number; beatAt(time: number): BeatEvent | null }`
  - `class VizController { constructor(canvas: HTMLCanvasElement, source: VizSource, getSettings: () => Settings); invalidate(): void }`
  - `mountVizSwitch(deps: { store: Store<Settings> }): void`

- [ ] **Step 1: Types and the shared sphere** — `src/viz/types.ts`, `src/viz/drawNode.ts`

```ts
// src/viz/types.ts
import type { VizFrame } from './frame';

export interface VizTheme {
  ring: string;
  spoke: string;
  node: string;
  accent: string;
  nodeIdle: string;
  hand: string;
  label: string;
  glow: string;
  core: string;
}

export interface Visualizer {
  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    frame: VizFrame,
    theme: VizTheme,
  ): void;
}
```

```ts
// src/viz/drawNode.ts
import type { BeatLevel } from '../state/settings';
import type { VizTheme } from './types';

/** A glowing sphere. `glow` 0..1 swells it and adds a hot white core. */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  level: BeatLevel,
  glow: number,
  theme: VizTheme,
): void {
  ctx.save();
  if (level === 'mute') {
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.nodeIdle;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    if (glow > 0) {
      ctx.globalAlpha = glow;
      ctx.strokeStyle = theme.node;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const r = (level === 'accent' ? radius * 1.25 : radius) * (1 + 0.3 * glow);
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 6 + 34 * glow;
  ctx.fillStyle = level === 'accent' ? theme.accent : theme.node;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  shine.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * glow})`);
  shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  if (glow > 0) {
    ctx.globalAlpha = glow * 0.8;
    ctx.fillStyle = theme.core;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

- [ ] **Step 2: Circular renderer** — `src/viz/circular.ts`

```ts
import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { circularLayout, handAngle, nodeAngle, nodeRadius, polar } from './geometry';
import type { Visualizer } from './types';

export const circularVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const { cx, cy, r, hub, labelPad } = circularLayout(width, height);
    const nodeR = nodeRadius(n, r);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const from = polar(cx, cy, hub, a);
      const to = polar(cx, cy, r, a);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const a = handAngle(frame.activeBeat, frame.phase, n);
      const from = polar(cx, cy, hub, a);
      const to = polar(cx, cy, r, a);
      ctx.save();
      ctx.strokeStyle = theme.hand;
      ctx.lineWidth = 5;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = `600 ${Math.round(Math.max(12, nodeR * 1.7))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const p = polar(cx, cy, r, a);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, p.x, p.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      const label = polar(cx, cy, r + labelPad, a);
      ctx.fillStyle = theme.label;
      ctx.fillText(String(i + 1), label.x, label.y);
    }
  },
};
```

- [ ] **Step 3: Linear renderer** — `src/viz/linear.ts`

```ts
import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { linearLayout, linearNodeX, linearStickX, nodeRadius } from './geometry';
import type { Visualizer } from './types';

export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const track = linearLayout(width, height);
    const nodeR = nodeRadius(n, track.width / 2);
    const tick = Math.max(18, nodeR * 2);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    ctx.beginPath();
    ctx.moveTo(track.left, track.y);
    ctx.lineTo(track.left + track.width, track.y);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i <= n; i++) {
      // i === n is the bar line at the right end.
      const x = linearNodeX(i, n, track.left, track.width);
      const h = i === n ? tick * 1.4 : tick;
      ctx.beginPath();
      ctx.moveTo(x, track.y - h);
      ctx.lineTo(x, track.y + h);
      ctx.stroke();
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const x = linearStickX(frame.activeBeat, frame.phase, n, track.left, track.width);
      ctx.save();
      ctx.strokeStyle = theme.hand;
      ctx.lineWidth = 5;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, track.y - tick * 2.2);
      ctx.lineTo(x, track.y + tick * 2.2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = `600 ${Math.round(Math.max(12, nodeR * 1.7))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const x = linearNodeX(i, n, track.left, track.width);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, x, track.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      ctx.fillStyle = theme.label;
      ctx.fillText(String(i + 1), x, track.y + tick * 2.2 + 14);
    }
  },
};
```

- [ ] **Step 4: Controller** — `src/viz/vizController.ts`

```ts
import type { BeatEvent } from '../engine/scheduler';
import type { Settings } from '../state/settings';
import { circularVisualizer } from './circular';
import { computeFrame } from './frame';
import { circularLayout } from './geometry';
import { linearVisualizer } from './linear';
import type { VizTheme } from './types';

export interface VizSource {
  running(): boolean;
  /** Audio time currently heard, already shifted by the sync offset. */
  heardTime(): number;
  beatAt(time: number): BeatEvent | null;
}

export function readTheme(el: Element): VizTheme {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ring: v('--viz-ring', '#b9b9c0'),
    spoke: v('--viz-spoke', '#8e8e96'),
    node: v('--viz-node', '#d23c73'),
    accent: v('--viz-accent', '#ff2f7d'),
    nodeIdle: v('--viz-node-idle', '#5a5a62'),
    hand: v('--viz-hand', '#ff2f7d'),
    label: v('--viz-label', '#b5b5bd'),
    glow: v('--viz-glow', '#ff2f7d'),
    core: v('--viz-core', '#fff3f7'),
  };
}

export class VizController {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: VizTheme;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private raf = 0;
  private dpr = 1;
  private size = { width: 0, height: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: VizSource,
    private readonly getSettings: () => Settings,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
    this.ctx = ctx;
    this.theme = readTheme(canvas);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.reducedMotion.addEventListener('change', () => this.invalidate());
    this.resize();
  }

  /** Draw on the next frame. While the metronome runs, keeps drawing every frame. */
  invalidate(): void {
    if (this.raf === 0) this.raf = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (): void => {
    this.raf = 0;
    this.render();
    if (this.source.running()) this.invalidate();
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.size = { width: rect.width, height: rect.height };
    const { hub } = circularLayout(rect.width, rect.height);
    this.canvas.parentElement?.style.setProperty('--hub', `${Math.round(hub * 2)}px`);
    this.render();
  }

  private render(): void {
    if (this.size.width === 0) return;
    const s = this.getSettings();
    const heard = this.source.heardTime();
    const frame = computeFrame({
      running: this.source.running(),
      beat: this.source.beatAt(heard),
      heardTime: heard,
      beatsPerBar: s.beatsPerBar,
      levels: s.levels,
      reducedMotion: this.reducedMotion.matches,
    });
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme);
  }
}
```

- [ ] **Step 5: Switch** — `src/ui/vizSwitch.ts`

```ts
import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountVizSwitch({ store }: { store: Store<Settings> }): void {
  const stage = byId('stage');
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.seg-btn[data-viz]'));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      store.set({ visualizer: button.dataset.viz === 'linear' ? 'linear' : 'circular' });
    });
  }
  const render = (s: Settings) => {
    stage.dataset.viz = s.visualizer;
    for (const button of buttons) {
      button.setAttribute('aria-checked', String(button.dataset.viz === s.visualizer));
    }
  };
  render(store.get());
  store.subscribe(render);
}
```

- [ ] **Step 6: Wire into `src/main.ts`**

Add these imports next to the other `./ui/...` imports:
```ts
import { mountVizSwitch } from './ui/vizSwitch';
import { VizController } from './viz/vizController';
```

Replace the line `mountTransport({ engine, toast, onToggle: () => {} });` with:
```ts
const viz = new VizController(
  byId<HTMLCanvasElement>('viz'),
  {
    running: () => engine.running,
    heardTime: () => engine.heardTime(store.get().syncOffsetMs),
    beatAt: (time) => engine.timeline.beatAt(time),
  },
  () => store.get(),
);
store.subscribe(() => viz.invalidate());

const transport = mountTransport({ engine, toast, onToggle: () => viz.invalidate() });
mountVizSwitch({ store });
```
(`transport` is used in Task 11. If Biome flags it as unused before then, that's expected. Leave it.)

- [ ] **Step 7: Build and test**

Run: `npm test && npm run build`
Expected: pass.

- [ ] **Step 8: Manual check** (`npm run dev`, open `http://localhost:5173/?debug=1`)

Expected:
- The circular view looks like `docs/superpowers/specs/reference-ui.jpg`: a light ring, 4 pink spheres at top/right/bottom/left labelled 1–4 outside, spokes to the hub, and the Play button sitting on the hub.
- Press Play. One pink hand sweeps clockwise at one revolution per bar. At each click the sphere it touches flashes (swells, white core, big glow) **at the same instant you hear the click**. Beat 1 is larger.
- Click **Line**: a horizontal track with 4 spheres and a bar line, the stick sweeping left→right and snapping back at the bar line, with the same flash timing. The Play button moves below the track.
- Resize the window: it stays crisp (no blur on HiDPI) and the Play button stays centred on the hub.
- The page reloads with the chosen view persisted.
- Pause: the hand disappears and the spheres return to rest.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: circular and linear canvas visualisers locked to heard audio time"
```

---

### Task 11: Tempo controls, tap tempo, beat accents and keyboard

**Files:**
- Create: `src/state/tapTempo.ts`, `src/ui/dialMath.ts`, `src/ui/controls.ts`
- Test: `tests/state/tapTempo.test.ts`, `tests/ui/dialMath.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `clampBpm`, `MIN_BPM`, `MAX_BPM` (Task 1); `nextLevel`, `Settings` (Task 2); `Store`; `Transport.toggle` (Task 8).
- Produces:
  - `class TapTempo { constructor(maxTaps = 6, resetAfterMs = 3100); tap(nowMs: number): number | null }`
  - `DEGREES_PER_BPM = 4`, `angleDelta(from: number, to: number): number` (radians, wrapped to (−π, π]), `bpmAfterRotation(startBpm: number, totalRadians: number): number`
  - `mountControls(deps: { store: Store<Settings>; toggle: () => Promise<void> }): void`

- [ ] **Step 1: Write the failing tests**

`tests/state/tapTempo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TapTempo } from '../../src/state/tapTempo';

describe('TapTempo', () => {
  it('needs two taps, then averages the intervals', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBe(120);
    expect(t.tap(1000)).toBe(120);
    expect(t.tap(1520)).toBe(118);
  });

  it('starts over after a pause longer than 3.1 s', () => {
    const t = new TapTempo();
    t.tap(0);
    t.tap(500);
    expect(t.tap(5000)).toBeNull();
    expect(t.tap(5600)).toBe(100);
  });

  it('only averages the last six taps', () => {
    const t = new TapTempo();
    for (const ms of [0, 1000, 2000, 2500, 3000, 3500, 4000, 4500]) t.tap(ms);
    expect(t.tap(5000)).toBe(120);
  });

  it('clamps to the supported tempo range', () => {
    const t = new TapTempo();
    t.tap(0);
    expect(t.tap(50)).toBe(400);
  });
});
```

`tests/ui/dialMath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { angleDelta, bpmAfterRotation, DEGREES_PER_BPM } from '../../src/ui/dialMath';

const deg = (d: number) => (d * Math.PI) / 180;

describe('angleDelta', () => {
  it('returns the short signed difference, wrapping across ±π', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });
});

describe('bpmAfterRotation', () => {
  it('adds one BPM per 4° clockwise and subtracts counter-clockwise', () => {
    expect(DEGREES_PER_BPM).toBe(4);
    expect(bpmAfterRotation(120, deg(4))).toBe(121);
    expect(bpmAfterRotation(120, -2 * Math.PI)).toBe(30);
  });

  it('clamps at the limits', () => {
    expect(bpmAfterRotation(390, 2 * Math.PI)).toBe(400);
    expect(bpmAfterRotation(25, -Math.PI)).toBe(20);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/state/tapTempo.test.ts tests/ui/dialMath.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the pure parts**

`src/state/tapTempo.ts`:
```ts
import { clampBpm } from '../engine/timing';

export class TapTempo {
  private taps: number[] = [];

  constructor(
    private readonly maxTaps = 6,
    private readonly resetAfterMs = 3100,
  ) {}

  /** Record a tap at `nowMs`. Returns the BPM once there are two or more taps, else null. */
  tap(nowMs: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && nowMs - last > this.resetAfterMs) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const first = this.taps[0] ?? nowMs;
    const interval = (nowMs - first) / (this.taps.length - 1);
    return clampBpm(60000 / interval);
  }
}
```

`src/ui/dialMath.ts`:
```ts
import { clampBpm } from '../engine/timing';

export const DEGREES_PER_BPM = 4;

/** Signed smallest rotation from `from` to `to`, in radians, within (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function bpmAfterRotation(startBpm: number, totalRadians: number): number {
  return clampBpm(startBpm + (totalRadians * 180) / Math.PI / DEGREES_PER_BPM);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/state/tapTempo.test.ts tests/ui/dialMath.test.ts`
Expected: pass.

- [ ] **Step 5: Controls** — `src/ui/controls.ts`

```ts
import { clampBpm } from '../engine/timing';
import { nextLevel, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { TapTempo } from '../state/tapTempo';
import { angleDelta, bpmAfterRotation, DEGREES_PER_BPM } from './dialMath';
import { byId } from './dom';

export interface ControlsDeps {
  store: Store<Settings>;
  toggle: () => Promise<void>;
}

export function mountControls({ store, toggle }: ControlsDeps): void {
  const dial = byId('dial');
  const dialRing = byId('dialRing');
  const bpmValue = byId('bpmValue');
  const beatRow = byId('beatRow');
  const sigTop = byId('sigTop');
  const sigBottom = byId('sigBottom');
  const tapBtn = byId<HTMLButtonElement>('tapBtn');
  const tapper = new TapTempo();

  const setBpm = (bpm: number) => {
    const next = clampBpm(bpm);
    if (next !== store.get().bpm) store.set({ bpm: next });
  };
  const nudge = (delta: number) => setBpm(store.get().bpm + delta);

  byId('bpmUp').addEventListener('click', () => nudge(1));
  byId('bpmDown').addEventListener('click', () => nudge(-1));

  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      nudge(e.deltaY < 0 ? step : -step);
    },
    { passive: false },
  );

  dial.addEventListener('pointerdown', (e) => {
    dial.setPointerCapture(e.pointerId);
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let previous = Math.atan2(e.clientY - cy, e.clientX - cx);
    let total = 0;
    const startBpm = store.get().bpm;
    const onMove = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      total += angleDelta(previous, angle);
      previous = angle;
      setBpm(bpmAfterRotation(startBpm, total));
    };
    const onUp = () => {
      dial.removeEventListener('pointermove', onMove);
      dial.removeEventListener('pointerup', onUp);
      dial.removeEventListener('pointercancel', onUp);
    };
    dial.addEventListener('pointermove', onMove);
    dial.addEventListener('pointerup', onUp);
    dial.addEventListener('pointercancel', onUp);
  });

  function tap(): void {
    const bpm = tapper.tap(performance.now());
    if (bpm !== null) setBpm(bpm);
    tapBtn.classList.add('flash');
    setTimeout(() => tapBtn.classList.remove('flash'), 120);
  }
  // pointerdown instead of click: lower latency, and it doesn't steal focus.
  tapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tap();
  });
  tapBtn.addEventListener('click', (e) => {
    if (e.detail === 0) tap(); // keyboard activation (Enter)
  });

  beatRow.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.beat');
    if (!button) return;
    const index = Number(button.dataset.index);
    const levels = [...store.get().levels];
    const current = levels[index];
    if (current === undefined) return;
    levels[index] = nextLevel(current);
    store.set({ levels });
  });

  function renderBeats(s: Settings): void {
    if (beatRow.childElementCount !== s.beatsPerBar) {
      beatRow.replaceChildren(
        ...Array.from({ length: s.beatsPerBar }, (_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.index = String(i);
          b.textContent = String(i + 1);
          return b;
        }),
      );
    }
    s.levels.forEach((level, i) => {
      const b = beatRow.children[i];
      if (!(b instanceof HTMLButtonElement)) return;
      b.className = `beat level-${level}`;
      b.setAttribute('aria-label', `Beat ${i + 1}: ${level}. Click to change.`);
    });
  }

  function render(s: Settings): void {
    bpmValue.textContent = String(s.bpm);
    dial.setAttribute('aria-valuenow', String(s.bpm));
    dialRing.style.setProperty('--rotation', `${s.bpm * DEGREES_PER_BPM}deg`);
    sigTop.textContent = String(s.beatsPerBar);
    sigBottom.textContent = String(s.beatUnit);
    renderBeats(s);
  }
  render(store.get());
  store.subscribe((s) => render(s));

  const ignoreKeys = (e: KeyboardEvent): boolean => {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    const target = e.target instanceof HTMLElement ? e.target : null;
    return !!target && (!!target.closest('dialog') || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
  };

  document.addEventListener('keydown', (e) => {
    if (ignoreKeys(e)) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!e.repeat) void toggle();
        break;
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        nudge(e.shiftKey ? 5 : 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        nudge(e.shiftKey ? -5 : -1);
        break;
      case 'PageUp':
        e.preventDefault();
        nudge(10);
        break;
      case 'PageDown':
        e.preventDefault();
        nudge(-10);
        break;
      case 't':
      case 'T':
        if (!e.repeat) tap();
        break;
      case 'v':
      case 'V':
        store.set({ visualizer: store.get().visualizer === 'circular' ? 'linear' : 'circular' });
        break;
    }
  });
  // Space on a focused button would also "click" it on keyup; our keydown already toggled.
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key === ' ' && !ignoreKeys(e) && e.target instanceof HTMLButtonElement) e.preventDefault();
    },
    true,
  );
}
```

- [ ] **Step 6: Wire into `src/main.ts`**

Add the import `import { mountControls } from './ui/controls';` with the other `./ui/...` imports. Directly after the line `mountVizSwitch({ store });` add:
```ts
mountControls({ store, toggle: transport.toggle });
```

- [ ] **Step 7: Build and test**

Run: `npm test && npm run build`
Expected: pass.

- [ ] **Step 8: Manual check** (`npm run dev`)

Expected:
- Dragging the dial clockwise raises the BPM (about 1 per 4°), and the pink indicator and ticks rotate with it. Counter-clockwise lowers it. It stops at 20 and 400. The wheel changes it by ±1 (Shift ±5), and − and + change it by ±1.
- Changing the tempo while playing changes the click rate within about 0.1 s, with no stutter, and the visualiser stays in sync.
- Tapping TAP 4+ times at a steady rhythm sets the BPM.
- The beat row shows 4 numbered spheres. Clicking one cycles accent → normal → mute. The canvas spheres update, a muted beat is silent and drawn as a hollow ring, and an accent beat uses the accent sound.
- Keyboard: Space starts/stops; ↑↓←→ PgUp PgDn change BPM; T taps; V switches the view.
- **Double-toggle check:** click TAP with the mouse, then press Space. The metronome toggles exactly once and no extra tap is registered. Click the − button, then press Space: it toggles once and BPM doesn't change.
- Reload: the BPM and accents are restored.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "feat: BPM dial, tap tempo, beat accents and keyboard shortcuts"
```

---

### Task 12: Signature and settings sheets

**Files:**
- Create: `src/ui/signatureDialog.ts`, `src/ui/settingsDialog.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `withBeatsPerBar`, `isBeatUnit`, `defaultSettings`, `Settings` (Task 2); `Store`.
- Produces: `mountSignatureDialog(deps: { store: Store<Settings> }): void`, `mountSettingsDialog(deps: { store: Store<Settings> }): void`.

- [ ] **Step 1: Signature sheet** — `src/ui/signatureDialog.ts`

```ts
import { isBeatUnit, type Settings, withBeatsPerBar } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountSignatureDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('signatureDialog');
  const beatsValue = byId('beatsValue');
  const unitButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-unit]'));
  const presetButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-preset]'));

  byId('signatureBtn').addEventListener('click', () => dialog.showModal());

  const setBeats = (n: number) => store.set(withBeatsPerBar(store.get(), n));
  byId('beatsDown').addEventListener('click', () => setBeats(store.get().beatsPerBar - 1));
  byId('beatsUp').addEventListener('click', () => setBeats(store.get().beatsPerBar + 1));

  for (const button of unitButtons) {
    button.addEventListener('click', () => {
      const unit = Number(button.dataset.unit);
      if (isBeatUnit(unit)) store.set({ beatUnit: unit });
    });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const [top, bottom] = (button.dataset.preset ?? '').split('/').map(Number);
      if (top && isBeatUnit(bottom)) {
        store.set({ ...withBeatsPerBar(store.get(), top), beatUnit: bottom });
      }
    });
  }

  const render = (s: Settings) => {
    beatsValue.textContent = String(s.beatsPerBar);
    for (const button of unitButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.unit) === s.beatUnit));
    }
    const current = `${s.beatsPerBar}/${s.beatUnit}`;
    for (const button of presetButtons) {
      button.classList.toggle('active', button.dataset.preset === current);
    }
  };
  render(store.get());
  store.subscribe(render);
}
```

- [ ] **Step 2: Settings sheet** — `src/ui/settingsDialog.ts`

```ts
import { defaultSettings, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountSettingsDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId('volumeValue');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');

  byId('settingsBtn').addEventListener('click', () => dialog.showModal());

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
  });
  offsetInput.addEventListener('input', () => {
    store.set({ syncOffsetMs: Number(offsetInput.value) });
  });

  // Two-step confirm instead of window.confirm (not reliable inside the Tauri webview).
  let armed: ReturnType<typeof setTimeout> | undefined;
  resetBtn.addEventListener('click', () => {
    if (armed === undefined) {
      resetBtn.textContent = 'Click again to reset (your sounds are kept)';
      armed = setTimeout(() => {
        armed = undefined;
        resetBtn.textContent = 'Reset all settings';
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = undefined;
    resetBtn.textContent = 'Reset all settings';
    store.set(defaultSettings());
  });

  const render = (s: Settings) => {
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    offsetInput.value = String(s.syncOffsetMs);
    offsetValue.textContent = `${s.syncOffsetMs > 0 ? '+' : ''}${s.syncOffsetMs} ms`;
  };
  render(store.get());
  store.subscribe(render);
}
```

- [ ] **Step 3: Wire into `src/main.ts`**

Add the imports:
```ts
import { mountSettingsDialog } from './ui/settingsDialog';
import { mountSignatureDialog } from './ui/signatureDialog';
```
After `mountControls({ store, toggle: transport.toggle });` add:
```ts
mountSignatureDialog({ store });
mountSettingsDialog({ store });
```

- [ ] **Step 4: Build and test**

Run: `npm test && npm run build`
Expected: pass.

- [ ] **Step 5: Manual check** (`npm run dev`)

Expected:
- The Signature button opens the sheet. − and + change the beat count (1–16), and the panel, beat row and visualiser update live, **while playing too**. Going from 7 to 3 while on beat 6 continues with beat 1 and never shows an out-of-range beat. Units 2/4/8/16 highlight and the panel shows e.g. 6 over 8. Presets set both numbers. Esc and ✕ close the sheet.
- Settings: the volume slider changes loudness live. The sync-offset slider at +100 ms makes the flash visibly lag the click, and at −100 ms makes it lead. Reset needs two clicks and restores defaults.
- Space/arrow keys do nothing while a sheet is open.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: time signature and settings sheets"
```

---

### Task 13: Sound sheet (upload, choose, preview, delete)

**Files:**
- Create: `src/ui/soundDialog.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `AudioEngine.decode`, `.preview` (Task 8); `SoundStore` (Task 6); `SoundLibrary`, `importSoundFile` (Task 7); `BUILTIN_SOUNDS` (Task 5); `DEFAULT_SETTINGS`, `Settings` (Task 2); `Toast`.
- Produces: `mountSoundDialog(deps: { store: Store<Settings>; engine: AudioEngine; sounds: SoundStore; library: SoundLibrary; toast: Toast }): void`

- [ ] **Step 1: Implement** — `src/ui/soundDialog.ts`

```ts
import type { AudioEngine } from '../engine/audioEngine';
import { importSoundFile } from '../sounds/importSound';
import type { SoundLibrary } from '../sounds/soundLibrary';
import type { SoundMeta, SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';
import type { Toast } from './toast';

type SlotKey = 'accentSoundId' | 'normalSoundId';

export interface SoundDialogDeps {
  store: Store<Settings>;
  engine: AudioEngine;
  sounds: SoundStore;
  library: SoundLibrary;
  toast: Toast;
}

export function mountSoundDialog({ store, engine, sounds, library, toast }: SoundDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('soundDialog');
  const selects: Record<SlotKey, HTMLSelectElement> = {
    accentSoundId: byId<HTMLSelectElement>('accentSelect'),
    normalSoundId: byId<HTMLSelectElement>('normalSelect'),
  };
  const fileInput = byId<HTMLInputElement>('soundFile');
  const dropZone = byId('dropZone');
  const list = byId('userSounds');
  let userSounds: SoundMeta[] = [];

  async function refresh(): Promise<void> {
    try {
      userSounds = await sounds.list();
    } catch {
      userSounds = [];
      toast('Saved sounds are unavailable: browser storage is blocked.');
    }
    render(store.get());
  }

  function fillSelect(select: HTMLSelectElement, current: string): void {
    const builtin = document.createElement('optgroup');
    builtin.label = 'Built-in';
    for (const [id, sound] of Object.entries(BUILTIN_SOUNDS)) builtin.append(new Option(sound.name, id));
    const groups: HTMLElement[] = [builtin];
    if (userSounds.length > 0) {
      const mine = document.createElement('optgroup');
      mine.label = 'Your sounds';
      for (const sound of userSounds) mine.append(new Option(sound.name, sound.id));
      groups.push(mine);
    }
    select.replaceChildren(...groups);
    select.value = current;
  }

  function smallButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small-btn';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderList(): void {
    if (userSounds.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No sounds added yet.';
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...userSounds.map((sound) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = sound.name;
        name.title = sound.name;
        li.append(
          name,
          smallButton('▶', `Preview ${sound.name}`, () => void preview(sound.id)),
          smallButton('✕', `Delete ${sound.name}`, () => void remove(sound)),
        );
        return li;
      }),
    );
  }

  function render(s: Settings): void {
    fillSelect(selects.accentSoundId, s.accentSoundId);
    fillSelect(selects.normalSoundId, s.normalSoundId);
    renderList();
  }

  async function preview(id: string): Promise<void> {
    const result = await library.resolve(id, DEFAULT_SETTINGS.normalSoundId);
    if (result.error) toast(`Couldn't play that sound (${result.error}).`);
    else await engine.preview(result.pcm);
  }

  async function remove(sound: SoundMeta): Promise<void> {
    try {
      await sounds.remove(sound.id);
    } catch {
      toast(`Could not delete "${sound.name}".`);
      return;
    }
    library.forget(sound.id);
    const current = store.get();
    const patch: Partial<Settings> = {};
    if (current.accentSoundId === sound.id) patch.accentSoundId = DEFAULT_SETTINGS.accentSoundId;
    if (current.normalSoundId === sound.id) patch.normalSoundId = DEFAULT_SETTINGS.normalSoundId;
    if (Object.keys(patch).length > 0) store.set(patch);
    await refresh();
  }

  async function addFiles(files: Iterable<File>): Promise<void> {
    const errors: string[] = [];
    const added: string[] = [];
    for (const file of files) {
      const result = await importSoundFile(file, {
        decode: (bytes) => engine.decode(bytes),
        save: (name, bytes) => sounds.add(name, bytes),
      });
      if (result.ok) added.push(result.name);
      else errors.push(result.reason);
    }
    if (added.length > 0) await refresh();
    if (errors.length > 0) {
      toast(errors.length === 1 ? (errors[0] ?? '') : `${errors[0]} (+${errors.length - 1} more)`);
    } else if (added.length === 1) {
      toast(`Added "${added[0]}". Choose it for Accent or Other beats.`);
    } else if (added.length > 1) {
      toast(`Added ${added.length} sounds.`);
    }
  }

  for (const key of Object.keys(selects) as SlotKey[]) {
    selects[key].addEventListener('change', () => {
      store.set({ [key]: selects[key].value } as Partial<Settings>);
    });
  }
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.preview as SlotKey;
      void preview(store.get()[key]);
    });
  }

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    void addFiles(files);
  });

  // Keep a stray drop anywhere from navigating the page to the audio file.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    void addFiles(Array.from(e.dataTransfer?.files ?? []));
  });

  byId('soundBtn').addEventListener('click', () => {
    render(store.get());
    dialog.showModal();
    void refresh();
  });

  store.subscribe((s, prev) => {
    if (s.accentSoundId !== prev.accentSoundId || s.normalSoundId !== prev.normalSoundId) render(s);
  });
}
```

- [ ] **Step 2: Wire into `src/main.ts`**

Add the import `import { mountSoundDialog } from './ui/soundDialog';`. After `mountSettingsDialog({ store });` add:
```ts
mountSoundDialog({ store, engine, sounds, library, toast });
```

- [ ] **Step 3: Build and test**

Run: `npm test && npm run build`
Expected: pass.

- [ ] **Step 4: Manual check** (`npm run dev`)

Prepare test files: any short WAV/MP3 click or drum hit (< 2 s), one long song MP3 (> 2 s), a `.txt` file renamed to `fake.mp3`, and an audio file > 2 MB.
Expected:
- The Sound button opens the sheet. Both selects list the 4 built-ins, and ▶ previews the current choice.
- "Choose files" with the short sample → toast "Added …". It appears under "Your sounds" and in both selects.
- Selecting it for Accent while playing → beat 1 uses it from the next bar, and it lands **on** the beat (the silent head was trimmed).
- Dragging a file onto the drop zone does the same. Dropping outside the zone does not navigate away.
- The long song → "… is N s long …". `fake.mp3` → "could not be decoded". The > 2 MB file → "larger than 2 MB". Nothing is added for any of them.
- Reload: the uploaded sound is still listed and still selected.
- Deleting the selected sound resets that slot to its default built-in, with the click still playing.
- In a Chrome **Incognito** window the app still works with the built-ins. Uploading shows a clear toast if storage fails instead of crashing.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: sound sheet with upload, drag-and-drop, preview and delete"
```

---

### Task 14: Installable offline PWA

**Files:**
- Create: `public/icon.svg`, `pwa-assets.config.ts`, generated `public/*.png` and `public/favicon.ico`
- Modify: `package.json` (script), `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`

**Interfaces:**
- Produces: a service worker and manifest in `dist/`, plus the icons that Task 15 reuses (`public/pwa-512x512.png`).

- [ ] **Step 1: Install**

Run: `npm i -D vite-plugin-pwa @vite-pwa/assets-generator`

- [ ] **Step 2: Icon source** — `public/icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#161618"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#b9b9c0" stroke-width="14"/>
  <line x1="256" y1="256" x2="379" y2="170" stroke="#ff2f7d" stroke-width="22" stroke-linecap="round"/>
  <circle cx="256" cy="106" r="30" fill="#ff2f7d"/>
  <circle cx="406" cy="256" r="24" fill="#d23c73"/>
  <circle cx="256" cy="406" r="24" fill="#d23c73"/>
  <circle cx="106" cy="256" r="24" fill="#d23c73"/>
  <circle cx="256" cy="256" r="46" fill="#26262b" stroke="#ff2f7d" stroke-width="10"/>
</svg>
```

- [ ] **Step 3: Generate icons**

`pwa-assets.config.ts`:
```ts
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset,
  images: ['public/icon.svg'],
});
```
Add the script `"generate-pwa-assets": "pwa-assets-generator"` to `package.json`, then run `npm run generate-pwa-assets`.
Expected in `public/`: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` and `favicon.ico`.

- [ ] **Step 4: Configure the plugin** — replace `vite.config.ts`

```ts
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/metronome/' : '/',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Metronome',
        short_name: 'Metronome',
        description: 'A precise metronome with custom sounds and synced visualisers.',
        theme_color: '#141416',
        background_color: '#141416',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'] },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

In `tsconfig.json` change `"types": ["vite/client"]` to `"types": ["vite/client", "vite-plugin-pwa/client"]`.

In `index.html` add inside `<head>`, after the `<title>`:
```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```
(Vite rewrites these absolute paths for the `/metronome/` base at build time.)

- [ ] **Step 5: Register the service worker (not inside Tauri)** — append to the end of `src/main.ts`

```ts
if (!('__TAURI_INTERNALS__' in window)) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}
```

- [ ] **Step 6: Build and test**

Run: `npm test && npm run build`
Expected: pass. `dist/` contains `sw.js`, `manifest.webmanifest` and the icons.

- [ ] **Step 7: Manual check**

Run: `npm run preview`, then open the printed URL in Chrome.
Expected:
- DevTools → Application → Manifest shows no errors and the pink icon. The install icon appears in the address bar and installing opens a standalone window.
- DevTools → Network → "Offline", then reload: the app still loads and clicks, including user sounds, which are in IndexedDB.
- Also run `GITHUB_PAGES=true npm run build && npx vite preview --base /metronome/` and open `http://localhost:4173/metronome/`: the app loads and the worker, icons and sounds work under the sub-path. (In PowerShell: `$env:GITHUB_PAGES='true'; npm run build; npx vite preview --base /metronome/`, then remove the variable.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json index.html pwa-assets.config.ts public src/main.ts
git commit -m "feat: installable offline PWA"
```

---

### Task 15: Windows desktop app with Tauri 2

**Files:**
- Create (generated, then edited): `src-tauri/**`
- Modify: `package.json` (dev dependency)

**Interfaces:**
- Consumes: `npm run dev` / `npm run build` / `dist/` (Tasks 1–14), `public/pwa-512x512.png` (Task 14).
- Produces: `npm run tauri dev`, and `npm run tauri build` → `src-tauri/target/release/bundle/nsis/Metronome_0.1.0_x64-setup.exe`.

- [ ] **Step 1: Install the CLI and initialise**

Run:
```bash
npm i -D @tauri-apps/cli@^2
npx tauri init --ci --app-name Metronome --window-title Metronome --frontend-dist ../dist --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"
```
Expected: `src-tauri/` with `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `capabilities/`, `icons/`, `tauri.conf.json` and its own `.gitignore`. If a flag is rejected, run `npx tauri init --help` and pass the same values under the flag names it lists.

- [ ] **Step 2: Configure** — replace `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Metronome",
  "version": "0.1.0",
  "identifier": "com.psymore.metronome",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Metronome",
        "width": 460,
        "height": 860,
        "minWidth": 360,
        "minHeight": 640,
        "resizable": true,
        "dragDropEnabled": false
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```
`dragDropEnabled: false` is required. Without it Tauri intercepts file drops on Windows and the HTML drop zone never receives them.

- [ ] **Step 3: Icons**

Run: `npx tauri icon public/icon.svg`. If the CLI rejects SVG, use `npx tauri icon public/pwa-512x512.png`.
Expected: `src-tauri/icons/` regenerated with the pink metronome icon.

- [ ] **Step 4: Run in development**

Run: `npm run tauri dev`. The first run compiles Rust dependencies, which takes a few minutes.
Expected: a native "Metronome" window opens with the app. Repeat the core checks:
- Play/pause, dial, keyboard and both visualisers work in sync.
- Uploading a sound via "Choose files" **and** via drag-and-drop from Explorer works.
- Add `?debug=1` by temporarily setting `"devUrl": "http://localhost:5173/?debug=1"`, and revert it after the check. Play at 120 BPM and **minimise the window for 2 minutes**. On restore, `skipped` is still 0 and the click never stopped (listen while minimised). If `skipped > 0`, add `"backgroundThrottling": "disabled"` to the window config, retest, and record the outcome in `docs/superpowers/FOLLOWUP.md` either way.

- [ ] **Step 5: Build the installer**

Run: `npm run tauri build`
Expected: `src-tauri/target/release/bundle/nsis/Metronome_0.1.0_x64-setup.exe`, a few MB. Install it and launch from the Start menu. The app works offline, settings and sounds persist across restarts, and there is no service-worker registration (it is guarded by `__TAURI_INTERNALS__`).

- [ ] **Step 6: Commit** (the target folder is ignored by `src-tauri/.gitignore`)

```bash
git add package.json package-lock.json src-tauri
git commit -m "feat: Windows desktop app via Tauri 2"
```

---

### Task 16: GitHub Actions CI and GitHub Pages deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run lint`, `npm run build`, and the `GITHUB_PAGES` base switch (Tasks 1 and 14).
- Produces: a CI check on every push/PR, and the PWA live at `https://psymore.github.io/metronome/`.

- [ ] **Step 1: CI workflow** — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run build
```

- [ ] **Step 2: Pages workflow** — `.github/workflows/pages.yml`

```yaml
name: Deploy PWA to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          GITHUB_PAGES: 'true'
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
If GitHub reports one of these action versions as deprecated when it runs, bump it to the current major.

- [ ] **Step 3: Verify locally that CI's commands pass**

Run: `npm ci && npm test && npm run lint && npm run build`
Expected: all green. Fix any Biome findings with `npm run format`, re-run, and review the diff.

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: test/lint/build workflow and GitHub Pages deploy"
```

- [ ] **Step 5: Ask the user before pushing**

Tell the user:
1. Pushing will publish all commits to `github.com/psymore/metronome`.
2. Before the first deploy they need to set **Settings → Pages → Build and deployment → Source: GitHub Actions** in the repo.

Only after they confirm, run `git push -u origin master`. Then check with `gh run list --limit 5` (or the Actions tab) that both workflows succeed, and open `https://psymore.github.io/metronome/`.

---

### Task 17: Architecture docs, README, final verification

**Files:**
- Create: `docs/architecture/README.md`, `docs/architecture/audio-engine.md`, `docs/architecture/visualizers.md`, `docs/architecture/sounds.md`, `docs/architecture/platforms.md`, `README.md`
- Modify: `CLAUDE.md` (Status section), `docs/superpowers/FOLLOWUP.md` (overwrite)

- [ ] **Step 1: Architecture docs**

`docs/architecture/README.md`:
```markdown
# Architecture docs

One doc per subsystem. Read the relevant one before touching that area.

| Doc | Covers |
|---|---|
| [audio-engine.md](audio-engine.md) | Scheduler, worker tick, AudioEngine, timing rules, debug overlay |
| [visualizers.md](visualizers.md) | Heard-time sync model, frame computation, renderers, controller |
| [sounds.md](sounds.md) | Built-in synthesis, uploads, IndexedDB storage, library cache and fallback |
| [platforms.md](platforms.md) | PWA, GitHub Pages base path, Tauri desktop build, CI |
```

`docs/architecture/audio-engine.md`:
```markdown
# Audio engine

Read this when touching `src/engine/**` or anything that affects when a click sounds.

- **Rule:** timers never decide when a click sounds. `src/engine/timerWorker.ts` posts `tick` every 25 ms. It only *wakes* `Scheduler.tick(ctx.currentTime)`, which schedules every beat with `time < now + 0.1 s` via `AudioBufferSourceNode.start(time)`.
- `Scheduler` (`scheduler.ts`) is pure and fully unit-tested. Beat times are accumulated (`next += 60 / bpm`), never re-measured, so they don't drift. Tempo changes apply from the next unscheduled beat. A signature that shrinks mid-bar wraps to a new downbeat. After a stall (`next < now`) missed beats are **skipped** on the same grid, never burst.
- `AudioEngine` (`audioEngine.ts`) owns the single `AudioContext`, master gain, accent/normal buffers and pending sources. `start()` must run inside a user gesture (it resumes the context). `stop()` stops pending sources and clears the timeline. Muted beats still go into the timeline for the visuals.
- Every scheduled beat is pushed into `BeatTimeline` (64 entries) for the visualisers.
- `?debug=1` shows `SchedulerStats`: `minLead` (smallest scheduling margin) must stay > 0 ms and `skipped` must stay 0. Use this to verify any change here, including with the tab hidden or the window minimised.
```

`docs/architecture/visualizers.md`:
```markdown
# Visualisers

Read this when touching `src/viz/**`.

- The visuals follow what is **heard**, not what was scheduled. `AudioEngine.heardTime(offset)` → `computeHeardTime` (`src/engine/clock.ts`): `getOutputTimestamp()` extrapolated to `performance.now()`, clamped to `ctx.currentTime`, falling back to `currentTime − outputLatency`, then minus the user sync offset (positive = later visuals).
- `computeFrame` (`frame.ts`, pure, tested) turns `(timeline.beatAt(heard), heard, settings)` into `{ activeBeat, phase, glow, … }`. Phase uses each beat's own `duration`, so animation works before the next beat is scheduled (slow tempos) and across tempo changes. Glow = `(1 − since/decay)²` with `decay = min(0.35 s, 0.9 × duration)`. Muted beats glow at 25 %.
- Renderers (`circular.ts`, `linear.ts`) are pure drawing functions of the frame and the theme. Geometry lives in `geometry.ts` (tested): beat 1 at 12 o'clock, clockwise, and the hand is on node k exactly at beat k.
- `VizController` runs requestAnimationFrame only while playing (plus one frame per `invalidate()`), sizes the canvas with ResizeObserver × devicePixelRatio, reads colours from the `--viz-*` CSS variables, and publishes the hub size as `--hub` so the DOM Play button sits on the hub.
- `prefers-reduced-motion`: no hand/stick; nodes still flash.
- To add a visualiser: implement `Visualizer` in `src/viz/`, add its kind to `VisualizerKind` and `sanitizeSettings`, pick it in `VizController.render`, and add a `.seg-btn` in `index.html`.
```

`docs/architecture/sounds.md`:
```markdown
# Sounds

Read this when touching `src/sounds/**` or `src/ui/soundDialog.ts`.

- Built-ins (`synth.ts`) are synthesised at the context's sample rate. Their ids are `builtin:click-high`, `builtin:click`, `builtin:wood` and `builtin:beep`. There are no audio asset files.
- Upload flow (`importSound.ts`, pure with injected deps): validate type/size → read → **decode a copy** (`decodeAudioData` detaches its buffer) → reject if 0 s or > 2 s → save the original bytes to IndexedDB (`soundStore.ts`, db `metronome`, store `sounds`, id `user:<uuid>`).
- `SoundLibrary` resolves an id to `PcmData`, trims leading silence (threshold 0.003, 1 ms pre-roll) so clicks aren't late, caches per id, and on any failure returns the slot's default built-in with an `error`. `main.ts#applySound` then resets the setting and shows a toast.
- Deleting a sound calls `library.forget(id)` and resets any slot using it.
```

`docs/architecture/platforms.md`:
```markdown
# Platforms

Read this when touching build config, the PWA, Tauri, or CI.

- **Web/PWA:** `vite-plugin-pwa` (generateSW, autoUpdate). Registration in `main.ts` is skipped inside Tauri (`'__TAURI_INTERNALS__' in window`). Regenerate icons from `public/icon.svg` with `npm run generate-pwa-assets`.
- **GitHub Pages:** `.github/workflows/pages.yml` builds with `GITHUB_PAGES=true`, which sets Vite `base` to `/metronome/`. The repo's Pages source must be "GitHub Actions".
- **Desktop:** Tauri 2 in `src-tauri/`. It runs on WebView2 (Chromium) on Windows. `npm run tauri dev` for development; `npm run tauri build` produces the NSIS installer in `src-tauri/target/release/bundle/nsis/`. `dragDropEnabled: false` is required for the HTML drop zone. No Tauri JS API is used.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, test, lint and build on every push/PR.
```

- [ ] **Step 2: README** — `README.md`

````markdown
# Metronome

A very precise metronome for the browser and Windows desktop, with your own click sounds and two visualisers that are locked to what you hear.

- **Sample-accurate timing:** Web Audio look-ahead scheduling, keeps time in background tabs and minimised windows.
- **Circular and linear visualisers:** a single hand sweeps the bar and each beat's sphere flashes exactly when its click is heard. A sync-offset slider covers Bluetooth latency.
- **Custom sounds:** upload or drag in short WAV/MP3/OGG/FLAC files for the accent and the other beats.
- 20–400 BPM, dial, tap tempo, 1–16 beats per bar, per-beat accent/normal/mute, keyboard shortcuts.

**Use it:** https://psymore.github.io/metronome/ (installable, works offline) · Windows installer: build with `npm run tauri build`.

## Keyboard

Space start/stop · ↑/↓ ±1 BPM (Shift ±5) · PgUp/PgDn ±10 · T tap · V switch visualiser

## Development

```bash
npm install
npm run dev          # http://localhost:5173 (add ?debug=1 for timing stats)
npm test             # unit tests
npm run lint
npm run build        # production web build → dist/
npm run tauri dev    # desktop app (needs the Rust toolchain)
npm run tauri build  # Windows installer
```

See `CLAUDE.md` and `docs/architecture/` for how it works.
````

- [ ] **Step 3: Update `CLAUDE.md`**

Replace the whole `## Status` section with:
```markdown
## Status

v0.1 is complete per `docs/superpowers/plans/2026-09-23-metronome.md`. For current work, see `docs/superpowers/FOLLOWUP.md`.
```

- [ ] **Step 4: Full verification pass**

Run: `npm ci && npm test && npm run lint && npm run build`. All green.

Then check the precision acceptance criteria (spec §3.4) in Chrome **and** in the installed desktop app, with `?debug=1` (for desktop, temporarily point `devUrl` at `?debug=1` in `npm run tauri dev`):
- 120 BPM for 10 minutes, including 2 minutes with the tab hidden or window minimised: `minLead > 0`, `skipped = 0`, no audible gaps.
- The same at 300 BPM.
- Watch the circular and linear views for a bar with the eyes half-closed: the flashes land with the clicks. Set the sync offset to +150 ms: the flashes are now visibly late. Reset it to 0.

Report the observed `minLead` values and anything that failed. Do not claim success without these numbers.

- [ ] **Step 5: Overwrite `docs/superpowers/FOLLOWUP.md`**

Replace the whole file with a fresh handoff containing:
- the date;
- "v0.1 complete: all 17 plan tasks done";
- the observed precision numbers from Step 4;
- the Tauri background-throttling outcome from Task 15;
- anything skipped or failing;
- the Pages URL status;
- likely next steps from the spec's non-goals (subdivisions, tempo ramps, a GitHub release workflow for the Windows installer via `tauri-apps/tauri-action`).

- [ ] **Step 6: Commit and (with permission) push**

```bash
git add README.md CLAUDE.md docs
git commit -m "docs: architecture docs, README and handoff"
```
Ask the user before `git push`, as in Task 16.
