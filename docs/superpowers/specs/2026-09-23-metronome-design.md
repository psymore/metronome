# Metronome — Design Spec

Date: 2026-09-23
Status: Approved for implementation
Plan: `docs/superpowers/plans/2026-09-23-metronome.md`
Visual reference: `docs/superpowers/specs/reference-ui.jpg` (open it — the circular visualiser and control panel are modelled on it)

## 1. What we are building

A very precise metronome that runs:

1. in the browser (any modern Chromium / Firefox / Safari),
2. as an installable offline PWA (deployed to GitHub Pages at `https://psymore.github.io/metronome/`),
3. as a standalone Windows desktop app (`.exe` installer) via Tauri 2.

The same web code runs in all three. Users can replace the click with their own short audio files. Two switchable visualisers (circular and linear) are locked to the audio clock so the visuals land on the exact moment the click is heard.

### Goals

- **Sample-accurate clicks.** No audible jitter or drift at any tempo, including when the tab is in the background or the desktop window is minimised.
- **Visuals synced to what the user hears**, not to when sounds were scheduled.
- **Custom sounds**: upload, preview, choose separately for the accent (beat 1) and for the other beats, delete. They persist across restarts.
- **Fast**: first paint under 1 s on a mid-range laptop, 60+ fps visualiser, tiny bundle (no UI framework).

### Non-goals (v1)

Subdivisions (8ths/16ths/triplets), polyrhythms, sheet music, interval/practice timers, tempo ramps, MIDI, mobile app stores, macOS/Linux desktop builds (Tauri would build them, but they are untested and use WebKit audio), light theme, i18n. The reference image shows some of these (16TH, TRIP, TIMER, bottom tabs); **do not build them**.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict), ES modules |
| Build/dev | Vite |
| UI | No framework — plain DOM + one `<canvas>` |
| Audio | Web Audio API: look-ahead scheduler + Web Worker timer |
| Storage | `localStorage` for settings, IndexedDB (via `idb-keyval`) for sound files |
| PWA | `vite-plugin-pwa` (generateSW) + `@vite-pwa/assets-generator` for icons |
| Desktop | Tauri 2 (Windows, NSIS installer); near-zero Rust, no Tauri JS API used |
| Tests | Vitest (node env) + `fake-indexeddb` |
| Lint/format | Biome |
| CI/CD | GitHub Actions: test + lint + build on push/PR; deploy PWA to GitHub Pages from `master` |

Why Tauri over Electron: on Windows, Tauri uses WebView2 (Chromium), so Web Audio behaves exactly like Chrome, with a ~5–10 MB installer instead of ~100 MB. The metronome needs no Node main process: no secrets, no OAuth, no local HTTP server.

## 3. Timing architecture (the core requirement)

### 3.1 Rule

`setTimeout`/`setInterval`/`requestAnimationFrame` **never** decide when a click sounds. They only wake the scheduler. The **AudioContext clock** (`ctx.currentTime`) is the only timeline. Every click is placed with `AudioBufferSourceNode.start(exactTime)`, which is sample-accurate.

### 3.2 Scheduler (pure, unit-tested — `src/engine/scheduler.ts`)

- Wake-up: a Web Worker posts `tick` every **25 ms**. Worker timers are throttled far less than main-thread timers. Chromium also exempts audible pages from intensive throttling.
- On each tick the scheduler schedules every beat whose time is `< now + LOOKAHEAD`, where **LOOKAHEAD = 0.1 s**. A tick that arrives late does no harm as long as it is less than ~75 ms late.
- First beat: `start(now)` schedules beat 1 at `now + 0.05 s` (START_DELAY). It is always the accented downbeat of bar 0.
- Next beat time is computed by **adding** `60 / bpm` to the previous beat time. It is never re-measured from wall-clock time, so there is no cumulative drift.
- **Tempo change**: takes effect from the next beat that has not been scheduled yet (≤ 100 ms latency). Already-scheduled beats are not moved.
- **Time-signature change**: takes effect at the next unscheduled beat. If the current beat index is now ≥ the new beats-per-bar, it wraps to beat 1 of a new bar. There is no double downbeat and no out-of-range index.
- **Stall/sleep policy**: if the scheduler finds `nextTime < now` (the tab was suspended or the laptop slept), it **skips** the missed beats while keeping the beat grid and bar position. It must never play a burst of catch-up clicks. Skipped beats are counted in stats.
- **Stats** (for the debug overlay): `scheduled`, `minLead` (the smallest `beat.time − now` at scheduling time, in seconds), and `skipped`. `minLead > 0` for the whole session proves no click was ever scheduled late.

Each scheduled beat produces a `BeatEvent`:
```ts
{ time: number; duration: number; beatInBar: number; beatsPerBar: number; barIndex: number; level: 'accent' | 'normal' | 'mute' }
```
`duration` is `60 / bpm` at the moment of scheduling. The visualisers use it to animate between beats even when the next beat is not scheduled yet (at 20 BPM a beat lasts 3 s but the look-ahead is 0.1 s).

### 3.3 Audio engine (`src/engine/audioEngine.ts`)

- One `AudioContext({ latencyHint: 'interactive' })`, created at startup and **resumed inside the Play click handler** (autoplay policy).
- Master `GainNode` for volume.
- Beat voices: one `AudioBufferSourceNode` per click, from the accent or normal buffer. `mute` beats schedule no sound but still go into the timeline so the visuals show them.
- Stop: stops every source still pending/playing, then clears the timeline.
- If the context leaves `running` while the metronome is on (device change, OS interruption), try `ctx.resume()`.

### 3.4 Precision acceptance criteria

With `?debug=1`, in Chrome and in the Tauri build, running at 120 BPM and at 300 BPM for 10 minutes, including 2 minutes with the tab hidden or the window minimised:
- `minLead` stays **> 0 ms** and `skipped` stays **0**.
- There are no audible gaps or doubled clicks.

## 4. Visualisers

### 4.1 Sync model

1. The scheduler pushes every `BeatEvent` into a `BeatTimeline` ring buffer (64 entries).
2. Every animation frame computes **heard time**, the AudioContext time of the sample leaving the speakers now:
   - Preferred: `ts = ctx.getOutputTimestamp()`, then `ts.contextTime + (performance.now() − ts.performanceTime) / 1000`. Clamp to ≤ `ctx.currentTime`.
   - Fallback (no timestamp, or `performanceTime` is 0): `ctx.currentTime − (ctx.outputLatency || ctx.baseLatency || 0)`.
   - Then subtract the user's **sync offset** (`syncOffsetMs / 1000`; range −200…+200 ms, default 0). A positive value delays the visuals, which is needed for Bluetooth headphones that under-report latency.
3. `beat = timeline.beatAt(heardTime)`: the latest beat with `time ≤ heardTime`.
4. `phase = clamp((heardTime − beat.time) / beat.duration, 0, 1)`.
5. `glow = (1 − since/decay)²` for `0 ≤ since < decay`, else 0, where `since = heardTime − beat.time` and `decay = min(0.35 s, 0.9 × beat.duration)`. Muted beats glow at 25 %.

Every drawn pixel is a pure function of `(beat, phase, glow, settings)`. This is why tempo and signature changes stay in sync automatically.

### 4.2 Circular (default) — modelled on `reference-ui.jpg`

- One ring. N beat nodes (spheres) are spaced evenly on it. **Beat 1 is at the top (12 o'clock)** and the others follow clockwise (for 4/4: top, right, bottom, left, as in the reference). Beat numbers sit just outside each node.
- Each node has a spoke from the hub edge to the node.
- **A single hand ("stick")** runs from the hub edge to the ring and rotates clockwise continuously. Its angle is `−90° + 360° × (beatInBar + phase) / N`, so it lands exactly on node *k* at the instant beat *k* is heard and completes one revolution per bar.
- When the hand reaches a node, that node **flashes**: it grows by up to 30 %, gets a big glow and a white core, and fades out per the glow formula. Accent nodes are 25 % larger and brighter pink. Muted nodes are hollow grey rings.
- The **Play/Pause button is a DOM button centred on the hub**. The canvas publishes the hub diameter as the CSS variable `--hub` on the stage.
- When stopped, no hand is drawn and nodes are at rest (still softly lit).

### 4.3 Linear

- A horizontal track with N nodes at `left + width × i / N` and a bar-end line at the right edge. Each node has a short vertical tick (the "spoke").
- A vertical stick moves left→right: `x = left + width × (beatInBar + phase) / N`. It is on node *k* when beat *k* is heard and snaps back to node 1 at the bar line.
- Same node flash, accent and mute styling as the circular view. The Play button sits below the track (72 % of the stage height).

### 4.4 Behaviour

- Switch with the **Circle / Line** segmented control or the **V** key. The choice is persisted.
- Canvas is sized with `ResizeObserver` × `devicePixelRatio` (crisp on HiDPI). It redraws every frame only while running, and once after any settings change or stop.
- `prefers-reduced-motion: reduce`: the hand/stick is not drawn; nodes still flash.

## 5. Custom sounds

- Two slots: **Accent** (beat 1, or any beat set to accent) and **Other beats**. Each slot has a `<select>` listing built-in and user sounds, plus a ▶ preview button.
- Built-in sounds are synthesised in code (no asset files): `builtin:click-high` (default accent), `builtin:click` (default normal), `builtin:wood`, `builtin:beep`. Each is a sine burst with a 0.5 ms fade-in, exponential decay and a 2 ms fade-out, with its onset within the first millisecond.
- Upload: a file picker (multiple) or drag-and-drop onto the sound sheet.
  - Accept if the MIME type is `audio/*` **or** the extension is one of `.wav .mp3 .ogg .oga .flac .m4a .aac .webm .opus`.
  - Size: > 0 and ≤ **2 MB**.
  - Must decode with `decodeAudioData`; decoded duration must be > 0 s and ≤ **2 s**.
  - **Pass a copy** (`bytes.slice(0)`) to `decodeAudioData`, because it detaches the ArrayBuffer and the original bytes are still needed for storage.
- Storage: the original bytes go into IndexedDB (`idb-keyval`, db `metronome`, store `sounds`) as `{ id: 'user:<uuid>', name, bytes, addedAt }`. The display name is the filename without its extension, max 40 characters.
- On load, **leading silence is trimmed** (the first sample ≥ 0.003 in any channel, minus 1 ms of pre-roll). Many downloaded samples start with 10–50 ms of silence, which would make every click sound late.
- Decoded sounds are cached per id. Deleting a sound removes it from the cache and resets any slot that used it to that slot's default.
- If a selected sound can't be loaded (deleted, IndexedDB blocked, decode fails), the slot falls back to its default built-in, the setting is reset, and a toast explains why.

## 6. Settings & persistence

`localStorage['metronome.settings.v1']` holds JSON:

| Field | Type / range | Default |
|---|---|---|
| `bpm` | integer 20–400 | 120 |
| `beatsPerBar` | integer 1–16 | 4 |
| `beatUnit` | 2, 4, 8 or 16 (label only; BPM = clicks per minute) | 4 |
| `levels` | `('accent'|'normal'|'mute')[]` of length `beatsPerBar` | `['accent','normal','normal','normal']` |
| `visualizer` | `'circular' \| 'linear'` | `'circular'` |
| `syncOffsetMs` | integer −200…200 | 0 |
| `volume` | 0–1 | 0.8 |
| `accentSoundId` / `normalSoundId` | non-empty string < 200 characters | `builtin:click-high` / `builtin:click` |

All loaded data goes through `sanitizeSettings`: every field is independently clamped or defaulted, and corrupt JSON gives the defaults. Storage access is wrapped in try/catch (private mode or blocked storage must not crash the app). When the beat count changes, existing levels are kept and new beats default to `normal` (beat 1 defaults to `accent`).

## 7. UI

Dark, "hardware" look taken from the reference image: near-black background (`#141416`), bolted metal-style panels, hot pink accent `#ff2f7d` with glows, light grey ring, uppercase letter-spaced labels. Portrait layout (max-width 480 px) on narrow windows. Two columns (stage | controls) at ≥ 900 px width.

Top to bottom:
1. **Top bar**: title "Metronome" and the Circle/Line segmented switch.
2. **Stage**: a square canvas with the visualiser and the Play/Pause button on the hub.
3. **Beat row**: one round button per beat (numbered). Clicking cycles accent → normal → mute.
4. **Control panel**:
   - left column: Signature button (shows e.g. 4 over 4) and Sound button;
   - centre: the **BPM dial**, a silver knob with ticks and a pink indicator, value and "BPM" in the centre, with − and + nudge buttons;
   - right column: Tap button and Settings button.
5. A toast area for errors and notices.

Controls:
- **BPM dial**: pointer-drag rotation (4° per BPM, clockwise = faster, unlimited turns), mouse wheel ±1 (Shift ±5), − and + buttons ±1. The dial ring rotates by `bpm × 4°`.
- **Tap tempo**: the average interval of the last ≤ 6 taps. The sequence resets after 3.1 s without a tap. Result is clamped and rounded.
- **Signature sheet** (`<dialog>`): numerator stepper 1–16, unit buttons 2/4/8/16, presets 2/4 3/4 4/4 5/4 6/8 7/8 12/8. Changes apply live.
- **Sound sheet** (`<dialog>`): as in section 5.
- **Settings sheet** (`<dialog>`): volume slider (0–100 %); sync-offset slider (−200…+200 ms) with the live value and a one-line explanation; "Reset all settings" button (sounds are kept).
- **Keyboard** (ignored while focus is in a dialog, input, select or textarea, or when Ctrl/Alt/Meta is held):

| Key | Action |
|---|---|
| Space | Start/stop (key repeats are ignored) |
| ↑ / → | +1 BPM (Shift: +5) |
| ↓ / ← | −1 BPM (Shift: −5) |
| PageUp / PageDown | ±10 BPM |
| T | Tap tempo |
| V | Switch visualiser |

- `?debug=1` shows a small overlay: scheduled, minLead (ms), skipped, outputLatency, baseLatency, AudioContext state and sample rate.

## 8. Platform notes

- **PWA**: the service worker is registered only when not running inside Tauri (`!('__TAURI_INTERNALS__' in window)`). It precaches all built assets, so the app works offline.
- **GitHub Pages**: the build uses Vite `base: '/metronome/'` when `GITHUB_PAGES=true`, otherwise `/` (dev, Tauri).
- **Tauri**: window "Metronome" is 460×860 by default (min 360×640) and resizable. Identifier `com.psymore.metronome`. Bundle target `nsis`. The dev server is on port 5173 (strict).

## 9. Error handling

| Situation | Behaviour |
|---|---|
| `ctx.resume()` rejects on Play | Stay stopped; toast "Audio could not start: …" |
| Uploaded file is not audio, too big, won't decode, too long, or silent | Reject with a specific toast; nothing is stored |
| IndexedDB blocked or full on save | Toast "Could not save the sound. Browser storage may be full or disabled (private window)." |
| Selected sound missing or broken at load | Fall back to the slot default, reset the setting, toast |
| Listing user sounds fails | Toast; the sheet still shows the built-ins |
| `localStorage` corrupt or blocked | Defaults; the app still works (settings just don't persist) |
| Canvas 2D unavailable | Throw at startup (unsupported browser) |

## 10. Testing

- **Unit (Vitest, node)**: timing math, scheduler (window, drift, bars, tempo change, signature change, stall skip, stop, stats), timeline, heard-time clock, settings sanitise/load/save, store, tap tempo, dial math, synth, silence trim, file validation, import flow (with a fake decoder that detaches its input), sound store (`fake-indexeddb`), sound library (cache, trim, fallback), visualiser geometry and frame computation.
- **Manual**: the browser/Tauri checklists in the plan, including the precision criteria in 3.4 and an audio–visual sync check (the flash coincides with the click; the sync offset visibly shifts it).
- **CI**: `npm ci && npm test && npm run lint && npm run build` on every push/PR.

## 11. Project conventions (mirroring `interval-timer`)

- `CLAUDE.md` at the root: commands, architecture summary, and a "Touching… → Read…" table pointing into `docs/architecture/`.
- `docs/architecture/`: one doc per subsystem (`audio-engine.md`, `visualizers.md`, `sounds.md`, `platforms.md`) plus a `README.md` index.
- `docs/superpowers/FOLLOWUP.md`: a session handoff note. When the user sends just `FOLLOWUP`, read it and continue. It is overwritten, not appended, at every stopping point.
