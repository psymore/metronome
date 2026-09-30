# Subdivision Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project overrides (from `docs/superpowers/FOLLOWUP.md`, standing):** never use a git worktree —
> plain local branch in the main working directory. Never add `Co-Authored-By` or any attribution
> line to a commit. Don't push; report the commit range when done.

**Goal:** Let the player build their own rhythm by switching individual subdivision clicks on and
off. Examples: only the "e" and "a" of 16ths, or a triplet with its middle click dropped. The
switches are edited in the Signature dialog, or by tapping the subdivision dots on the
visualiser.

**Architecture:**
- **State:** A new `subOff: boolean[]` setting, flat, index `beat * (sub − 1) + (k − 1)`. An empty
  or short array means "all on". It is reset whenever the signature or the subdivision changes.
- **Scheduler:** Skips an off click.
- **Visualiser:** Draws on dots filled in the theme color and off dots as hollow rings. Only on
  dots flash.
- **Direct taps:** When the dots are far enough apart to hit with a finger (≥ 32px), tapping one
  toggles it.
- **Fan taps:** When the dots are closer than that, tapping a dot group makes it *fan out*
  (animated, like the polyrhythm pair split) into a row of big dots. Tap one to toggle it. Any
  other tap closes the fan.
- **Dialog:** The Signature dialog's beat row gets a small toggle per subdivision click after each
  beat.

**Tech Stack:** Vite + TypeScript, no framework. Vitest (node env) for the pure parts. Canvas
drawing and DOM are verified manually in the browser.

**Spec:** No spec file. The source is the chat with the user on 2026-09-30. The user's decisions
are below and are not to be re-opened.

## Settled decisions

User's choices:
- **Where to edit:** both the Signature dialog (A) and tapping on the visualiser (B).
- **When the fan kicks in:** whenever the dots are too small to tap. The spacing between
  neighbouring dots in the current view is under `SUB_TAP_MIN_SPACING` (32px). Not a fixed
  "8+ beats" rule, because the line view at 4/4 16ths is already ~10px apart.
- **How an opened group looks:** a fan inside the visualiser. The group's dots animate out of
  their places into a row of big (tap-sized) dots, the same way polyrhythm pairs split.
- **Colors:** an on dot is a solid disc in the theme's node color (brighter than today's dim
  disc). An off dot is a hollow ring, like a muted beat. Only on dots flash when heard.

Planner's defaults (the user may still override; ask them if unsure):
- **Values:** on/off only, no levels. Default all on.
- **Resets:**
  - A signature change (preset, beats ±, note value) resets the pattern to all on, as it
    already does for accents.
  - A subdivision change (Off/8ths/Triplets/16ths) resets it too.
  - Reset-all-settings resets it too.
- **Tap switch:** the existing "Beats — tap directly on the visualiser" switch
  (`beatsClickable`) also governs tapping dots. When it's off, the visualiser ignores all taps,
  as today.
- **One fan at a time:**
  - Tapping a dot in the open fan toggles it and keeps the fan open.
  - Any other tap closes the fan and does nothing else.
  - The fan also closes by itself when the signature, the subdivision or the visualiser changes.
- **Where the fan opens:**
  - Circle view: **outward**, away from the circle's center along the group's outward normal
    (the user's call).
    - The square stage's corners have ~100px of room outside the ring. The top, bottom and
      sides have only ~35px, so a fan near 12/3/6/9 o'clock gets pushed back inward by the
      in-canvas clamp and may overlap the ring there. That's expected. The backdrop pill keeps
      it readable.
  - Line view: above the row.
  - Either way the row of dots is shifted back inside the canvas if it would overflow.
- **Priority of a tap:**
  1. open fan
  2. close fan
  3. beat node (tight radius)
  4. subdivision dot or group
  5. beat node (the existing generous radius)

  Taps meant for a beat node still land where they did; the dots only take taps that are
  clearly theirs.

## Global Constraints

- `setTimeout`/`setInterval`/`requestAnimationFrame` never decide **when** a click sounds. The
  scheduler decides whether an off subdivision click is scheduled at all. The visuals only
  *show* it (CLAUDE.md).
- Visuals are a pure function of the **heard** time (`computeFrame`), never of scheduling time.
- Idle beat-node sprites are unaffected: subdivision dots are drawn live, never cached.
- Every `localStorage` access can throw. The setting goes through the existing
  `sanitizeSettings`/store path, so no new storage code.
- No new dependencies.
- Every visible or aria string goes through i18n (English + Turkish).
  `tests/i18n/i18n.test.ts` checks key parity.
- Touch targets: dialog toggles ≥ 28px hit and ≥ 30px center-to-center. Fan dots have a 44px
  pitch. Direct taps only happen at ≥ 32px spacing, by construction.
- Polyrhythm is untouched: it has no subdivisions, and its visualiser path returns early.
- Files written from scripts on this Windows machine must stay LF. Python's text mode writes
  CRLF, which Biome rejects. Prefer the Edit tool, or `open(p, 'w', newline='\n')`.

## Review Focus

1. **Compound meters:** In 6/8, 9/8 and 12/8 the effective subdivision is 1 (`patternFromSettings`).
   No dots, no toggles in the dialog, and a stale `subOff` must never mute a real beat.
2. **Changing beats or subdivision mid-play:** The pattern resets, an open fan closes, and
   `subOff` never indexes past the new layout. `isSubOn` treats out-of-range as on.
3. **Tap disambiguation at 16 beats with 16ths:**
   - A beat node must still cycle its level when tapped on its body.
   - Opening a fan must not also cycle a node.
   - Tapping anywhere while a fan is open must only close it.
4. **Reduced motion:** The fan must open and close instantly (frac jumps 0↔1), not hang
   half-open. Same rule as `currentSplitFrac`.
5. **Line view, last beat of a row:** Its gap to the bar line is half a cell. Its dots are the
   smallest, so in that layout the fan must still be reachable there and stay inside the canvas.

---

### Task 1: `subOff` state and helpers

**Files:**
- Modify: `src/state/settings.ts`
- Modify: `src/ui/signatureDialog.ts:58-62` (subdivision chips use the new helper)
- Test: `tests/state/settings.test.ts`

**Interfaces:**
- Produces:
  - `Settings.subOff: boolean[]`
  - `isSubOn(subOff: readonly boolean[], sub: number, beat: number, k: number): boolean`
  - `toggleSub(subOff: readonly boolean[], beatsPerBar: number, sub: number, beat: number, k: number): boolean[]`
  - `withSubdivision(subdivision: Subdivision): Pick<Settings, 'subdivision' | 'subOff'>`
  - `withSignature` now also returns `subOff: []`
  - `Pattern.subOff` is filled by `patternFromSettings`

- [ ] **Step 1: Write the failing tests** (append to `tests/state/settings.test.ts`, importing the
  new names)

```ts
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
    const s = { ...defaultSettings(), subdivision: 2 as const, subOff: [true, false, false, false] };
    expect(patternFromSettings(s).subOff).toEqual([true, false, false, false]);
    expect(patternFromSettings({ ...s, ...withSignature(6, 8), subOff: [true] }).subOff).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/settings.test.ts`
Expected: FAIL (`isSubOn`/`toggleSub`/`withSubdivision` not exported).

- [ ] **Step 3: Implement**

In `src/state/settings.ts`:
- Add to `Settings`, after `subdivision`:

```ts
  /** Subdivision clicks switched off, flat, index `beat * (subdivision − 1) + (k − 1)` for click
   *  k (1..subdivision−1) after beat `beat`. Missing entries are on; reset to [] on any signature
   *  or subdivision change. */
  subOff: boolean[];
```

- `DEFAULT_SETTINGS.subOff: []`, and `defaultSettings()` copies it: `subOff: []`.
- Helpers, next to `cycleBeatLevel`:

```ts
/** Whether subdivision click k (1..sub−1) after beat `beat` plays. Out of range = on. */
export function isSubOn(subOff: readonly boolean[], sub: number, beat: number, k: number): boolean {
  if (sub <= 1 || k < 1 || k >= sub) return true;
  return subOff[beat * (sub - 1) + (k - 1)] !== true;
}

/** Flips one subdivision click, returning a full-length array for the current layout. */
export function toggleSub(
  subOff: readonly boolean[],
  beatsPerBar: number,
  sub: number,
  beat: number,
  k: number,
): boolean[] {
  const size = beatsPerBar * Math.max(0, sub - 1);
  const next = Array.from({ length: size }, (_, i) => subOff[i] === true);
  if (sub > 1 && beat >= 0 && beat < beatsPerBar && k >= 1 && k < sub) {
    const i = beat * (sub - 1) + (k - 1);
    next[i] = !next[i];
  }
  return next;
}

/** A subdivision change resets the on/off pattern (its layout just changed). */
export function withSubdivision(subdivision: Subdivision): Pick<Settings, 'subdivision' | 'subOff'> {
  return { subdivision, subOff: [] };
}
```

- `withSignature` returns `{ beatsPerBar: clamped, beatUnit, levels: …, subOff: [] }`. Widen its
  `Pick` to include `'subOff'`.
- `patternFromSettings` adds `subOff: compound ? [] : s.subOff`.
- `sanitizeSettings`: after `subdivision` is resolved, compute:

```ts
    subOff: (() => {
      const sub = isSubdivision(r.subdivision) ? r.subdivision : d.subdivision;
      const expected = beatsPerBar * (sub - 1);
      return Array.isArray(r.subOff) && r.subOff.length === expected
        ? r.subOff.map((v) => v === true)
        : [];
    })(),
```

In `src/engine/scheduler.ts` add to `Pattern`:

```ts
  /** Subdivision clicks switched off (see Settings.subOff); missing = on. */
  subOff?: readonly boolean[];
```

In `src/ui/signatureDialog.ts` (~line 61) replace `store.set({ subdivision })` with
`store.set(withSubdivision(subdivision))` and import `withSubdivision`.

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run tests/state && npx tsc --noEmit`
Expected: PASS. If other tests build a `Settings` literal, add `subOff: []` there.

- [ ] **Step 5: Commit**

```bash
git add src/state/settings.ts src/engine/scheduler.ts src/ui/signatureDialog.ts tests/state/settings.test.ts
git commit -m "Add a per-click subdivision on/off pattern to settings"
```

---

### Task 2: Scheduler skips switched-off subdivision clicks

**Files:**
- Modify: `src/engine/scheduler.ts:113-116`
- Test: `tests/engine/scheduler.test.ts` (uses the file's existing `setup(patternOverrides, …)`
  helper, see ~line 9-22)

**Interfaces:**
- Consumes: `Pattern.subOff`, `isSubOn` (Task 1).

- [ ] **Step 1: Write the failing test** (next to "places subdivision clicks evenly…", ~line 154)

```ts
  it('skips subdivision clicks switched off in the pattern', () => {
    // 16ths, beat 0 keeps only k = 2 (the "&"): off = [k1, k2, k3] = [true, false, true]
    const { s, subdivisions } = setup({ subdivision: 4, subOff: [true, false, true] }, 0.3);
    s.tick(0);
    expect(subdivisions).toEqual([0.05 + 0.25]);
  });
```

Look at the neighbouring test first for the tick/time conventions (`startDelay` 0.05, 120 BPM
→ 0.5s beats, window 0.3). Adjust the expected times if the helper differs. The point is: of
the three 16th clicks after beat 0, only the middle one (at +0.25s) remains.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/scheduler.test.ts`
Expected: FAIL. All three clicks are emitted.

- [ ] **Step 3: Implement**

```ts
      const subdivision = Math.max(1, pattern.subdivision);
      for (let k = 1; k < subdivision; k++) {
        if (!isSubOn(pattern.subOff ?? [], subdivision, this.beatInBar, k)) continue;
        this.opts.onSubdivision?.(this.nextTime + (duration * k) / subdivision);
      }
```

Import `isSubOn` from `../state/settings`. It's a type-free runtime import. Check there's no
import cycle problem: `settings.ts` imports only the *type* `Pattern` from the scheduler, so
this is fine.

- [ ] **Step 4: Run all tests**

Run: `npm test` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scheduler.ts tests/engine/scheduler.test.ts
git commit -m "Skip switched-off subdivision clicks in the scheduler"
```

---

### Task 3: Shared subdivision-dot geometry, fan layout and hit testing

Today the dot positions live inline in `circular.ts`/`linear.ts` (commit `7a75237`), and the
line view's row metrics are duplicated between `linear.ts` and `hitTest.ts`'s `linearBeatAt`
("Keep identical…"). Hit testing the dots needs the exact same positions, so this task moves
all of it into pure, tested functions.

**Files:**
- Create: `src/viz/subDots.ts`
- Modify: `src/viz/geometry.ts` (add `linearMetrics`)
- Modify: `src/viz/linear.ts`, `src/viz/hitTest.ts` (use `linearMetrics`; no behavior change)
- Modify: `src/viz/hitTest.ts` (add an optional `hitScale` param to `circularBeatAt` and
  `linearBeatAt`, default `1.8` = today)
- Test: `tests/viz/subDots.test.ts`, existing `tests/viz/hitTest.test.ts` must still pass

**Interfaces:**
- Produces:

```ts
// geometry.ts
export interface LinearMetrics {
  track: { left: number; width: number; y: number };
  cells: BeatCell[];
  rows: number;
  nodeR: number;
  tick: number;
  reach: number;
  rowGap: number;
  /** Line cut-off from a node center (the ring/line stops this far from each node). */
  gap: number;
  cellW: number;
  rowY: (row: number) => number;
  nodeX: (col: number, rowCount: number) => number;
}
export function linearMetrics(width: number, height: number, count: number): LinearMetrics;

// subDots.ts
export const SUB_TAP_MIN_SPACING = 32;
export const SUB_FAN_PITCH = 44;
export const SUB_FAN_DOT_R = 11;
export const SUB_FAN_OFFSET = 46;
export interface SubDot { beat: number; k: number; x: number; y: number; r: number }
export interface SubGroup {
  beat: number;
  /** Midpoint of the group's visible gap. */
  x: number;
  y: number;
  /** Unit vector the fan pops out along (outward on the circle, up on the line). */
  nx: number;
  ny: number;
  /** Unit vector the fan's row runs along, in playing order (clockwise / left→right). */
  tx: number;
  ty: number;
}
export interface SubDotLayout {
  dots: SubDot[];      // beat-major, k = 1..sub−1; empty when sub ≤ 1 or nothing fits
  groups: SubGroup[];  // one per beat with dots
  /** Smallest center-to-center spacing between neighbouring dots in this layout. */
  spacing: number;
  /** Dots are big and far enough apart to tap one directly (spacing ≥ SUB_TAP_MIN_SPACING). */
  direct: boolean;
}
export function subDotLayout(
  kind: 'circular' | 'linear', width: number, height: number, count: number, sub: number,
): SubDotLayout;
export function subFanLayout(
  group: SubGroup, clicks: number, width: number, height: number,
): { x: number; y: number }[];
export type SubHit = { kind: 'dot'; beat: number; k: number } | { kind: 'group'; beat: number };
export function subDotAt(layout: SubDotLayout, x: number, y: number): SubHit | null;
export function subFanDotAt(fan: readonly { x: number; y: number }[], x: number, y: number): number;
```

- [ ] **Step 1: Extract `linearMetrics` (pure refactor)**

Move the block at the top of `linearVisualizer.draw` (`src/viz/linear.ts:17-38`) into
`linearMetrics` in `geometry.ts`, returning the fields above. That block covers `track`,
`cells`, `rows`, `nodeR`, `tick`, `reach`, `rowGap`, `gap = nodeR + 5`, plus `rowY`/`nodeX`
closures and `cellW = track.width / MAX_PER_ROW`. `rowTick`/`barTick` stay in `linear.ts`;
they're drawing-only. Make `linear.ts` and `hitTest.ts`'s `linearBeatAt` both call it, and
delete the "Keep identical" duplication.

Run: `npm test` — expected: all pass, unchanged (this is a refactor).

- [ ] **Step 2: Write the failing tests** (`tests/viz/subDots.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  SUB_FAN_DOT_R,
  SUB_FAN_PITCH,
  SUB_TAP_MIN_SPACING,
  subDotAt,
  subDotLayout,
  subFanDotAt,
  subFanLayout,
} from '../../src/viz/subDots';

describe('subDotLayout', () => {
  it('has no dots without a subdivision', () => {
    expect(subDotLayout('circular', 390, 320, 4, 1).dots).toEqual([]);
  });

  it('places sub−1 dots per beat, beat-major', () => {
    const l = subDotLayout('circular', 390, 320, 4, 3);
    expect(l.dots).toHaveLength(8);
    expect(l.dots.map((d) => [d.beat, d.k]).slice(0, 3)).toEqual([[0, 1], [0, 2], [1, 1]]);
    expect(l.groups).toHaveLength(4);
  });

  it('is directly tappable for 8ths on a 4-beat circle', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    expect(l.spacing).toBeGreaterThanOrEqual(SUB_TAP_MIN_SPACING);
    expect(l.direct).toBe(true);
  });

  it('needs the fan for 16ths on the 4-beat line view', () => {
    const l = subDotLayout('linear', 390, 320, 4, 4);
    expect(l.direct).toBe(false);
  });

  it('points circle groups outward and line groups up', () => {
    const c = subDotLayout('circular', 390, 320, 4, 2).groups[0];
    // beat 0's gap is between 12 o'clock and 3 o'clock: outward means up-right
    expect(c && c.nx > 0 && c.ny < 0).toBe(true);
    const lg = subDotLayout('linear', 390, 320, 4, 2).groups[0];
    expect(lg).toMatchObject({ nx: 0, ny: -1, tx: 1, ty: 0 });
  });
});

describe('subFanLayout', () => {
  const group = { beat: 0, x: 200, y: 100, nx: 0, ny: -1, tx: 1, ty: 0 };

  it('lays the clicks out SUB_FAN_PITCH apart, centered on the offset point', () => {
    const fan = subFanLayout(group, 3, 390, 320);
    expect(fan.map((p) => p.x)).toEqual([200 - SUB_FAN_PITCH, 200, 200 + SUB_FAN_PITCH]);
    expect(fan[0]?.y).toBe(100 - 46);
  });

  it('shifts the whole row back inside the canvas', () => {
    const fan = subFanLayout({ ...group, x: 10 }, 3, 390, 320);
    expect(Math.min(...fan.map((p) => p.x))).toBeGreaterThanOrEqual(SUB_FAN_DOT_R + 4);
    expect(fan[1]!.x - fan[0]!.x).toBe(SUB_FAN_PITCH); // spacing kept
  });
});

describe('subDotAt / subFanDotAt', () => {
  it('hits a single dot when direct', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    const d = l.dots[1]!;
    expect(subDotAt(l, d.x + 2, d.y)).toEqual({ kind: 'dot', beat: d.beat, k: d.k });
  });

  it('hits the whole group when not direct', () => {
    const l = subDotLayout('linear', 390, 320, 4, 4);
    const d = l.dots[4]!; // beat 1, k 2
    expect(subDotAt(l, d.x, d.y)).toEqual({ kind: 'group', beat: 1 });
  });

  it('misses far from any dot', () => {
    const l = subDotLayout('circular', 390, 320, 4, 2);
    expect(subDotAt(l, 0, 0)).toBeNull();
  });

  it('finds a fan dot by index', () => {
    const fan = [{ x: 100, y: 50 }, { x: 144, y: 50 }];
    expect(subFanDotAt(fan, 146, 52)).toBe(1);
    expect(subFanDotAt(fan, 300, 300)).toBe(-1);
  });
});
```

The `390×320` stage and the exact numeric expectations (`200 − 46`, `SUB_FAN_DOT_R + 4`)
follow the constants above. If `linearLayout`'s real track width at 390px makes 8ths directly
tappable or not differently from these expectations, re-derive the expectation from the
geometry rather than bending the implementation. The rules are in the Settled decisions.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/viz/subDots.test.ts` — expected: FAIL (module missing).

- [ ] **Step 4: Implement `src/viz/subDots.ts`**

**Circle** (mirror today's `circular.ts` dot block):
- Use `circularLayout`, `nodeRadius(r, circularNodeSpacing(n, r))`, `gap = 5`,
  `gapAngle = Math.asin(Math.min(1, (nodeR + gap) / r))` and
  `arcSpan = 2π/n − 2·gapAngle`.
- For beat `i`: `start = nodeAngle(i, n) + gapAngle`.
- Dot `k` sits at `polar(cx, cy, r, start + arcSpan·k/sub)`, radius `subDotRadius(nodeR, r·arcSpan/sub)`.
- Group midpoint: angle `a = start + arcSpan/2`, `(x, y) = polar(r, a)`.
- Vectors: `n = (cos a, sin a)` (outward) and `t = (−sin a, cos a)` (clockwise).
- `spacing = r·arcSpan/sub`.

**Line** (mirror today's `linear.ts` dot block, via `linearMetrics`):
- `from = nodeX + gap`.
- `to = last ? nodeX + cellW/2 − 5 : nextNodeX − gap`.
- Dot `k` at `from + (to − from)·k/sub`, radius
  `min(fullDotR, subDotRadius(nodeR, (to − from)/sub))`, where
  `fullDotR = subDotRadius(nodeR, (cellW − 2·gap)/sub)`.
- Group midpoint `((from + to)/2, rowY)`, `n = (0, −1)`, `t = (1, 0)`.
- `spacing` = the minimum `(to − from)/sub` over the beats that got dots. A row's last beat
  often gets none at 16ths.

**Both:**
- Skip dots whose radius is 0. A group with no dots gets no `SubGroup`.
- `direct = spacing ≥ SUB_TAP_MIN_SPACING`.

`subFanLayout(group, clicks, w, h)`:
- Center: `c = (x + nx·SUB_FAN_OFFSET, y + ny·SUB_FAN_OFFSET)`.
- Points: `c + t·(j·SUB_FAN_PITCH − half)` for `j = 0..clicks−1`, with
  `half = (clicks − 1)·SUB_FAN_PITCH/2`.
- Then shift all points by the same `(dx, dy)` so every point is within
  `[SUB_FAN_DOT_R + 4, w − SUB_FAN_DOT_R − 4]` × `[SUB_FAN_DOT_R + 4, h − SUB_FAN_DOT_R − 4]`.

`subDotAt(layout, x, y)`:
- **Direct:** the nearest dot within `min(22, layout.spacing / 2)` → `{ kind: 'dot' }`.
- **Otherwise:** the nearest dot within 22px → `{ kind: 'group', beat: dot.beat }`.
- Else `null`.

`subFanDotAt(fan, x, y)`: the index of the nearest point within `SUB_FAN_PITCH / 2`, else −1.

In `hitTest.ts`, add the optional last param `hitScale = 1.8` to `circularBeatAt` and
`linearBeatAt`, replacing the literal `1.8`.

- [ ] **Step 5: Switch the renderers to the shared layout**

In `circular.ts` and `linear.ts`, replace the inline dot-position blocks from `7a75237` with a
loop over `subDotLayout(...).dots`. Keep drawing with `drawSubDot` for now; Task 4 changes its
look. Nothing visible should change in this step.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint` — expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/viz tests/viz
git commit -m "Share subdivision-dot geometry, fan layout and hit testing in subDots.ts"
```

---

### Task 4: On/off look, glow only for on dots, and drawing the fan

**Files:**
- Modify: `src/viz/frame.ts` (+ `tests/viz/frame.test.ts`)
- Modify: `src/viz/drawNode.ts` (`drawSubDot`)
- Modify: `src/viz/circular.ts`, `src/viz/linear.ts`
- Modify: `src/viz/vizController.ts` (pass `subOff` into `computeFrame`)

**Interfaces:**
- Consumes: `isSubOn` (Task 1), `subDotLayout`/`subFanLayout`/`SUB_FAN_DOT_R` (Task 3).
- Produces:
  - `FrameInput.subOff: readonly boolean[]`
  - `VizFrame.subOff: readonly boolean[]`
  - `VizFrame.subFan?: { beat: number; frac: number }`, set by the controller in Task 5; the
    renderers draw it
  - `drawSubDot(ctx, x, y, radius, on, glow, theme)`

- [ ] **Step 1: Failing frame test** (inside the existing `describe('subdivision dots')`)

```ts
    it('never lights a switched-off dot', () => {
      const f = computeFrame({
        ...base,
        subdivision: 2,
        subOff: [false, false, true, false], // beat 2's "&" is off
        beat: beat(), // beatInBar 2
        heardTime: 10.25,
      });
      expect(f).toMatchObject({ activeSub: 1, subGlow: 0 });
    });
```

Add `subOff: [] as boolean[]` to the test file's `base`.

- [ ] **Step 2: Run it to see it fail, then implement**

- `FrameInput.subOff` and `VizFrame.subOff`: pass through both return paths.
- In the running path, after computing `k`: if `!isSubOn(input.subOff, subdivision,
  beat.beatInBar, k)`, keep `activeSub = k` but `subGlow = 0`.
- In `vizController.ts`, pass `subOff: patternFromSettings(s).subOff ?? []` next to
  `subdivision`.

Run: `npx vitest run tests/viz/frame.test.ts` — expected: PASS.

- [ ] **Step 3: `drawSubDot` on/off**

```ts
/** A subdivision dot. On: a solid disc in the theme's node color that flashes (brighter core +
 *  soft glow) while `glow` > 0. Off: a hollow ring like a muted beat, never flashing. One radius
 *  for base and flash, so it always reads as one dot. */
export function drawSubDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  on: boolean,
  glow: number,
  theme: VizTheme,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (!on) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.nodeIdle;
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = theme.node;
  ctx.fill();
  if (glow > 0) {
    ctx.globalAlpha = glow;
    ctx.fillStyle = theme.core;
    ctx.shadowColor = theme.glow;
    ctx.shadowBlur = 12 * glow;
    ctx.fill();
  }
  ctx.restore();
}
```

- [ ] **Step 4: Renderers**

In both `circular.ts` and `linear.ts`, per dot:
- `on = isSubOn(frame.subOff, frame.subdivision, dot.beat, dot.k)`
- `glow = dot.beat === frame.activeBeat && dot.k === frame.activeSub ? frame.subGlow : 0`
- Call `drawSubDot(ctx, dot.x, dot.y, dot.r, on, glow, theme)`.

If `frame.subFan` is set with `frac > 0`:
- Skip that beat's in-place dots.
- After the loop, draw the fan:
  - `fan = subFanLayout(group, sub − 1, width, height)`.
  - Backdrop: a rounded pill behind the fan row. Use `ctx.globalAlpha = frac`,
    fill `rgb(0 0 0 / 0.55)`, stroke `theme.ring`, corner radius `SUB_FAN_DOT_R + 8`, padded
    `SUB_FAN_DOT_R + 8` around the points.
  - Each click `j` (k = j + 1):
    - position lerped from its in-place dot `(dot.x, dot.y)` to `fan[j]` by `frac`
    - radius lerped from `dot.r` to `SUB_FAN_DOT_R`
    - same `on`/`glow` rules as the in-place dots

Draw the fan after the nodes, so it sits on top. The hand/stick can still pass under it.

- [ ] **Step 5: Check it in the browser**

Run `npm run dev`.
- In the Signature dialog pick 4/4 and Triplets. Toggle nothing yet: dots are solid, brighter
  than before.
- Play: each dot flashes when heard.
- Nothing can switch a dot off or open a fan yet (that's Task 5), so the off look and the fan are
  verified there. Here, check that nothing throws and that the on look is right.

- [ ] **Step 6: Commit**

```bash
git add src/viz tests/viz
git commit -m "Draw subdivision dots on/off, flash only on ones, and draw an open fan"
```

---

### Task 5: Tapping dots and fans on the visualiser

**Files:**
- Modify: `src/viz/vizController.ts` (tap routing, fan animation state)
- Modify: `src/main.ts` (~line 180-200, the `new VizController(…)` call: pass the new callback)

**Interfaces:**
- Consumes:
  - `subDotLayout`, `subDotAt`, `subFanLayout`, `subFanDotAt` (Task 3)
  - `toggleSub`, `patternFromSettings` (Task 1)
  - `hitScale` on the beat hit tests (Task 3)
- Produces: a new last constructor param `onSubTap?: (beat: number, k: number) => void`.

- [ ] **Step 1: Controller state and animation**

Add next to `polyPairAnim`:

```ts
  /** The one subdivision group currently fanned out (or animating), if any. `opening` like
   *  polyPairAnim's; `shape` is the layout it was opened for — any change closes it. */
  private subFan: { beat: number; start: number; opening: boolean; shape: string } | null = null;
```

- Factor `currentSplitFrac`'s body into a private `easedFrac(anim: { start: number; opening:
  boolean } | undefined): number`, keeping the same easing, `POLY_SPLIT_MS` and reduced-motion
  jump. Use it for both poly pairs and `subFan`.
- Add `subFanFrac()`: 0 when there's no fan; a closed-and-finished fan sets `this.subFan = null`.
- Shape key: `` `${s.visualizer}|${s.beatsPerBar}|${sub}` `` with `sub =
  patternFromSettings(s).subdivision`. In `render()` (standard path), if `this.subFan` exists
  and its `shape` differs from the current one, drop it (`this.subFan = null`) without animating.
- After `computeFrame`, set `frame.subFan = { beat, frac }` when `subFanFrac() > 0`.
- Keep the loop alive while it animates, like `polyAnimating()`: if the fan's frac is strictly
  between 0 and 1, call `this.invalidate()`.

- [ ] **Step 2: Tap routing** (standard path of `onPointerDown`, replacing the current tail)

```ts
    const sub = patternFromSettings(s).subdivision;
    const kind = s.visualizer === 'linear' ? 'linear' : 'circular';
    const layout = subDotLayout(kind, this.size.width, this.size.height, s.beatsPerBar, sub);

    // 1-2. An open fan owns the next tap: toggle one of its dots, or close it.
    if (this.subFan?.opening) {
      const group = layout.groups.find((g) => g.beat === this.subFan?.beat);
      const fan = group ? subFanLayout(group, sub - 1, this.size.width, this.size.height) : [];
      const j = subFanDotAt(fan, x, y);
      if (j >= 0) this.onSubTap?.(this.subFan.beat, j + 1);
      else this.animateSubFan(this.subFan.beat, false);
      this.invalidate();
      return;
    }
    const beatAt = (scale: number) =>
      kind === 'linear'
        ? linearBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar, scale)
        : circularBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar, scale);
    // 3. A tap on a node's own body always means the node.
    const onNode = beatAt(1.1);
    if (onNode >= 0) {
      this.onBeatTap?.(onNode);
      return;
    }
    // 4. Then the subdivision dots: one dot directly, or open its group's fan.
    const hit = sub > 1 ? subDotAt(layout, x, y) : null;
    if (hit?.kind === 'dot') {
      this.onSubTap?.(hit.beat, hit.k);
      return;
    }
    if (hit?.kind === 'group') {
      this.animateSubFan(hit.beat, true, `${s.visualizer}|${s.beatsPerBar}|${sub}`);
      this.invalidate();
      return;
    }
    // 5. The node's generous hit ring, as before.
    const index = beatAt(1.8);
    if (index >= 0) this.onBeatTap?.(index);
```

Write `animateSubFan(beat, opening, shape?)` using the same continuity math as `animatePair`,
so reversing mid-animation starts from the current frac. It keeps the previous `shape` when
closing. Opening a *different* group than the open one closes the old one instantly. Only one
fan exists at a time, so just replace it.

The early `if (!this.onBeatTap) return;` must not block sub taps. Guard each callback use
individually, as above.

- [ ] **Step 3: Wire it in `src/main.ts`**

Add the new final argument to `new VizController(…)`:

```ts
  (beat, k) => {
    const s = store.get();
    const sub = patternFromSettings(s).subdivision;
    store.set({ subOff: toggleSub(s.subOff, s.beatsPerBar, sub, beat, k) });
  },
```

Import `toggleSub` and `patternFromSettings` from `./state/settings`.

- [ ] **Step 4: Verify in the browser** (dev server, 390×844 viewport)

- 4/4, 8ths, circle view: tapping a dot switches it to a hollow ring. Playing, it's silent and
  doesn't flash; tapping it again restores it. Tapping a beat node still cycles its level.
- 4/4, 16ths, line view: tapping a dot group fans it out above the row.
  - Tapping a fan dot toggles it and the fan stays open.
  - Tapping elsewhere closes the fan and changes nothing else.
  - Tapping a node while the fan is open only closes the fan.
- 16/4 and 16ths, circle view: fans open outward and stay inside the canvas (near 12/3/6/9
  o'clock the clamp pulls them back over the ring; that's expected). Nodes are still
  tappable on their bodies.
- Reduced motion (DevTools rendering emulation): the fan opens and closes instantly.
- Turning "Beats — tap directly on the visualiser" off disables all of it.
- Changing the subdivision while a fan is open: the fan disappears and the pattern resets.

Note: the Playwright MCP browser can be throttled to ~2 fps when its window is occluded. That
makes glow/animation checks unreliable. Check `requestAnimationFrame` rate first, or ask the
user to check on their phone.

- [ ] **Step 5: Commit**

```bash
git add src/viz/vizController.ts src/main.ts
git commit -m "Tap subdivision dots on the visualiser, fanning out groups too small to tap"
```

---

### Task 6: Subdivision toggles in the Signature dialog's beat row

**Files:**
- Modify: `src/ui/controls.ts` (`renderBeatsInto` ~line 78, `onBeatRowClick` ~line 70)
- Modify: `src/styles.css` (after `.beat` rules ~line 717+)
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `isSubOn`, `toggleSub`, `patternFromSettings` (Task 1).

- [ ] **Step 1: Markup from `renderBeatsInto`**

When the effective subdivision (`patternFromSettings(s).subdivision`) is > 1, each beat becomes
a group, `<span class="beat-group">` holding:
- the existing `.beat` button
- then `sub − 1` buttons, each:

```html
<button type="button" class="sub-toggle" data-beat="i" data-k="k" aria-pressed="true|false"
        aria-label="…"></button>
```

With subdivision 1, keep today's flat list of `.beat` buttons.

Rebuild the children when `container.dataset.shape !== `${s.beatsPerBar}x${sub}``, and set
`dataset.shape` after rebuilding. This replaces the current `childElementCount` check, which
breaks once groups exist. On every render:
- update each `.beat`'s class and aria-label as today (select them with
  `container.querySelectorAll('.beat')`, not `children[i]`)
- update each `.sub-toggle`'s `aria-pressed = String(isSubOn(...))` and its aria-label
  `format('sub.ariaLabel', { n: i + 1, k })`

In `onBeatRowClick`, handle `.sub-toggle` before `.beat`:

```ts
    const toggle = (e.target as HTMLElement).closest<HTMLButtonElement>('.sub-toggle');
    if (toggle) {
      const s = store.get();
      const sub = patternFromSettings(s).subdivision;
      store.set({
        subOff: toggleSub(s.subOff, s.beatsPerBar, sub, Number(toggle.dataset.beat), Number(toggle.dataset.k)),
      });
      return;
    }
```

- [ ] **Step 2: CSS**

```css
/* A beat plus its subdivision toggles stay together when the row wraps. */
.beat-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
/* One subdivision click: solid theme color when on, hollow ring when off — the same code the
   visualiser's dots use. 26px visual, 30px pitch with the gap. */
.sub-toggle {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--select);
  background: var(--select);
}
.sub-toggle[aria-pressed="false"] {
  background: transparent;
  border-color: var(--line);
}
```

Check the global `button:active::after` press ring on these. If it looks noisy on such small
round buttons, disable it the same way `.chip--preview` does (`content: none`).

- [ ] **Step 3: i18n**

Add to both languages:

| key | English | Turkish |
|---|---|---|
| `sub.ariaLabel` | `Beat {n}, subdivision click {k}` | `Vuruş {n}, alt vuruş {k}` |
| `sub.hint` | `Tap a small dot to switch that click on or off` | `Küçük noktaya dokunarak o alt vuruşu aç/kapat` |

Show `sub.hint` as a `.sub-label` line under the beat row in the Beats field (`index.html`, the
`.sig-beats-field`). Give it an id and set `hidden` from `signatureDialog.ts`'s render whenever
the effective subdivision is 1.

- [ ] **Step 4: Verify** (dev server)

- 4/4 + 16ths: the beat row shows `(1) ●●● (2) ●●● …`, and groups wrap intact on a 320px
  viewport.
- Toggling in the dialog updates the visualiser live, and vice versa.
- 6/8 and Off show no toggles and hide the hint. Polyrhythm hides the whole Beats field, as
  today.
- Turkish labels are right.

Run: `npm test && npm run lint && npm run build` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls.ts src/ui/signatureDialog.ts src/styles.css src/i18n/translations.ts index.html
git commit -m "Edit the subdivision on/off pattern from the Signature dialog's beat row"
```

---

### Task 7: Final check and hand back

- [ ] Run `npm test && npm run lint && npm run build`. Expected: all pass (lint: only the 2
  pre-existing `index.html` warnings).
- [ ] Walk the Review Focus list above in the browser. Note which items were verified only under
  throttled rendering, if any.
- [ ] Overwrite `docs/superpowers/FOLLOWUP.md` per `CLAUDE.md`: what shipped, the commit range,
  what's unverified on a real phone. Commit it.
- [ ] Report `git log --oneline origin/master..HEAD` to the user. Don't push.
