# Polyrhythm visualization + existing-visualizer fixes

Date: 2026-09-28
Status: Approved, ready for implementation planning

## Context

Request: fix the Line visualizer's positioning relative to the timer/stage, reflow beat/rhythm spheres into rows of at most 4 instead of shrinking indefinitely on a single line, and add a new "Polyrhythm" mode reachable from the existing Signature control — a dedicated visualization showing two rhythmic layers (e.g. 3 events against 4 events) sharing one cycle, synchronized to the app's existing master clock, with no per-ratio static assets.

Decisions made during brainstorming:
- Polyrhythm is a **separate mode** that replaces the normal beats-per-bar click while active (not layered on top of it). Toggling it off restores prior signature settings.
- Both rhythmic layers are **audibly distinct** — each layer plays its own click sound, not a visual-only overlay.
- The ratio pickers support **2–16** events per layer.

## Non-goals

- No new wheel/scroll-picker widget or dependency — the existing `.stepper` (press-and-hold via `holdRepeat.ts`) pattern is reused.
- No independent timer/scheduler for the polyrhythm animation — one master clock only, per `CLAUDE.md`.
- No per-ratio image/SVG assets — geometry is computed at runtime from `a`/`b`.
- Circle visualizer's existing look is entirely unchanged by this feature — the beat-reflow fix (section 6) applies only to Line, not Circle.
- No changes to sound upload/library mechanics — Polyrhythm reuses existing sound ids via the existing sound picker's chip style.

## Architecture overview

All work stays inside the existing layered structure — no new rendering technology, no new state-management pattern, no new build tooling:

- **State**: `src/state/settings.ts` gains a `polyrhythm` field, validated in `sanitizeSettings` like every other field.
- **Timing**: `src/engine/scheduler.ts` gains a second scheduling path for polyrhythm mode, still built on the same look-ahead/`AudioContext.currentTime` accumulation rule — never a second timer.
- **Rendering**: `src/viz/polyrhythm.ts` implements the existing `Visualizer` interface (`src/viz/types.ts`) and is dispatched from `VizController` exactly like `circular.ts`/`linear.ts` are today.
- **UI**: `src/ui/signatureDialog.ts` gains a mode toggle; a new `src/ui/polyrhythmDialog.ts` (or an extension inside `signatureDialog.ts` — implementation plan decides based on file-size considerations) provides the two ratio steppers and sound chips.

## 1. Data model

`Settings` (`src/state/settings.ts`) gains:

```ts
polyrhythm: {
  enabled: boolean;
  a: number;        // layer A event count per cycle, 2–16
  b: number;        // layer B event count per cycle, 2–16
  soundIdA: string; // existing sound library id
  soundIdB: string; // existing sound library id
};
```

`DEFAULT_SETTINGS.polyrhythm = { enabled: false, a: 3, b: 4, soundIdA: <existing default click>, soundIdB: <existing default second sound> }`.

`sanitizeSettings` clamps `a`/`b` to `[2, 16]` (integers), falls back to default sound ids if the referenced id no longer exists in the sound library (same fallback pattern already used for the primary sound id), and defaults `enabled` to `false` on malformed input — consistent with every other boolean field's sanitize behavior.

When `polyrhythm.enabled` is `true`, `beatsPerBar`/`levels`/`subdivision` are not read by the scheduler or visualizer; they remain stored unchanged so turning `enabled` back off restores the prior standard-signature behavior exactly.

## 2. Timing: two voices, one clock

Since `beatsPerBar` is inert in polyrhythm mode (section 1), the cycle length is defined independently of it: one cycle is a fixed 4-beat measure at the current BPM, i.e. `cycleDuration = 4 * (60/bpm)`. This keeps "BPM controls how fast the pattern repeats" as the only mental model the user needs — a familiar quarter-note-beat feel — without resurrecting the standard-mode signature field.

For a cycle starting at `cycleStart` with that `cycleDuration`:

- Layer A event `i` (0-indexed, `i < a`) sounds at `cycleStart + (i / a) * cycleDuration`.
- Layer B event `i` (0-indexed, `i < b`) sounds at `cycleStart + (i / b) * cycleDuration`.

`Scheduler.tick(now)` in polyrhythm mode generates both layers' upcoming event times from the same `cycleStart`/`cycleDuration` pair (never independently re-measured, matching the existing anti-drift rule) and schedules whichever events fall inside the look-ahead window, calling `playBeat` with the appropriate sound id per layer. `cycleStart` advances by `cycleDuration` once a full cycle's events are scheduled — this is a direct generalization of the existing `nextTime += 60/bpm` accumulation, not a new mechanism.

Stall handling (skip missed beats, no catch-up burst) applies identically to both layers, reusing the existing `skipMissed` logic generalized over two event streams instead of one.

## 3. Visual sync: pure function of heard time

A new pure function (in `viz/frame.ts` or a sibling module) computes each layer's phase directly from `heardTime`, with no accumulated state:

```ts
function layerPhase(heardTime: number, cycleStart: number, cycleDuration: number, n: number): number {
  const t = ((heardTime - cycleStart) / cycleDuration) % 1; // 0..1 through the cycle
  return t * n; // fractional index into the n evenly-spaced events; floor = active event, frac = glow falloff
}
```

Both layers derive from the same `cycleStart`/`cycleDuration` the scheduler is using, read via the existing `VizSource`-style polling in `VizController.render()` (no event emitter introduced, consistent with current architecture). Because this is a pure function of `heardTime`, changing the ratio (`a`/`b`) or BPM takes effect on the very next computed frame with no manual resync: old audio events already scheduled before the change finish playing as scheduled (per the existing mid-stream-signature-change behavior noted in `CLAUDE.md`), and the next `tick()`/next frame computes geometry and phase from the new settings. No animation restart logic is needed — there is no persistent animation state to restart.

## 4. Rendering: runtime N-gon/M-gon geometry

New `src/viz/polyrhythm.ts`, implementing `Visualizer`. Reuses `VizController`'s existing canvas, `ResizeObserver`, DPR handling, theme (`VizTheme`), and rAF pause-on-hidden machinery unchanged.

**Static geometry** (recomputed only when `a`, `b`, or container size changes — cached the same way `nodeSprite.ts` caches idle nodes, not recomputed per frame):

```ts
function polygonVertices(n: number, center: {x,y}, radius: number): {x,y}[] {
  return Array.from({length: n}, (_, i) => {
    const angle = -Math.PI/2 + (2 * Math.PI * i) / n; // start at 12 o'clock
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}
```

Layer A's `a` vertices and Layer B's `b` vertices are both placed on circles inscribed in the same square stage region (reusing `.stage`'s existing `aspect-ratio: 1` box — no new fixed-pixel canvas). For 3:4 this renders as a square-ish 4-gon and a triangle sharing a center, satisfying the requested visual language without special-casing any specific ratio — the same code path handles 2:3 through 16:16.

Two vertex sets get distinct theme colors/line weights (e.g. accent vs. a secondary hue already defined in `VizTheme`) so the two layers are visually distinguishable without new decorative effects.

**Per-frame work**: only the active-vertex glow per layer (from `layerPhase`) is redrawn — outlines and vertex positions are cached geometry, drawn via cheap `ctx.stroke()`/`drawImage` calls, not rebuilt every frame. This mirrors the existing sprite-cache discipline in `nodeSprite.ts` and keeps per-frame cost roughly constant regardless of `a`+`b` size (up to 32 vertices total at the 16/16 max — well within Canvas 2D per-frame budget).

## 5. Fixing the Line visualizer's positioning

`src/viz/geometry.ts`'s `linearLayout` currently hardcodes the track's vertical position to `height * 0.36` — tuned by eye rather than derived from the stage's actual center. Fix: compute the track `y` from true vertical center of the square stage, adjusted only for node radius so nodes don't clip the canvas edge (the same kind of edge-inset math `circularLayout` already performs for its ring). This removes the arbitrary offset without changing the Line visualizer's stroke style, colors, or track/stick visual design — a pure positioning fix.

## 6. Beat-sphere reflow (≤4 per row) — Line visualizer only

**Correction (ruled during implementation, superseding the original wording below and in the plan's Task 3):** the reflow applies to the **Line visualizer only**. The Circle visualizer keeps its original behavior unchanged — all `n` beats stay on a single ring, shrinking as `n` grows, exactly as on `master`. A first implementation applied the row/column math to the Circle visualizer too, rendering it as concentric rings; this reads as a spiral rather than a clean dial and was explicitly rejected. `circularRingRadius` (in `geometry.ts`, from the original Task 2) is kept as a tested-but-currently-unused pure helper rather than deleted, in case a future circular use for it turns up — but nothing in this feature calls it.

Currently, `linear.ts` places `n` beat nodes by dividing a single track evenly, shrinking node size as `n` grows. New behavior: when node count exceeds 4, nodes wrap into rows of at most 4, centered, with consistent inter-node spacing preserved from the single-row case (not shrunk further to cram more per row).

This is implemented as new placement math in `geometry.ts` (row/column layout: `row = floor(i/4)`, `col = i % 4`, centered within the stage), applied only to linear canvas node placement and `linearBeatAt` hit-testing — not `circular.ts`/`circularBeatAt` (unchanged), and not the DOM `#beatRow` (`ui/controls.ts`), which already flex-wraps correctly and needs no change. Node draw order (left-to-right, top-to-bottom) preserves beat order per the acceptance criteria.

## 7. UI: Polyrhythm entry point + ratio picker

- `signatureDialog.ts`'s sheet gains a `.segmented` "Standard / Polyrhythm" radiogroup at the top, following the same `role="radio"`/`aria-checked`/`data-*` convention as its existing preset chips — not a new top-level button.
- Selecting "Polyrhythm" reveals two `.stepper` rows (Layer A, Layer B), each using the existing `−`/`output`/`+` stepper markup and `holdRepeat.ts` press-and-hold behavior, clamped to `[2, 16]`.
- Each layer gets a small sound-selection chip reusing the existing sound picker's compact chip style (not the full `soundDialog.ts` sheet — just enough to pick from already-available sounds).
- No new dependency, no new picker widget class — this is the "simplest lightweight solution that fits the existing design system," per the request's own explicit preference.

## 8. Interaction behavior

- Toggling `polyrhythm.enabled`, or changing `a`/`b`/sound ids, calls `store.set(...)` as usual; `main.ts`'s existing `store.subscribe(() => viz.invalidate())` picks up the change and redraws on the next frame — no special-case wiring needed.
- Per the pure-function-of-heard-time design in section 3, no explicit "restart animation" step is needed on ratio change — stale geometry cannot persist because geometry is recomputed from current settings every time it's needed, and phase is recomputed from current `heardTime` every frame.
- Audio timing stability: the scheduler continues to only ever push `nextTime`/`cycleStart` forward via accumulation; changing `a`/`b` changes what the *next* cycle's event times will be, without touching already-scheduled audio events, so there is no audible glitch or drift introduced by a live ratio change.

## 9. Responsive behavior

The Polyrhythm canvas reuses the existing `.stage` square box (`aspect-ratio: 1`, responsive `max-height` breakpoints already defined in `styles.css`) — no new fixed-pixel container. Geometry is computed from the container's actual pixel dimensions at draw time (same `ResizeObserver`-driven resize path `VizController` already uses for circular/linear), so the square stays square and the two polygons stay proportionally centered across mobile portrait, mobile landscape, and desktop without new breakpoint-specific code.

## 10. Visual design

Colors, glow, and active/inactive states come from the existing `VizTheme` (CSS-custom-property-derived), matching the rest of the app's instrument-panel aesthetic. No new visual language, ornamentation, or effects beyond distinguishing the two layers by existing theme hues.

## 11. Performance

- Geometry (vertex positions) is computed once per ratio/resize change and cached, not rebuilt every frame — same discipline as `nodeSprite.ts`.
- No per-ratio image/SVG assets are created or loaded — everything is trig computed from `a`/`b` at runtime, so 3:4 → 4:7 → 11:4 requires zero asset loading.
- Per-frame cost is bounded by vertex count (max 32 at the 16/16 cap), well within existing Canvas 2D per-frame budgets already proven by the circular/linear visualizers.
- No new DOM nodes per animation frame — pure canvas draw calls, consistent with existing visualizers.
- Audio timing remains completely decoupled from render frame rate: the scheduler's look-ahead tick is driven by the Worker, unaffected by rAF/visualizer performance.

## Testing

Unit-testable pure logic (added to `tests/`, mirroring `src/`):
- `polygonVertices` — vertex count, angle spacing, starting angle.
- `layerPhase` — phase correctness across a cycle, wraparound at cycle boundary.
- Two-layer cycle/event-time generation in the scheduler extension — no drift across many cycles, correct behavior when `a`/`b` change mid-stream.
- `sanitizeSettings` — clamping `a`/`b` to `[2,16]`, sound id fallback, `enabled` default.
- Reworked `linearLayout` — track vertically centered, correct edge inset.
- Beat-sphere row/column placement — correct row/col for various `n`, order preserved.

Canvas drawing output and dialog wiring remain manual-verification, per the project's existing split between unit-tested pure logic and manually-verified browser glue.

## Files touched

- `src/state/settings.ts` — new `polyrhythm` field, default, sanitize.
- `src/engine/scheduler.ts` — two-layer event generation for polyrhythm mode.
- `src/viz/geometry.ts` — `linearLayout` centering fix, multi-row node placement, `polygonVertices`.
- `src/viz/frame.ts` (or new sibling) — `layerPhase` / polyrhythm frame computation.
- `src/viz/polyrhythm.ts` — new `Visualizer` implementation.
- `src/viz/vizController.ts` — dispatch to polyrhythm renderer.
- `src/viz/linear.ts` — apply multi-row node placement. `src/viz/circular.ts` is *not* touched by this (see the correction in section 6).
- `src/ui/signatureDialog.ts` — mode toggle; `src/ui/polyrhythmDialog.ts` (new, if split out) — ratio steppers + sound chips.
- `src/ui/polyrhythmDialog.ts` — wired in `main.ts` alongside other `mount*` calls.
- `index.html` / `src/styles.css` — new dialog markup/styles, minor additions only, reusing existing `.stage`/`.stepper`/`.segmented`/`.chip` classes.
- `tests/` — new test files mirroring the above pure-logic modules.
