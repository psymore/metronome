# Metronome — v2 ideas

Date: 2026-09-24
Status: Proposed, not started
Checkpoint: commit `da4fb52` — everything before this doc is the stable base to revert to if v2 work goes wrong.

## Context

v1 (see `2026-09-23-metronome-design.md`) covers the core goal: sample-accurate clicks, a beat visualiser synced to the heard time, custom sounds, and a finished "instrument panel" visual identity. v1's own non-goals list (subdivisions, polyrhythms, tempo ramps, practice timers, MIDI) was deliberately scoped out — v2 should stay small and additive, not reopen that scope.

None of the below is committed to. Pick one, size it, then follow the same build → lint → test → live-device check loop v1 used.

## Candidate features

### 1. Tempo marking label
Show the classical Italian term (Largo, Andante, Allegro, Presto, etc.) next to the BPM number, updating live as the dial turns. Cheap, no new interaction, reinforces the instrument aesthetic already established (serif "engraved" numerals).

- Needs: a BPM → term lookup table (pure, testable), a small label element near `.bpm-value` in `index.html`/`styles.css`.

### 2. Beat haptics
Vibrate briefly on each beat on supported devices (`navigator.vibrate`), useful for practicing with sound off or in noisy rooms.

- Needs: hook into the same heard-time callback the visualiser uses, guarded by a settings toggle (some users will find it annoying) and a `navigator.vibrate` capability check (not available on iOS Safari — must degrade silently).

### 3. Accent flash
A brief pulse/glow on the play button (or a screen-edge glow) on the downbeat, separate from the canvas visualiser — reinforces the beat even when not looking at the circle/line.

- Needs: a CSS animation triggered from the same frame-scheduling code that drives the canvas draw, careful not to fight `prefers-reduced-motion`.

### 4. Swipe to switch visualiser
Swipe left/right on the stage to switch Circle/Line, in addition to the existing toggle tap.

- Needs: a touch gesture handler on `#stage`, careful not to conflict with the canvas's existing tap-to-cycle-beat handling.

## Explicitly out of scope for v2

Carried over from v1's non-goals and still true: subdivisions, polyrhythms, sheet music, practice/interval timers, tempo ramps, MIDI, mobile app stores, light theme, i18n.

## How to revert if v2 goes wrong

```
git log --oneline   # find da4fb52
git reset --hard da4fb52   # discards everything after the checkpoint — confirm with the user first
```
