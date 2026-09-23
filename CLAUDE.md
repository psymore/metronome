# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session continuity: the `FOLLOWUP` keyword

When the user's message is just `FOLLOWUP` (case-insensitive, nothing else needed), read `docs/superpowers/FOLLOWUP.md` in full and act on it immediately. Don't ask what to do; pick up the work it describes. This works the same mid-session or as the first message of a brand-new session. The file is the authoritative handoff note, more current than anything else in this repo about what's in progress.

Keep `docs/superpowers/FOLLOWUP.md` up to date. Whenever the user asks for a followup/handoff summary, or a natural stopping point is reached after substantial work, overwrite it with a fresh summary, what's open, and likely next steps. Don't append: replace the whole file each time.

## Status

Being built from `docs/superpowers/plans/2026-09-23-metronome.md` (spec: `docs/superpowers/specs/2026-09-23-metronome-design.md`, visual reference: `docs/superpowers/specs/reference-ui.jpg`). Until the plan's final task is done, the plan and spec are the source of truth. Tick the plan's checkboxes as steps complete.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173 (add ?debug=1 for scheduler stats)
npm test             # Vitest unit tests (node env, tests/ mirrors src/)
npm run lint         # Biome check; `npm run format` applies fixes
npm run build        # tsc type-check + production build → dist/
npm run tauri dev    # Windows desktop app (Tauri 2, needs Rust)
npm run tauri build  # NSIS installer → src-tauri/target/release/bundle/nsis/
```

## Architecture

A precise metronome that runs as a web app, an offline PWA (GitHub Pages, `/metronome/` base) and a Tauri 2 Windows app. All three share the same TypeScript + Vite code with no UI framework. `src/main.ts` is the composition root. Pure logic (scheduler, timeline, clock, settings, sounds pipeline, visualiser geometry and frame) is unit-tested; browser glue (`audioEngine.ts`, renderers, `ui/*`) is verified manually.

| Touching... | Read |
|---|---|
| Scheduling, the worker tick, AudioEngine, timing precision | `docs/architecture/audio-engine.md` |
| Circular/linear visualisers, heard-time sync, canvas | `docs/architecture/visualizers.md` |
| Built-in/uploaded sounds, IndexedDB, sound sheet | `docs/architecture/sounds.md` |
| PWA, GitHub Pages, Tauri, CI | `docs/architecture/platforms.md` |

(These docs are written in the plan's final task. Until then, use the matching spec sections.)

## Rules that are easy to break

- `setTimeout`/`setInterval`/`requestAnimationFrame` never decide **when** a click sounds. Only `AudioContext.currentTime` + `source.start(time)` via the look-ahead `Scheduler` does. Beat times are accumulated (`next += 60 / bpm`), never re-measured.
- After a stall the scheduler skips missed beats; it never plays a burst of catch-up clicks.
- Visuals are a pure function of the **heard** time (`AudioEngine.heardTime`), not of scheduling time or frame count.
- `decodeAudioData` detaches its ArrayBuffer: decode a copy when the bytes are still needed.
- Every `localStorage`/IndexedDB access can throw (private windows): wrap it and fall back.
- Tauri's window must keep `dragDropEnabled: false`, or HTML drag-and-drop of sound files breaks on Windows.
- No new runtime dependencies without a strong reason (currently only `idb-keyval`).
