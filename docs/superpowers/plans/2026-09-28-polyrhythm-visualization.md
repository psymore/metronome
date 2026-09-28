# Polyrhythm Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Line visualizer's positioning, reflow Line's beat/rhythm spheres into rows of at most 4 (Circle is unchanged — see Task 3's correction note), and add a new Polyrhythm mode (reachable from the Signature control) that plays and draws two audible, mathematically synchronized rhythmic layers sharing one cycle.

**Architecture:** Everything is additive within the existing layered structure — Canvas 2D drawing, a single look-ahead `Scheduler`-style engine driven by `AudioContext.currentTime`, a flat `Settings` store, and small `mount*` UI modules. Polyrhythm gets its own scheduler (`PolyScheduler`), its own pure frame/geometry functions, and its own dedicated canvas draw path — it does not force its data into the existing single-beat `VizFrame`/`Visualizer` abstractions, which are shaped for one beat grid, not two independent ones.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, Web Audio API (`AudioContext`, `AudioBufferSourceNode`), a Web Worker for the scheduler tick. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-28-polyrhythm-visualization-design.md`

## Global Constraints

- No new runtime dependencies (project currently only depends on `idb-keyval`).
- `setTimeout`/`setInterval`/`requestAnimationFrame` never decide **when** a click sounds — only the look-ahead scheduler + `AudioContext.currentTime` + `source.start(time)` do.
- Beat/cycle times are accumulated (`next += duration`), never re-measured from `now` — this applies to the new polyrhythm cycle anchor exactly as it already applies to the standard scheduler's `nextTime`.
- Visuals are a pure function of the **heard** time (`AudioEngine.heardTime()`), not of scheduling time or frame count — this applies to the new `computePolyFrame` exactly as it already applies to `computeFrame`.
- Every `localStorage`/IndexedDB access must be wrapped and fall back safely (private windows can throw).
- Idle beat nodes are drawn from cached sprites (`NodeSpriteCache`); anything that changes their appearance must go through the existing cache invalidation, not bypass it.
- The visualiser's `requestAnimationFrame` loop stops while `document.hidden` and restarts on `visibilitychange` — the polyrhythm draw path reuses `VizController`'s existing loop, so this is inherited for free as long as polyrhythm dispatch stays inside `VizController.render()`.
- Polyrhythm ratio values (`a`, `b`) are clamped to **2–16** per layer.
- Polyrhythm is a **separate mode**: while `polyrhythm.enabled` is true it replaces the normal beats-per-bar click/visual entirely; it does not layer on top of the standard signature.
- Both polyrhythm layers are **audibly distinct** — each has its own selectable click sound.

## Review Focus

- `a === b` (e.g. 4:4): both layers' events land on the same times every cycle — must not crash, divide by zero, or draw overlapping nodes incorrectly. (Task 6, Task 8)
- Changing `polyrhythm.a`/`b`/`bpm` while the metronome is **not** running: must not schedule or play anything, and the next `start()` must use the current values, not stale ones captured earlier. (Task 6)
- A large ratio at a high tempo (e.g. `a=16` at `bpm=400`, cycle = 4×(60/400) = 0.6s → events ~37ms apart): the look-ahead scheduler must still schedule every event, none dropped, none duplicated. (Task 6)
- Toggling Standard ↔ Polyrhythm mode **while the metronome is playing**: the old scheduler must stop and the new one must start cleanly, with no overlapping audio from both at once. (Task 10)
- `beatsPerBar = 1` (the existing minimum) through the new grid-reflow math: must not divide by zero or produce a NaN row/column. (Task 2)

---

## Task 1: Fix the Line visualizer's vertical centering

**Files:**
- Modify: `src/viz/geometry.ts:47-50` (`linearLayout`)
- Test: `tests/viz/geometry.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `linearLayout(width, height)` still returns `{ left, width, y }`, but `y` is now the true vertical center of the canvas instead of a hardcoded `height * 0.36`. `linear.ts` and `hitTest.ts` already consume `track.y` as a plain number, so no call-site changes are needed.

- [ ] **Step 1: Write the failing test**

Add to `tests/viz/geometry.test.ts` (in a `describe('linearLayout', ...)` block — check whether one already exists in the file; if not, add one):

```ts
import { linearLayout } from '../../src/viz/geometry';

describe('linearLayout', () => {
  it('centers the track vertically in the canvas', () => {
    expect(linearLayout(400, 300).y).toBe(150);
    expect(linearLayout(320, 320).y).toBe(160);
  });

  it('insets the track horizontally by at least 24px or 8% of width', () => {
    const narrow = linearLayout(200, 300);
    expect(narrow.left).toBe(24);
    const wide = linearLayout(1000, 300);
    expect(wide.left).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viz/geometry.test.ts`
Expected: FAIL — `linearLayout(400, 300).y` is currently `108` (`300 * 0.36`), not `150`.

- [ ] **Step 3: Fix `linearLayout`**

```ts
export function linearLayout(width: number, height: number) {
  const pad = Math.max(24, width * 0.08);
  return { left: pad, width: Math.max(10, width - pad * 2), y: height / 2 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viz/geometry.test.ts`
Expected: PASS, and all pre-existing tests in the file still pass (the horizontal inset math is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/viz/geometry.ts tests/viz/geometry.test.ts
git commit -m "$(cat <<'EOF'
Center the Line visualizer's track vertically

linearLayout hardcoded the track to height * 0.36, a value tuned by eye
rather than derived from the square stage it shares with the circular
visualizer. Center it the same way circularLayout centers its ring.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Multi-row/ring beat layout math

**Files:**
- Modify: `src/viz/geometry.ts`
- Test: `tests/viz/geometry.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 3):
  - `export const MAX_PER_ROW = 4`
  - `export interface BeatCell { row: number; col: number; rowCount: number; rows: number }`
  - `export function beatLayoutGrid(count: number, maxPerRow = MAX_PER_ROW): BeatCell[]`
  - `export function linearGridX(col: number, rowCount: number, left: number, width: number, maxPerRow = MAX_PER_ROW): number`
  - `export function linearGridY(row: number, rows: number, centerY: number, rowGap: number): number`
  - `export function circularRingRadius(row: number, rows: number, maxR: number, minR: number): number`

- [ ] **Step 1: Write the failing tests**

Add to `tests/viz/geometry.test.ts`:

```ts
import {
  beatLayoutGrid,
  circularRingRadius,
  linearGridX,
  linearGridY,
} from '../../src/viz/geometry';

describe('beatLayoutGrid', () => {
  it('keeps 1-4 beats in a single row', () => {
    const cells = beatLayoutGrid(4);
    expect(cells).toEqual([
      { row: 0, col: 0, rowCount: 4, rows: 1 },
      { row: 0, col: 1, rowCount: 4, rows: 1 },
      { row: 0, col: 2, rowCount: 4, rows: 1 },
      { row: 0, col: 3, rowCount: 4, rows: 1 },
    ]);
  });

  it('wraps 5-8 beats into two rows of at most 4', () => {
    const cells = beatLayoutGrid(6);
    expect(cells.map((c) => c.row)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(cells.map((c) => c.col)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(cells[0]?.rows).toBe(2);
    expect(cells[0]?.rowCount).toBe(4);
    expect(cells[4]?.rowCount).toBe(2); // the shorter second row
  });

  it('preserves beat order and produces one cell per beat for 1..16', () => {
    for (let n = 1; n <= 16; n++) {
      const cells = beatLayoutGrid(n);
      expect(cells).toHaveLength(n);
      cells.forEach((cell, i) => {
        expect(cell.row * 4 + cell.col).toBe(i);
      });
    }
  });

  it('handles a single beat without dividing by zero', () => {
    const cells = beatLayoutGrid(1);
    expect(cells).toEqual([{ row: 0, col: 0, rowCount: 1, rows: 1 }]);
  });
});

describe('linearGridX / linearGridY', () => {
  it('centers a full row of 4 across the track width', () => {
    // track from 0 to 400, cell width = 100, centers at 50, 150, 250, 350
    expect(linearGridX(0, 4, 0, 400)).toBe(50);
    expect(linearGridX(3, 4, 0, 400)).toBe(350);
  });

  it('centers a short row (fewer than 4) as a group, not stretched to full width', () => {
    // 2 nodes, cell width 100: row is 200 wide, centered -> starts at 100
    expect(linearGridX(0, 2, 0, 400)).toBe(150);
    expect(linearGridX(1, 2, 0, 400)).toBe(250);
  });

  it('stacks rows symmetrically around the center', () => {
    expect(linearGridY(0, 1, 160, 40)).toBe(160);
    expect(linearGridY(0, 2, 160, 40)).toBeCloseTo(140);
    expect(linearGridY(1, 2, 160, 40)).toBeCloseTo(180);
  });
});

describe('circularRingRadius', () => {
  it('returns maxR when there is only one ring', () => {
    expect(circularRingRadius(0, 1, 120, 60)).toBe(120);
  });

  it('spaces rings evenly between minR (innermost) and maxR (outermost)', () => {
    expect(circularRingRadius(0, 3, 120, 60)).toBe(120);
    expect(circularRingRadius(2, 3, 120, 60)).toBe(60);
    expect(circularRingRadius(1, 3, 120, 60)).toBe(90);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/viz/geometry.test.ts`
Expected: FAIL — `beatLayoutGrid`, `linearGridX`, `linearGridY`, `circularRingRadius` are not exported yet.

- [ ] **Step 3: Implement the layout math**

Add to `src/viz/geometry.ts` (after the existing `nodeRadius` function):

```ts
export const MAX_PER_ROW = 4;

export interface BeatCell {
  row: number;
  col: number;
  /** Number of beats sharing this node's row (linear) or ring (circular). */
  rowCount: number;
  /** Total rows/rings for this beat count. */
  rows: number;
}

/** Splits `count` beats into rows/rings of at most `maxPerRow`, in beat order; the last row may be shorter. */
export function beatLayoutGrid(count: number, maxPerRow = MAX_PER_ROW): BeatCell[] {
  const rows = Math.max(1, Math.ceil(count / maxPerRow));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / maxPerRow);
    const rowStart = row * maxPerRow;
    const rowCount = Math.min(maxPerRow, count - rowStart);
    return { row, col: i - rowStart, rowCount, rows };
  });
}

/**
 * X position of column `col` (of `rowCount` nodes in that row) on a track of the given width.
 * Cells are sized for a full row of `maxPerRow` so spacing stays consistent across rows; a
 * shorter row is centered as a group rather than stretched to fill the full width.
 */
export function linearGridX(
  col: number,
  rowCount: number,
  left: number,
  width: number,
  maxPerRow = MAX_PER_ROW,
): number {
  const cell = width / maxPerRow;
  const rowWidth = cell * rowCount;
  const rowLeft = left + (width - rowWidth) / 2;
  return rowLeft + cell * (col + 0.5);
}

/** Y position of `row` (of `rows` total), stacked symmetrically around `centerY` with fixed spacing. */
export function linearGridY(row: number, rows: number, centerY: number, rowGap: number): number {
  return centerY + (row - (rows - 1) / 2) * rowGap;
}

/** Radius of ring `row` (of `rows` total, row 0 = outermost), evenly spaced between `maxR` and `minR`. */
export function circularRingRadius(row: number, rows: number, maxR: number, minR: number): number {
  if (rows <= 1) return maxR;
  return maxR - (row * (maxR - minR)) / (rows - 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/viz/geometry.test.ts`
Expected: PASS — all new tests green, all pre-existing tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add src/viz/geometry.ts tests/viz/geometry.test.ts
git commit -m "$(cat <<'EOF'
Add pure layout math for multi-row/ring beat reflow

beatLayoutGrid assigns each beat a row/col (max 4 per row), and
linearGridX/Y and circularRingRadius turn that into centered, evenly
spaced pixel positions for the linear track and circular ring
respectively. No visual change yet — circular.ts/linear.ts are wired
up to this in the next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Apply the multi-row layout to the Line visualizer (Line only — not Circle)

**Correction (ruled during implementation, 2026-09-28):** an earlier draft of this task also rewrote `circular.ts` into concentric rings. That was implemented, previewed, and explicitly rejected: it read as a spiral rather than a clean dial. **`src/viz/circular.ts` and `circularBeatAt` are out of scope for this plan and must not be modified.** Circle keeps its exact `master` behavior — one ring, all `n` beats, shrinking node size as `n` grows. `circularRingRadius` (from Task 2, already committed) stays in `geometry.ts` as a tested-but-currently-unused helper; do not remove it and do not wire it up anywhere.

**Files:**
- Modify: `src/viz/linear.ts`
- Modify: `src/viz/hitTest.ts` (its `linearBeatAt` only — leave `circularBeatAt` untouched)

**Interfaces:**
- Consumes: `beatLayoutGrid`, `linearGridX`, `linearGridY` from `./geometry` (Task 2 — note `circularRingRadius`/`MAX_PER_ROW` are Task 2 exports too but are NOT consumed by this task); `linearNodeSpacing`, `nodeRadius`, `linearStickX`, `linearLayout` (all pre-existing, unchanged signatures).
- Produces: no new exports — `linear.ts` still implements `Visualizer` (`src/viz/types.ts`) with the same `draw(ctx, size, frame, theme, sprites)` signature, so `VizController` needs no changes for this task.

This task has no new pure logic to unit test (canvas drawing is manually verified per the project's existing split — see `tests/viz/geometry.test.ts` vs. the untested `linear.ts`). Replace the file's contents in full to keep the row math consistent throughout.

- [ ] **Step 1: Replace `src/viz/linear.ts`**

```ts
import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import {
  beatLayoutGrid,
  linearGridX,
  linearGridY,
  linearLayout,
  linearNodeSpacing,
  linearStickX,
  nodeRadius,
} from './geometry';
import { spriteSize } from './nodeSprite';
import type { Visualizer } from './types';

export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme, sprites) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const track = linearLayout(width, height);
    const cells = beatLayoutGrid(n);
    const rows = cells[0]?.rows ?? 1;
    const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(Math.min(n, 4), track.width));
    const tick = Math.max(18, nodeR * 2);
    const rowGap = tick * 3.2;
    const gap = nodeR + 5;

    const rowY = (row: number) => linearGridY(row, rows, track.y, rowGap);
    const nodeX = (col: number, rowCount: number) => linearGridX(col, rowCount, track.left, track.width);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const y = rowY(cell.row);
      const from = nodeX(cell.col, cell.rowCount) + gap;
      const nextCol = cell.col + 1;
      const to = nextCol < cell.rowCount ? nodeX(nextCol, cell.rowCount) - gap : nodeX(cell.col, cell.rowCount) + gap;
      if (nextCol >= cell.rowCount) continue; // no connecting segment past the last node in a row
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let row = 0; row < rows; row++) {
      const rowCount = cells.find((c) => c.row === row)?.rowCount ?? 0;
      const y = rowY(row);
      for (let col = 0; col <= rowCount; col++) {
        // col === rowCount is the bar line at the right end of this row; it has no sphere.
        const x = col < rowCount ? nodeX(col, rowCount) : nodeX(rowCount - 1, rowCount) + track.width / 4 / 2;
        const isEnd = col === rowCount;
        const h = isEnd ? tick * 1.4 : tick;
        ctx.beginPath();
        if (isEnd) {
          ctx.moveTo(x, y - h);
          ctx.lineTo(x, y + h);
        } else {
          ctx.moveTo(x, y - h);
          ctx.lineTo(x, y - gap);
          ctx.moveTo(x, y + gap);
          ctx.lineTo(x, y + h);
        }
        ctx.stroke();
      }
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const cell = cells[frame.activeBeat];
      if (cell) {
        const y = rowY(cell.row);
        const x = linearStickX(cell.col, frame.phase, cell.rowCount, track.left, track.width);
        ctx.save();
        ctx.strokeStyle = theme.hand;
        ctx.lineWidth = 5;
        ctx.shadowColor = theme.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(x, y - tick * 2.2);
        ctx.lineTo(x, y + tick * 2.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = spriteSize(nodeR);
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const x = nodeX(cell.col, cell.rowCount);
      const y = rowY(cell.row);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      const label = String(i + 1);
      const glow = i === frame.activeBeat ? frame.glow : 0;
      if (glow === 0) {
        const sprite = sprites.get(level, label, nodeR);
        if (sprite) {
          ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
          continue;
        }
      }
      drawNode(ctx, x, y, nodeR, level, glow, theme);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(label, x, y);
      ctx.restore();
    }
  },
};
```

Note the deliberate simplification: the moving "stick"/"hand" indicator animates smoothly *within* the active beat's row/ring (reusing the existing phase-interpolation math, just parameterized by that row's own count) and jumps directly to the next row/ring's start when a beat crosses a row boundary, rather than tracing a diagonal path across rows. This keeps the indicator's motion legible and is a reasonable reading of "no visible layout jump" (the *nodes* never jump; only the *indicator's* position resets at a natural row boundary, the same way it already resets at the bar boundary today).

- [ ] **Step 3: Type-check and lint**

Run: `npm run build`
Expected: no TypeScript errors. Fix any `unused import` type mismatches revealed here.

Run: `npm run lint`
Expected: no Biome errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the app, open Settings → Signature and set Beats to 1, 4, 6, 9, 12, and 16 in turn, on the **Line** visualizer only (leave Circle untouched/unverified here — it has no changes to check). Confirm:
- 1–4 beats look the same as before this change (single row, same node size).
- 5–16 beats wrap into additional rows of at most 4 each, centered, without the spheres shrinking to illegible size.
- The moving stick still tracks the beat and doesn't visually break.
- Also switch to **Circle** and confirm it looks and behaves identically to `master` for every beat count tested — this task must produce zero visible change there.
- Tapping a beat node still cycles its accent/normal/mute level — but `hitTest.ts`'s `linearBeatAt` still uses the pre-reflow single-track formula, so for `beatsPerBar > 4` on Line the tap targets won't line up yet; fixed in the next step.

- [ ] **Step 4: Fix `src/viz/hitTest.ts`'s `linearBeatAt` to match the new layout**

Modify only the `linearBeatAt` function; leave `circularBeatAt` and its imports byte-for-byte as they are today.

```ts
import {
  beatLayoutGrid,
  circularLayout,
  circularNodeSpacing,
  linearGridX,
  linearGridY,
  linearLayout,
  linearNodeSpacing,
  nodeAngle,
  nodeRadius,
  polar,
} from './geometry';

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function circularBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const { cx, cy, r } = circularLayout(width, height);
  const hitR = nodeRadius(r, circularNodeSpacing(count, r)) * 1.8;
  for (let i = 0; i < count; i++) {
    const p = polar(cx, cy, r, nodeAngle(i, count));
    if (Math.hypot(x - p.x, y - p.y) <= hitR) return i;
  }
  return -1;
}

/** Index of the beat node under (x, y), in CSS pixels relative to the canvas, or -1. */
export function linearBeatAt(
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
): number {
  const track = linearLayout(width, height);
  const cells = beatLayoutGrid(count);
  const rows = cells[0]?.rows ?? 1;
  const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(Math.min(count, 4), track.width));
  const tick = Math.max(18, nodeR * 2);
  const rowGap = tick * 3.2;
  const hitR = nodeR * 1.8;
  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    if (!cell) continue;
    const nx = linearGridX(cell.col, cell.rowCount, track.left, track.width);
    const ny = linearGridY(cell.row, rows, track.y, rowGap);
    if (Math.hypot(x - nx, y - ny) <= hitR) return i;
  }
  return -1;
}
```

`circularBeatAt` above is reproduced verbatim from the current file (unchanged) so the full file can be pasted in one piece — confirm the diff shows zero changes to `circularBeatAt` and its supporting imports (`circularLayout`, `circularNodeSpacing`, `nodeAngle`) after this edit. This duplicates the `nodeR`/`rowGap` derivation from `linear.ts` rather than importing it, matching the existing pattern where `hitTest.ts` already independently re-derives `nodeR` via the same `nodeRadius(...)` call the drawing code uses — it is not a new inconsistency, just the same existing duplication extended to the new layout.

- [ ] **Step 5: Re-run manual verification**

Repeat Step 3's check, this time confirming tap-to-cycle-level works correctly on every node for 6, 9, and 16 beats on Line, and that Circle's tap-to-cycle behavior is completely unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/viz/linear.ts src/viz/hitTest.ts
git commit -m "$(cat <<'EOF'
Reflow Line's beat spheres into rows of at most 4

Line no longer shrinks beat nodes indefinitely as the beat count
grows — it wraps into additional rows (max 4 per row) at a consistent
node size instead. hitTest.ts's linearBeatAt is updated to match so
tap-to-cycle-level still lines up with the drawn nodes. Circle is
deliberately untouched: an earlier draft of this task also reflowed
Circle into concentric rings, which read as a spiral rather than a
clean dial and was rejected — see the spec's section 6 correction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the `polyrhythm` field to Settings

**Files:**
- Modify: `src/state/settings.ts`
- Test: `tests/state/settings.test.ts` (confirmed to already exist and cover `sanitizeSettings`)

**Interfaces:**
- Produces:
  - `export const MIN_POLY = 2`
  - `export const MAX_POLY = 16`
  - `export function clampPolyCount(n: number): number`
  - `Settings.polyrhythm: { enabled: boolean; a: number; b: number; soundIdA: string; soundIdB: string }`
  - `DEFAULT_SETTINGS.polyrhythm = { enabled: false, a: 3, b: 4, soundIdA: 'builtin:click-high', soundIdB: 'builtin:click' }`
  - `sanitizeSettings` validates/clamps `polyrhythm` the same way every other field is validated.

- [ ] **Step 1: Write the failing tests**

Add to `tests/state/settings.test.ts`:

```ts
import { clampPolyCount, defaultSettings, sanitizeSettings } from '../../src/state/settings';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/state/`
Expected: FAIL — `polyrhythm` is not on `Settings` yet.

- [ ] **Step 3: Implement**

In `src/state/settings.ts`, add near `MAX_BEATS`:

```ts
export const MIN_POLY = 2;
export const MAX_POLY = 16;
```

Add to the `Settings` interface:

```ts
  /** Two-layer polyrhythm mode; replaces the standard beat while enabled. */
  polyrhythm: { enabled: boolean; a: number; b: number; soundIdA: string; soundIdB: string };
```

Add to `DEFAULT_SETTINGS`:

```ts
  polyrhythm: { enabled: false, a: 3, b: 4, soundIdA: 'builtin:click-high', soundIdB: 'builtin:click' },
```

Add near `clampTargetBars`/`clampPracticeSeconds`:

```ts
export function clampPolyCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_POLY;
  return Math.min(MAX_POLY, Math.max(MIN_POLY, Math.round(n)));
}
```

In `sanitizeSettings`, before the returned object, add:

```ts
  const rp =
    typeof r.polyrhythm === 'object' && r.polyrhythm !== null
      ? (r.polyrhythm as Record<string, unknown>)
      : {};
```

And add to the returned object:

```ts
    polyrhythm: {
      enabled: typeof rp.enabled === 'boolean' ? rp.enabled : d.polyrhythm.enabled,
      a: typeof rp.a === 'number' ? clampPolyCount(rp.a) : d.polyrhythm.a,
      b: typeof rp.b === 'number' ? clampPolyCount(rp.b) : d.polyrhythm.b,
      soundIdA: isSoundId(rp.soundIdA) ? rp.soundIdA : d.polyrhythm.soundIdA,
      soundIdB: isSoundId(rp.soundIdB) ? rp.soundIdB : d.polyrhythm.soundIdB,
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/state/`
Expected: PASS, all new and pre-existing tests green.

- [ ] **Step 5: Commit**

```bash
git add src/state/settings.ts tests/state/
git commit -m "$(cat <<'EOF'
Add polyrhythm settings field

enabled/a/b/soundIdA/soundIdB, validated in sanitizeSettings like every
other field. Nothing reads this yet — the engine and UI wiring land in
later commits.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Genericize `BeatTimeline` and relax `beatPhase`'s type

**Files:**
- Modify: `src/engine/beatTimeline.ts`
- Test: `tests/engine/beatTimeline.test.ts` (existing tests must still pass unmodified; add one new test for the generic case)

**Interfaces:**
- Produces:
  - `export class BeatTimeline<T extends { time: number } = BeatEvent>` (was non-generic, hardcoded to `BeatEvent`)
  - `export function beatPhase(beat: { time: number; duration: number }, time: number): number` (was typed to `BeatEvent` specifically)
- Consumes: nothing new. `new BeatTimeline()` (no type argument) still defaults to `BeatTimeline<BeatEvent>`, so `AudioEngine.timeline` (Task 7) needs no change; Task 6/7 use `new BeatTimeline<PolyBeatEvent>()` explicitly.

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/beatTimeline.test.ts`:

```ts
describe('BeatTimeline<T> with a non-BeatEvent shape', () => {
  it('works with any object that has a numeric time field', () => {
    interface Ping { time: number; label: string }
    const t = new BeatTimeline<Ping>();
    t.push({ time: 1, label: 'a' });
    t.push({ time: 2, label: 'b' });
    expect(t.beatAt(1.5)?.label).toBe('a');
    expect(t.beatAt(2)?.label).toBe('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/beatTimeline.test.ts`
Expected: FAIL with a TypeScript error — `BeatTimeline` does not accept a type argument yet.

- [ ] **Step 3: Genericize the class and relax `beatPhase`**

Replace `src/engine/beatTimeline.ts` in full:

```ts
import type { BeatEvent } from './scheduler';

/** Recently scheduled beats, oldest first, so visuals can look up what is being heard. */
export class BeatTimeline<T extends { time: number } = BeatEvent> {
  private beats: T[] = [];

  constructor(private readonly capacity = 64) {}

  push(beat: T): void {
    this.beats.push(beat);
    if (this.beats.length > this.capacity) {
      this.beats.splice(0, this.beats.length - this.capacity);
    }
  }

  clear(): void {
    this.beats = [];
  }

  /** The latest beat whose start time is <= time, or null. */
  beatAt(time: number): T | null {
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

export function beatPhase(beat: { time: number; duration: number }, time: number): number {
  if (beat.duration <= 0) return 0;
  return Math.min(1, Math.max(0, (time - beat.time) / beat.duration));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/beatTimeline.test.ts`
Expected: PASS — the new generic test passes, and every pre-existing test (which calls `new BeatTimeline()` with no type argument) still passes unmodified, since `BeatEvent` remains the default type parameter.

Also run: `npm run build` to confirm `vizController.ts`'s `VizSource.beatAt(time): BeatEvent | null` and `AudioEngine.timeline: BeatTimeline` still type-check against the now-generic class (they should, since both rely on the default type parameter).

- [ ] **Step 5: Commit**

```bash
git add src/engine/beatTimeline.ts tests/engine/beatTimeline.test.ts
git commit -m "$(cat <<'EOF'
Genericize BeatTimeline so it can hold polyrhythm events too

BeatTimeline<T> defaults to BeatEvent (every existing call site is
unaffected). The polyrhythm scheduler (next commit) reuses this same
ring-buffer/beatAt lookup for its own event type instead of
duplicating it. beatPhase's parameter type is relaxed to the two
fields it actually reads, for the same reason.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `PolyScheduler` — two-layer event generation on one clock

**Files:**
- Create: `src/engine/polyScheduler.ts`
- Test: `tests/engine/polyScheduler.test.ts`

**Interfaces:**
- Consumes: `secondsPerBeat` from `./timing` (existing).
- Produces (consumed by Task 7):
  - `export interface PolyBeatEvent { time: number; duration: number; layer: 'A' | 'B'; index: number; n: number; cycleIndex: number }`
  - `export interface PolyPattern { bpm: number; polyrhythm: { enabled: boolean; a: number; b: number } }`
  - `export interface PolySchedulerOptions { getPattern: () => PolyPattern; onEvent: (beat: PolyBeatEvent) => void; lookahead?: number; startDelay?: number }`
  - `export class PolyScheduler { constructor(opts: PolySchedulerOptions); get isRunning(): boolean; start(now: number): void; stop(): void; tick(now: number): void }`

Design: one cycle = 4 beats at the current BPM (`cycleDuration = 4 * secondsPerBeat(bpm)`), independent of `beatsPerBar` (which is inert in polyrhythm mode). Layer A's event `i` lands at `cycleStart + (i/a) * cycleDuration`; layer B's event `i` at `cycleStart + (i/b) * cycleDuration`. `cycleStart` only ever advances by `+= cycleDuration` once a full cycle's events are scheduled — never re-measured from `now` — mirroring `Scheduler`'s own anti-drift rule.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/polyScheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type PolyBeatEvent, type PolyPattern, PolyScheduler } from '../../src/engine/polyScheduler';

function setup(pattern: Partial<PolyPattern['polyrhythm']> & { bpm?: number } = {}, lookahead = 1) {
  const p: PolyPattern = {
    bpm: pattern.bpm ?? 120,
    polyrhythm: { enabled: true, a: pattern.a ?? 3, b: pattern.b ?? 4 },
  };
  const events: PolyBeatEvent[] = [];
  const s = new PolyScheduler({
    getPattern: () => p,
    onEvent: (e) => events.push(e),
    lookahead,
    startDelay: 0.05,
  });
  return { s, events, p };
}

describe('PolyScheduler', () => {
  it('schedules a evenly-spaced A events and b evenly-spaced B events across one cycle', () => {
    // bpm 120 -> cycleDuration = 4 * 0.5 = 2s. a=3 -> A at 0, 2/3, 4/3. b=4 -> B at 0, 0.5, 1, 1.5.
    const { s, events } = setup({ a: 3, b: 4 }, 2.5);
    s.start(0);
    const a = events.filter((e) => e.layer === 'A').map((e) => e.time - 0.05);
    const b = events.filter((e) => e.layer === 'B').map((e) => e.time - 0.05);
    expect(a).toHaveLength(3);
    a.forEach((t, i) => expect(t).toBeCloseTo((i / 3) * 2, 9));
    expect(b).toHaveLength(4);
    b.forEach((t, i) => expect(t).toBeCloseTo((i / 4) * 2, 9));
  });

  it('does not crash and schedules both layers when a === b (fully aligned)', () => {
    const { s, events } = setup({ a: 4, b: 4 }, 2.5);
    s.start(0);
    expect(events.filter((e) => e.layer === 'A')).toHaveLength(4);
    expect(events.filter((e) => e.layer === 'B')).toHaveLength(4);
  });

  it('never drifts the cycle anchor across many cycles', () => {
    const { s, events } = setup({ a: 3, b: 4 }, 0.1);
    s.start(0);
    for (let i = 1; i <= 2000; i++) s.tick(i * 0.05);
    const cycleDuration = 2;
    const bEvents = events.filter((e) => e.layer === 'B' && e.index === 0);
    bEvents.forEach((e, cycle) => {
      expect(e.time).toBeCloseTo(0.05 + cycle * cycleDuration, 6);
    });
  });

  it('keeps the ratio and ordering correct at a fast, high-count cycle (a=16 at bpm=400)', () => {
    // cycleDuration = 4 * (60/400) = 0.6s; 16 A-events ~37.5ms apart.
    const { s, events } = setup({ a: 16, b: 2, bpm: 400 }, 0.7);
    s.start(0);
    const a = events.filter((e) => e.layer === 'A');
    expect(a).toHaveLength(16);
    a.forEach((e, i) => expect(e.index).toBe(i));
  });

  it('applies a ratio change only at the next cycle boundary, not mid-cycle', () => {
    const { s, events, p } = setup({ a: 3, b: 4 }, 2.5);
    s.start(0); // schedules the first full cycle (a=3, b=4)
    const firstCycleCount = events.length;
    p.polyrhythm.a = 5; // mutate the pattern the scheduler reads fresh each tick
    s.tick(2.05); // window now covers the second cycle
    const secondCycleA = events.filter((e) => e.cycleIndex === 1 && e.layer === 'A');
    expect(secondCycleA).toHaveLength(5);
    expect(events).toHaveLength(firstCycleCount + 5 + 4); // second cycle: 5 A + 4 B
  });

  it('does nothing before start() and stops scheduling after stop()', () => {
    const { s, events } = setup({}, 1);
    s.tick(5);
    expect(events).toHaveLength(0);
    s.start(0);
    s.stop();
    const countAfterStop = events.length;
    s.tick(10);
    expect(events).toHaveLength(countAfterStop);
    expect(s.isRunning).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/polyScheduler.test.ts`
Expected: FAIL — `src/engine/polyScheduler.ts` does not exist yet.

- [ ] **Step 3: Implement `PolyScheduler`**

Create `src/engine/polyScheduler.ts`:

```ts
import { secondsPerBeat } from './timing';

export interface PolyBeatEvent {
  /** AudioContext time at which this layer's click starts. */
  time: number;
  /** Seconds until this layer's next event, at the tempo in force when this event was scheduled. */
  duration: number;
  layer: 'A' | 'B';
  /** 0-based position within this layer's cycle (0..n-1). */
  index: number;
  /** This layer's event count for the cycle this event belongs to (the ratio's a or b). */
  n: number;
  /** 0-based count of cycles since start. */
  cycleIndex: number;
}

export interface PolyPattern {
  bpm: number;
  polyrhythm: { enabled: boolean; a: number; b: number };
}

export interface PolySchedulerOptions {
  getPattern: () => PolyPattern;
  onEvent: (beat: PolyBeatEvent) => void;
  /** How far ahead of `now` to schedule, in seconds. */
  lookahead?: number;
  /** Gap between start() and the first event, in seconds. */
  startDelay?: number;
}

/**
 * Schedules two independent, evenly-spaced event streams (layer A with `a` events, layer B with
 * `b` events) sharing one cycle of duration `4 * secondsPerBeat(bpm)`. Pure: never reads a clock
 * itself, callers pass `now` (AudioContext.currentTime). The cycle anchor is accumulated
 * (`cycleStart += cycleDuration`), never re-measured, so the two layers never drift apart.
 */
export class PolyScheduler {
  private readonly lookahead: number;
  private readonly startDelay: number;
  private cycleStart = 0;
  private cycleIndex = 0;
  private nextIndexA = 0;
  private nextIndexB = 0;
  private running = false;

  constructor(private readonly opts: PolySchedulerOptions) {
    this.lookahead = opts.lookahead ?? 0.1;
    this.startDelay = opts.startDelay ?? 0.05;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(now: number): void {
    this.running = true;
    this.cycleStart = now + this.startDelay;
    this.cycleIndex = 0;
    this.nextIndexA = 0;
    this.nextIndexB = 0;
    this.tick(now);
  }

  stop(): void {
    this.running = false;
  }

  private cycleDuration(bpm: number): number {
    return 4 * secondsPerBeat(bpm);
  }

  tick(now: number): void {
    if (!this.running) return;
    let { bpm, polyrhythm } = this.opts.getPattern();
    let duration = this.cycleDuration(bpm);
    const a = Math.max(2, polyrhythm.a);
    const b = Math.max(2, polyrhythm.b);

    // Genuine stall (the cycle has fallen more than a full look-ahead window behind): jump the
    // cycle anchor forward on the same grid instead of firing a burst of late events.
    if (this.cycleStart + duration < now - this.lookahead) {
      const missedCycles = Math.ceil((now - (this.cycleStart + duration)) / duration);
      this.cycleStart += missedCycles * duration;
      this.cycleIndex += missedCycles;
      this.nextIndexA = 0;
      this.nextIndexB = 0;
    }

    while (this.nextIndexA < a || this.nextIndexB < b) {
      ({ bpm, polyrhythm } = this.opts.getPattern());
      duration = this.cycleDuration(bpm);
      const timeA = this.nextIndexA < a ? this.cycleStart + (this.nextIndexA / a) * duration : Infinity;
      const timeB = this.nextIndexB < b ? this.cycleStart + (this.nextIndexB / b) * duration : Infinity;
      const nextTime = Math.min(timeA, timeB);
      if (nextTime >= now + this.lookahead) break;
      if (timeA <= timeB) {
        this.opts.onEvent({
          time: timeA,
          duration: duration / a,
          layer: 'A',
          index: this.nextIndexA,
          n: a,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexA++;
      } else {
        this.opts.onEvent({
          time: timeB,
          duration: duration / b,
          layer: 'B',
          index: this.nextIndexB,
          n: b,
          cycleIndex: this.cycleIndex,
        });
        this.nextIndexB++;
      }
    }

    if (this.nextIndexA >= a && this.nextIndexB >= b) {
      this.cycleStart += duration;
      this.cycleIndex++;
      this.nextIndexA = 0;
      this.nextIndexB = 0;
      this.tick(now); // pulls in the next cycle's due events within the same look-ahead window
    }
  }
}
```

Note: the next cycle's `a`/`b` are read fresh at the top of the recursive `tick(now)` call (via `this.opts.getPattern()`), so a ratio change made mid-cycle is picked up starting at the next cycle boundary, never retroactively applied to events already scheduled in the current cycle — this is what Review Focus item "toggling ratio mid-cycle" and the spec's "restart at next cycle boundary" requirement rely on.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/polyScheduler.test.ts`
Expected: PASS. If the drift or ratio-change tests fail, check the failure message against the design note above — the most likely bug is `duration` capturing a stale value from before the `while` loop's last iteration when the loop exits via the `<` conditions rather than the `break`; adjust so `this.cycleStart += duration` always uses the `duration` computed in the loop's final iteration (it already does, since `duration` is declared with `let` outside the loop and reassigned every iteration).

- [ ] **Step 5: Commit**

```bash
git add src/engine/polyScheduler.ts tests/engine/polyScheduler.test.ts
git commit -m "$(cat <<'EOF'
Add PolyScheduler: two-layer polyrhythm event generation on one clock

Layer A (a events/cycle) and layer B (b events/cycle) share one cycle
duration (4 beats at the current bpm), both derived from the same
accumulated cycle anchor so they never drift apart. Mirrors the
existing Scheduler's look-ahead/never-re-measure/skip-missed rules,
generalized to two interleaved streams instead of one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire `PolyScheduler` into `AudioEngine`

**Files:**
- Modify: `src/engine/audioEngine.ts`
- Modify: `src/main.ts` (constructor call site only)

**Interfaces:**
- Consumes: `PolyScheduler`, `PolyBeatEvent`, `PolyPattern` from `./polyScheduler` (Task 6); `BeatTimeline<T>` (Task 5).
- Produces:
  - `AudioEngineOptions` gains `getPolyPattern: () => PolyPattern`.
  - `AudioEngine` gains: `readonly polyTimelineA: BeatTimeline<PolyBeatEvent>`, `readonly polyTimelineB: BeatTimeline<PolyBeatEvent>`, `setPolySound(slot: 'polyA' | 'polyB', pcm: PcmData): void`.
  - `AudioEngine.running`, `.start()`, `.stop()` now account for whichever scheduler (standard or poly) is active.

This is browser-glue code (real `AudioContext`/`Worker`), manually verified per the project's existing split — no new unit tests here (consistent with `audioEngine.ts` having none today).

- [ ] **Step 1: Modify `src/engine/audioEngine.ts`**

Update the imports:

```ts
import type { PcmData } from '../sounds/pcm';
import { BeatTimeline } from './beatTimeline';
import { computeHeardTime } from './clock';
import { type PolyBeatEvent, type PolyPattern, PolyScheduler } from './polyScheduler';
import { type BeatEvent, type Pattern, Scheduler, type SchedulerStats } from './scheduler';
```

Update `SoundSlot`/add `PolySoundSlot` and `AudioEngineOptions`:

```ts
export type SoundSlot = 'accent' | 'normal';
export type PolySoundSlot = 'polyA' | 'polyB';

export interface AudioEngineOptions {
  getPattern: () => Pattern;
  getPolyPattern: () => PolyPattern;
}
```

In the class body, change the `timeline` field and add poly fields/scheduler:

```ts
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly timeline = new BeatTimeline<BeatEvent>();
  readonly polyTimelineA = new BeatTimeline<PolyBeatEvent>();
  readonly polyTimelineB = new BeatTimeline<PolyBeatEvent>();
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly polyScheduler: PolyScheduler;
  private readonly getPolyPattern: () => PolyPattern;
  private readonly worker: Worker;
  private readonly buffers: Record<SoundSlot, AudioBuffer | null> = { accent: null, normal: null };
  private readonly polyBuffers: Record<PolySoundSlot, AudioBuffer | null> = {
    polyA: null,
    polyB: null,
  };
  private readonly active = new Set<AudioBufferSourceNode>();
  private readonly silentUnlock: HTMLAudioElement;

  constructor(opts: AudioEngineOptions) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.getPolyPattern = opts.getPolyPattern;
    this.scheduler = new Scheduler({
      getPattern: opts.getPattern,
      onBeat: (b) => this.playBeat(b),
      onSubdivision: (time) => this.playSubdivision(time),
    });
    this.polyScheduler = new PolyScheduler({
      getPattern: opts.getPolyPattern,
      onEvent: (e) => this.playPolyBeat(e),
    });
    this.worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => {
      const now = this.ctx.currentTime;
      this.scheduler.tick(now);
      this.polyScheduler.tick(now);
    };
    this.silentUnlock = new Audio(SILENT_LOOP_SRC);
    this.silentUnlock.loop = true;
    this.silentUnlock.volume = 0;
    const tryResume = () => {
      if (!this.scheduler.isRunning && !this.polyScheduler.isRunning) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.silentUnlock.paused) this.silentUnlock.play().catch(() => {});
    };
    this.ctx.addEventListener('statechange', tryResume);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryResume();
    });
    window.addEventListener('pageshow', tryResume);
  }

  get running(): boolean {
    return this.scheduler.isRunning || this.polyScheduler.isRunning;
  }
```

`sampleRate`/`stats` stay as-is (stats can stay scoped to the standard scheduler — the debug overlay is not part of this feature's scope).

Update `start()`/`stop()`:

```ts
  async start(): Promise<void> {
    if (this.scheduler.isRunning || this.polyScheduler.isRunning) return;
    await Promise.all([this.ctx.resume(), this.silentUnlock.play().catch(() => {})]);
    this.timeline.clear();
    this.polyTimelineA.clear();
    this.polyTimelineB.clear();
    const now = this.ctx.currentTime;
    if (this.getPolyPattern().polyrhythm.enabled) {
      this.polyScheduler.start(now);
    } else {
      this.scheduler.start(now);
    }
    this.worker.postMessage('start');
  }

  stop(): void {
    this.scheduler.stop();
    this.polyScheduler.stop();
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
    this.polyTimelineA.clear();
    this.polyTimelineB.clear();
    this.silentUnlock.pause();
    this.ctx.suspend().catch(() => {
      // Nothing to do: the context is already closed or the browser refused.
    });
  }
```

Add `setPolySound` next to `setSound`:

```ts
  setSound(slot: SoundSlot, pcm: PcmData): void {
    this.buffers[slot] = this.toBuffer(pcm);
  }

  setPolySound(slot: PolySoundSlot, pcm: PcmData): void {
    this.polyBuffers[slot] = this.toBuffer(pcm);
  }
```

Add `playPolyBeat` next to `playBeat`:

```ts
  private playPolyBeat(beat: PolyBeatEvent): void {
    (beat.layer === 'A' ? this.polyTimelineA : this.polyTimelineB).push(beat);
    const buffer = this.polyBuffers[beat.layer === 'A' ? 'polyA' : 'polyB'];
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
```

- [ ] **Step 2: Update the construction call site in `src/main.ts`**

Change:

```ts
const engine = new AudioEngine({ getPattern: () => store.get() });
```

to:

```ts
const engine = new AudioEngine({ getPattern: () => store.get(), getPolyPattern: () => store.get() });
```

(`Settings` structurally satisfies both `Pattern` and `PolyPattern` once Task 4 has added `polyrhythm` to it — no other change needed here.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. With `polyrhythm.enabled` still `false` by default (no UI to toggle it yet — that's Task 10), confirm the metronome starts/stops and sounds exactly as before this change (the standard `Scheduler` path is unaffected; this task only adds a second, currently-unreachable path).

- [ ] **Step 5: Commit**

```bash
git add src/engine/audioEngine.ts src/main.ts
git commit -m "$(cat <<'EOF'
Wire PolyScheduler into AudioEngine

AudioEngine now owns both the standard Scheduler and the new
PolyScheduler; start() picks whichever the current settings call for,
stop() stops both unconditionally. Two new sound slots (polyA/polyB)
and two BeatTimeline<PolyBeatEvent> instances let the visualizer poll
recent polyrhythm events the same way it already polls standard beats.
Nothing reaches this path yet — polyrhythm.enabled has no UI toggle
until a later commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Polyrhythm geometry and pure frame computation

**Files:**
- Create: `src/viz/polyGeometry.ts`
- Create: `src/viz/polyFrame.ts`
- Test: `tests/viz/polyGeometry.test.ts`
- Test: `tests/viz/polyFrame.test.ts`

**Interfaces:**
- Consumes: `GLOW_SECONDS`, `glowIntensity` from `./geometry` (existing); `PolyBeatEvent` from `../engine/polyScheduler` (Task 6).
- Produces (consumed by Task 9):
  - `export function polygonVertices(n: number, cx: number, cy: number, radius: number): { x: number; y: number }[]`
  - `export function polyStageLayout(width: number, height: number): { cx: number; cy: number; radius: number }`
  - `export interface PolyFrame { running: boolean; a: number; b: number; activeIndexA: number; activeIndexB: number; glowA: number; glowB: number; reducedMotion: boolean }`
  - `export interface PolyFrameInput { running: boolean; beatA: PolyBeatEvent | null; beatB: PolyBeatEvent | null; heardTime: number; a: number; b: number; reducedMotion: boolean }`
  - `export function computePolyFrame(input: PolyFrameInput): PolyFrame`

- [ ] **Step 1: Write the failing geometry tests**

Create `tests/viz/polyGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { polygonVertices, polyStageLayout } from '../../src/viz/polyGeometry';

describe('polygonVertices', () => {
  it('places n vertices evenly spaced around a circle, starting at 12 o\'clock', () => {
    const v = polygonVertices(4, 0, 0, 10);
    expect(v).toHaveLength(4);
    expect(v[0]?.x).toBeCloseTo(0);
    expect(v[0]?.y).toBeCloseTo(-10);
    expect(v[1]?.x).toBeCloseTo(10);
    expect(v[1]?.y).toBeCloseTo(0);
  });

  it('produces a 3-vertex triangle for n=3', () => {
    const v = polygonVertices(3, 0, 0, 10);
    expect(v).toHaveLength(3);
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y);
    const d01 = dist(v[0]!, v[1]!);
    const d12 = dist(v[1]!, v[2]!);
    const d20 = dist(v[2]!, v[0]!);
    expect(d01).toBeCloseTo(d12, 5);
    expect(d12).toBeCloseTo(d20, 5);
  });

  it('supports the full 2..16 range without error', () => {
    for (let n = 2; n <= 16; n++) {
      expect(polygonVertices(n, 0, 0, 10)).toHaveLength(n);
    }
  });
});

describe('polyStageLayout', () => {
  it('centers in the smaller dimension and leaves padding', () => {
    const l = polyStageLayout(400, 300);
    expect(l.cx).toBe(200);
    expect(l.cy).toBe(150);
    expect(l.radius).toBeLessThan(150);
    expect(l.radius).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/viz/polyGeometry.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/viz/polyGeometry.ts`**

```ts
export function polygonVertices(
  n: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

/** The shared square region both polygon layers are inscribed in, centered like circularLayout. */
export function polyStageLayout(width: number, height: number) {
  const size = Math.min(width, height);
  const pad = Math.max(18, size * 0.12);
  const radius = Math.max(10, size / 2 - pad);
  return { cx: width / 2, cy: height / 2, radius };
}
```

- [ ] **Step 4: Run geometry tests to verify they pass**

Run: `npx vitest run tests/viz/polyGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing frame tests**

Create `tests/viz/polyFrame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePolyFrame } from '../../src/viz/polyFrame';
import type { PolyBeatEvent } from '../../src/engine/polyScheduler';

const event = (layer: 'A' | 'B', index: number, time: number, duration = 0.5): PolyBeatEvent => ({
  time,
  duration,
  layer,
  index,
  n: layer === 'A' ? 3 : 4,
  cycleIndex: 0,
});

describe('computePolyFrame', () => {
  it('reports idle (-1, no glow) when not running', () => {
    const f = computePolyFrame({
      running: false,
      beatA: event('A', 1, 1),
      beatB: event('B', 2, 1),
      heardTime: 1,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(-1);
    expect(f.activeIndexB).toBe(-1);
    expect(f.glowA).toBe(0);
    expect(f.glowB).toBe(0);
  });

  it('reports each layer\'s most recent event index and full glow right at its onset', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 1, 2),
      beatB: event('B', 3, 2),
      heardTime: 2,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(1);
    expect(f.activeIndexB).toBe(3);
    expect(f.glowA).toBeCloseTo(1);
    expect(f.glowB).toBeCloseTo(1);
  });

  it('decays glow to 0 well after the event', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 0, 0),
      beatB: null,
      heardTime: 1,
      a: 3,
      b: 4,
      reducedMotion: false,
    });
    expect(f.glowA).toBe(0);
  });

  it('handles a === b (fully aligned layers) without special-casing', () => {
    const f = computePolyFrame({
      running: true,
      beatA: event('A', 2, 1),
      beatB: event('B', 2, 1),
      heardTime: 1,
      a: 4,
      b: 4,
      reducedMotion: false,
    });
    expect(f.activeIndexA).toBe(2);
    expect(f.activeIndexB).toBe(2);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/viz/polyFrame.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement `src/viz/polyFrame.ts`**

```ts
import type { PolyBeatEvent } from '../engine/polyScheduler';
import { GLOW_SECONDS, glowIntensity } from './geometry';

export interface PolyFrame {
  running: boolean;
  a: number;
  b: number;
  /** Index of the most recently heard event in this layer; -1 when idle. */
  activeIndexA: number;
  activeIndexB: number;
  /** 0..1 flash intensity of the active vertex in this layer. */
  glowA: number;
  glowB: number;
  reducedMotion: boolean;
}

export interface PolyFrameInput {
  running: boolean;
  beatA: PolyBeatEvent | null;
  beatB: PolyBeatEvent | null;
  heardTime: number;
  a: number;
  b: number;
  reducedMotion: boolean;
}

function glowFor(beat: PolyBeatEvent | null, heardTime: number): number {
  if (!beat) return 0;
  const since = heardTime - beat.time;
  const decay = Math.min(GLOW_SECONDS, beat.duration * 0.9);
  return glowIntensity(since, decay);
}

export function computePolyFrame(input: PolyFrameInput): PolyFrame {
  if (!input.running) {
    return {
      running: false,
      a: input.a,
      b: input.b,
      activeIndexA: -1,
      activeIndexB: -1,
      glowA: 0,
      glowB: 0,
      reducedMotion: input.reducedMotion,
    };
  }
  return {
    running: true,
    a: input.a,
    b: input.b,
    activeIndexA: input.beatA?.index ?? -1,
    activeIndexB: input.beatB?.index ?? -1,
    glowA: glowFor(input.beatA, input.heardTime),
    glowB: glowFor(input.beatB, input.heardTime),
    reducedMotion: input.reducedMotion,
  };
}
```

- [ ] **Step 8: Run frame tests to verify they pass**

Run: `npx vitest run tests/viz/polyFrame.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/viz/polyGeometry.ts src/viz/polyFrame.ts tests/viz/polyGeometry.test.ts tests/viz/polyFrame.test.ts
git commit -m "$(cat <<'EOF'
Add pure geometry and frame math for the Polyrhythm visualizer

polygonVertices computes n evenly-spaced points at runtime (no
per-ratio assets); computePolyFrame turns the two layers' most recent
PolyBeatEvents plus heardTime into a pure PolyFrame (active
vertex/glow per layer), mirroring how computeFrame already derives the
standard visualizer's frame from heard time alone.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Polyrhythm draw path + `VizController` wiring

**Files:**
- Create: `src/viz/polyrhythm.ts`
- Modify: `src/viz/vizController.ts`
- Modify: `src/main.ts` (`VizController` construction call site)

**Interfaces:**
- Consumes: `polygonVertices`, `polyStageLayout` (Task 8); `computePolyFrame`, `PolyFrame` (Task 8); `drawNode` (existing); `PolyBeatEvent` (Task 6).
- Produces:
  - `export function drawPolyrhythm(ctx: CanvasRenderingContext2D, size: {width;height}, frame: PolyFrame, theme: VizTheme): void`
  - `VizSource` interface gains `polyBeatAt(layer: 'A' | 'B', time: number): PolyBeatEvent | null`.

No new unit tests — canvas drawing and the `VizController` polling loop are manually verified, consistent with `circular.ts`/`linear.ts`/`vizController.ts` having none today.

- [ ] **Step 1: Create `src/viz/polyrhythm.ts`**

```ts
import { drawNode } from './drawNode';
import type { PolyFrame } from './polyFrame';
import { polygonVertices, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

const NODE_RADIUS = 10;

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const { cx, cy, radius } = polyStageLayout(size.width, size.height);
  const verticesA = polygonVertices(frame.a, cx, cy, radius);
  const verticesB = polygonVertices(frame.b, cx, cy, radius);

  drawLayer(ctx, verticesA, theme.ring, frame.activeIndexA, frame.reducedMotion ? 0 : frame.glowA, theme);
  drawLayer(ctx, verticesB, theme.accent, frame.activeIndexB, frame.reducedMotion ? 0 : frame.glowB, theme);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  strokeStyle: string,
  activeIndex: number,
  glow: number,
  theme: VizTheme,
): void {
  if (vertices.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  vertices.forEach((v, i) => {
    const level = i === activeIndex ? 'accent' : 'normal';
    const g = i === activeIndex ? glow : 0;
    drawNode(ctx, v.x, v.y, NODE_RADIUS, level, g, theme);
  });
}
```

This reuses `drawNode` (the same glowing-sphere draw call the standard visualizers use) so the polyrhythm view inherits the existing glow/color/shadow visual language for free, per the spec's "inherit the existing visual language" requirement — no new decorative code.

- [ ] **Step 2: Modify `src/viz/vizController.ts`**

Update imports:

```ts
import type { BeatEvent } from '../engine/scheduler';
import type { PolyBeatEvent } from '../engine/polyScheduler';
import type { BeatLevel, Settings } from '../state/settings';
import { circularVisualizer } from './circular';
import { drawNode } from './drawNode';
import { computeFrame } from './frame';
import { circularLayout } from './geometry';
import { circularBeatAt, linearBeatAt } from './hitTest';
import { linearVisualizer } from './linear';
import { NodeSpriteCache, spriteSize } from './nodeSprite';
import { computePolyFrame } from './polyFrame';
import { drawPolyrhythm } from './polyrhythm';
import { shouldAnimate } from './renderPolicy';
import type { VizTheme } from './types';
```

Update `VizSource`:

```ts
export interface VizSource {
  running(): boolean;
  /** Audio time currently heard, already shifted by the sync offset. */
  heardTime(): number;
  beatAt(time: number): BeatEvent | null;
  polyBeatAt(layer: 'A' | 'B', time: number): PolyBeatEvent | null;
}
```

Replace the `render()` method:

```ts
  private render(): void {
    if (this.size.width === 0) return;
    const s = this.getSettings();
    if (s.theme !== this.themeName) {
      this.themeName = s.theme;
      this.theme = readTheme(this.canvas);
    }
    this.sprites.setContext(s.theme, this.dpr);
    const heard = this.source.heardTime();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (s.polyrhythm.enabled) {
      const beatA = this.source.polyBeatAt('A', heard);
      const beatB = this.source.polyBeatAt('B', heard);
      const frame = computePolyFrame({
        running: this.source.running(),
        beatA,
        beatB,
        heardTime: heard,
        a: s.polyrhythm.a,
        b: s.polyrhythm.b,
        reducedMotion: this.reducedMotion.matches,
      });
      drawPolyrhythm(this.ctx, this.size, frame, this.theme);
      this.lastGlow = Math.max(frame.glowA, frame.glowB);
      return;
    }

    const beat = this.source.beatAt(heard);
    const frame = computeFrame({
      running: this.source.running(),
      beat,
      heardTime: heard,
      beatsPerBar: s.beatsPerBar,
      levels: s.levels,
      reducedMotion: this.reducedMotion.matches,
    });
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme, this.sprites);
    if (frame.glow > this.lastGlow) {
      const level =
        frame.levels[frame.activeBeat] ?? (frame.activeBeat === 0 ? 'accent' : 'normal');
      this.onBeatStart?.(level, beat?.barIndex ?? 0);
    }
    this.lastGlow = frame.glow;
  }
```

Note: `onBeatStart` (knob flash, dial-hub pulse, haptics, bar counter — all wired in `main.ts`) intentionally does not fire in polyrhythm mode in this iteration; polyrhythm mode has no single "bar downbeat" concept those callbacks assume. This is a deliberate, documented scope cut, not an oversight — flag it to the user during review if a knob-flash-on-polyrhythm-beat feels expected later.

Also note `onPointerDown` (tap-to-cycle-beat-level) still reads `s.beatsPerBar`/dispatches through `circularBeatAt`/`linearBeatAt` regardless of mode — tapping the canvas in polyrhythm mode will hit-test against the *standard* layout's (now-invisible) node positions and may incorrectly fire `onBeatTap`. Guard it:

```ts
  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.onBeatTap) return;
    const s = this.getSettings();
    if (!s.beatsClickable || s.polyrhythm.enabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index =
      s.visualizer === 'linear'
        ? linearBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar)
        : circularBeatAt(x, y, this.size.width, this.size.height, s.beatsPerBar);
    if (index >= 0) this.onBeatTap(index);
  };
```

- [ ] **Step 3: Update the `VizController` construction call site in `src/main.ts`**

Change the `source` object literal passed to `new VizController(...)`:

```ts
const viz = new VizController(
  byId<HTMLCanvasElement>('viz'),
  {
    running: () => engine.running,
    heardTime: () => engine.heardTime(store.get().syncOffsetMs),
    beatAt: (time) => engine.timeline.beatAt(time),
    polyBeatAt: (layer, time) =>
      (layer === 'A' ? engine.polyTimelineA : engine.polyTimelineB).beatAt(time),
  },
  () => store.get(),
  (index) => store.set({ levels: cycleBeatLevel(store.get().levels, index) }),
  (level, barIndex) => {
    /* unchanged */
  },
);
```

(Only the `source` object's third field is new — the rest of the existing call is unchanged; do not rewrite the `onBeatStart` callback body.)

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Since there's still no UI to enable `polyrhythm.enabled` (Task 10), temporarily flip the default in `DEFAULT_SETTINGS.polyrhythm.enabled` to `true` in a scratch local edit (do not commit this), reload, and confirm:
- The canvas draws two overlaid polygons (default 3:4 → a triangle and a quadrilateral) centered in the stage.
- Starting playback animates a glow around each polygon's active vertex independently, at the correct relative speeds (the 4-vertex layer should glow noticeably faster than the 3-vertex layer).
- No console errors.
Revert the scratch edit afterward (`git diff` should show no changes to `settings.ts` before committing).

- [ ] **Step 6: Commit**

```bash
git add src/viz/polyrhythm.ts src/viz/vizController.ts src/main.ts
git commit -m "$(cat <<'EOF'
Wire the Polyrhythm draw path into VizController

VizController.render() branches on settings.polyrhythm.enabled: when
on, it polls both layers' most recent PolyBeatEvent, computes a pure
PolyFrame, and draws two synchronized polygons via drawPolyrhythm
instead of dispatching to the circular/linear Visualizer. Tap-to-cycle
hit testing is disabled while polyrhythm mode is active, since it has
no beatsPerBar-shaped node grid to hit-test against.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Polyrhythm UI — Signature control mode toggle, ratio steppers, sound pickers

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/i18n/translations.ts`
- Create: `src/ui/polyrhythmDialog.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `clampPolyCount` (Task 4); `Store<Settings>` (existing); `SoundStore` (existing); `BUILTIN_SOUNDS` (existing, from `src/sounds/synth.ts`); `t` (existing, from `src/i18n/i18n.ts`).
- Produces: `export function mountPolyrhythmControls(deps: { store: Store<Settings>; sounds: SoundStore }): void`, called once from `main.ts`.

No new unit tests — DOM wiring is manually verified, consistent with every other `mount*Dialog` module.

- [ ] **Step 1: Add markup to `index.html`'s `#signatureDialog`**

Locate the `<dialog id="signatureDialog" ...>` block (around line 353). Immediately after the `<form class="sheet-head">...</form>` and before the existing presets `<div class="segmented" ...>`, insert the mode toggle:

```html
      <div class="segmented" role="radiogroup" data-i18n-aria-label="sigDialog.modeAriaLabel" aria-label="Signature mode">
        <button type="button" role="radio" class="segment" data-sig-mode="standard" aria-checked="true" data-i18n="sigDialog.modeStandard">Standard</button>
        <button type="button" role="radio" class="segment" data-sig-mode="polyrhythm" aria-checked="false" data-i18n="sigDialog.modePolyrhythm">Polyrhythm</button>
      </div>
```

Add `data-standard-block` to each of the four existing standard-only elements so they can be hidden in polyrhythm mode (do not otherwise change their content):

```html
      <div class="segmented" role="radiogroup" data-i18n-aria-label="presets.ariaLabel" aria-label="Time signature presets" data-standard-block>
        ...unchanged preset buttons...
      </div>
      <div class="picker-block" data-standard-block>
        ...unchanged Beats block...
      </div>
      <div class="picker-block" data-standard-block>
        ...unchanged Note value block...
      </div>
      <h3 class="sheet-sub" data-i18n="subdivision.title" data-standard-block>Subdivision</h3>
      <div class="unit-row" role="radiogroup" data-i18n-aria-label="subdivision.ariaLabel" aria-label="Click subdivision" data-standard-block>
        ...unchanged subdivision chips...
      </div>
```

Then add the new polyrhythm block, right before the closing `</dialog>` tag:

```html
      <div id="polyBlock" class="picker-block" hidden>
        <h3 class="sheet-sub" data-i18n="sigDialog.polyLayerA">Layer A</h3>
        <div class="stepper">
          <button type="button" id="polyADown" class="nudge" data-i18n-aria-label="nudge.fewerPolyA" aria-label="Fewer Layer A events">−</button>
          <output id="polyAValue" class="stepper-value">3</output>
          <button type="button" id="polyAUp" class="nudge" data-i18n-aria-label="nudge.morePolyA" aria-label="More Layer A events">+</button>
        </div>
        <select id="polySoundA" data-i18n-aria-label="sigDialog.polySoundA" aria-label="Layer A sound"></select>

        <h3 class="sheet-sub" data-i18n="sigDialog.polyLayerB">Layer B</h3>
        <div class="stepper">
          <button type="button" id="polyBDown" class="nudge" data-i18n-aria-label="nudge.fewerPolyB" aria-label="Fewer Layer B events">−</button>
          <output id="polyBValue" class="stepper-value">4</output>
          <button type="button" id="polyBUp" class="nudge" data-i18n-aria-label="nudge.morePolyB" aria-label="More Layer B events">+</button>
        </div>
        <select id="polySoundB" data-i18n-aria-label="sigDialog.polySoundB" aria-label="Layer B sound"></select>
      </div>
```

- [ ] **Step 2: Add CSS for hiding the dial hub in polyrhythm mode**

In `src/styles.css`, right after the existing rule (around line 566):

```css
.stage[data-viz="linear"] .dial-hub {
  display: none;
}
```

add:

```css
.stage[data-polyrhythm="true"] .dial-hub {
  display: none;
}
```

No other CSS changes are needed — `#polyBlock` reuses `.picker-block`/`.stepper`/`.nudge`/`.stepper-value` (already styled) and the new `<select>` elements reuse the browser-default select styling already applied to `#accentSelect`/`#normalSelect` in the Sound dialog (no dedicated class exists for those either — confirm this by checking `styles.css` for a bare `select` element rule before assuming none is needed; if one exists, the new selects inherit it automatically since no new class is introduced).

- [ ] **Step 3: Add translation keys**

In `src/i18n/translations.ts`, in the `en` block, after `'sigDialog.noteValueTitle': 'Note value',` (around line 30):

```ts
    'sigDialog.modeAriaLabel': 'Signature mode',
    'sigDialog.modeStandard': 'Standard',
    'sigDialog.modePolyrhythm': 'Polyrhythm',
    'sigDialog.polyLayerA': 'Layer A',
    'sigDialog.polyLayerB': 'Layer B',
    'sigDialog.polySoundA': 'Layer A sound',
    'sigDialog.polySoundB': 'Layer B sound',
    'nudge.fewerPolyA': 'Fewer Layer A events',
    'nudge.morePolyA': 'More Layer A events',
    'nudge.fewerPolyB': 'Fewer Layer B events',
    'nudge.morePolyB': 'More Layer B events',
```

In the `tr` block, after `'sigDialog.noteValueTitle': 'Nota değeri',` (around line 162):

```ts
    'sigDialog.modeAriaLabel': 'Ölçü modu',
    'sigDialog.modeStandard': 'Standart',
    'sigDialog.modePolyrhythm': 'Poliritim',
    'sigDialog.polyLayerA': 'Katman A',
    'sigDialog.polyLayerB': 'Katman B',
    'sigDialog.polySoundA': 'Katman A sesi',
    'sigDialog.polySoundB': 'Katman B sesi',
    'nudge.fewerPolyA': 'Daha az A olayı',
    'nudge.morePolyA': 'Daha fazla A olayı',
    'nudge.fewerPolyB': 'Daha az B olayı',
    'nudge.morePolyB': 'Daha fazla B olayı',
```

- [ ] **Step 4: Create `src/ui/polyrhythmDialog.ts`**

```ts
import { t } from '../i18n/i18n';
import type { SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { clampPolyCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export interface PolyrhythmControlsDeps {
  store: Store<Settings>;
  sounds: SoundStore;
}

/** Lives inside the existing #signatureDialog sheet (see signatureDialog.ts) — a separate
 *  module purely to keep each file focused on one concern within the shared dialog. */
export function mountPolyrhythmControls({ store, sounds }: PolyrhythmControlsDeps): void {
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#signatureDialog [data-sig-mode]'),
  );
  const standardBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('#signatureDialog [data-standard-block]'),
  );
  const polyBlock = byId('polyBlock');
  const aValue = byId('polyAValue');
  const bValue = byId('polyBValue');
  const soundASelect = byId<HTMLSelectElement>('polySoundA');
  const soundBSelect = byId<HTMLSelectElement>('polySoundB');

  const setMode = (enabled: boolean) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, enabled } });
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.sigMode === 'polyrhythm'));
  }

  const setA = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, a: clampPolyCount(n) } });
  const setB = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, b: clampPolyCount(n) } });
  byId('polyADown').addEventListener('click', () => setA(store.get().polyrhythm.a - 1));
  byId('polyAUp').addEventListener('click', () => setA(store.get().polyrhythm.a + 1));
  byId('polyBDown').addEventListener('click', () => setB(store.get().polyrhythm.b - 1));
  byId('polyBUp').addEventListener('click', () => setB(store.get().polyrhythm.b + 1));

  async function fillSoundSelect(select: HTMLSelectElement, current: string): Promise<void> {
    const builtin = document.createElement('optgroup');
    builtin.label = t('soundGroup.builtin');
    for (const [id, sound] of Object.entries(BUILTIN_SOUNDS)) {
      builtin.append(new Option(sound.name, id));
    }
    const groups: HTMLElement[] = [builtin];
    try {
      const userSounds = await sounds.list();
      if (userSounds.length > 0) {
        const mine = document.createElement('optgroup');
        mine.label = t('soundGroup.yours');
        for (const sound of userSounds) mine.append(new Option(sound.name, sound.id));
        groups.push(mine);
      }
    } catch {
      // User sound list unavailable (private window, etc.) — builtin sounds still work.
    }
    select.replaceChildren(...groups);
    select.value = current;
  }

  soundASelect.addEventListener('change', () =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, soundIdA: soundASelect.value } }),
  );
  soundBSelect.addEventListener('change', () =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, soundIdB: soundBSelect.value } }),
  );

  const render = (s: Settings) => {
    const enabled = s.polyrhythm.enabled;
    for (const button of modeButtons) {
      const isPoly = button.dataset.sigMode === 'polyrhythm';
      button.setAttribute('aria-checked', String(isPoly === enabled));
    }
    polyBlock.hidden = !enabled;
    for (const block of standardBlocks) block.hidden = enabled;
    aValue.textContent = String(s.polyrhythm.a);
    bValue.textContent = String(s.polyrhythm.b);
    if (soundASelect.value !== s.polyrhythm.soundIdA) soundASelect.value = s.polyrhythm.soundIdA;
    if (soundBSelect.value !== s.polyrhythm.soundIdB) soundBSelect.value = s.polyrhythm.soundIdB;
  };

  void Promise.all([
    fillSoundSelect(soundASelect, store.get().polyrhythm.soundIdA),
    fillSoundSelect(soundBSelect, store.get().polyrhythm.soundIdB),
  ]).then(() => render(store.get()));
  render(store.get());
  store.subscribe(render);
}
```

- [ ] **Step 5: Wire everything up in `src/main.ts`**

Add the import:

```ts
import { mountPolyrhythmControls } from './ui/polyrhythmDialog';
```

Right after the existing `mountSignatureDialog({ store });` line, add:

```ts
mountSignatureDialog({ store });
mountPolyrhythmControls({ store, sounds });
```

Set up the `polyA`/`polyB` sound engine wiring, mirroring the existing `applySound`/`slotRequest` pattern for `accent`/`normal`. Add near `applySound`:

```ts
const polySlotRequest: Record<'polyA' | 'polyB', number> = { polyA: 0, polyB: 0 };

async function applyPolySound(slot: 'polyA' | 'polyB'): Promise<void> {
  const request = ++polySlotRequest[slot];
  const s = store.get();
  const id = slot === 'polyA' ? s.polyrhythm.soundIdA : s.polyrhythm.soundIdB;
  const fallback = slot === 'polyA' ? DEFAULT_SETTINGS.polyrhythm.soundIdA : DEFAULT_SETTINGS.polyrhythm.soundIdB;
  const result = await library.resolve(id, fallback);
  if (request !== polySlotRequest[slot]) return;
  engine.setPolySound(slot, result.pcm);
  if (result.error) {
    toast(format('toast.soundLoadError', { error: result.error }));
    store.set({
      polyrhythm: {
        ...store.get().polyrhythm,
        ...(slot === 'polyA' ? { soundIdA: fallback } : { soundIdB: fallback }),
      },
    });
  }
}

store.subscribe((s, prev) => {
  if (s.polyrhythm.soundIdA !== prev.polyrhythm.soundIdA) void applyPolySound('polyA');
  if (s.polyrhythm.soundIdB !== prev.polyrhythm.soundIdB) void applyPolySound('polyB');
});
```

Add this call alongside the existing initial-sound-loading block (`void Promise.all([applySound('accent'), applySound('normal')])...`) so the polyrhythm sounds are loaded up front too — extend that same `Promise.all` array:

```ts
knob.setDisabled(true);
void Promise.all([
  applySound('accent'),
  applySound('normal'),
  applyPolySound('polyA'),
  applyPolySound('polyB'),
]).finally(() => {
  knob.setDisabled(false);
});
```

Add the `data-polyrhythm` stage attribute toggle, next to the existing `store.subscribe(() => viz.invalidate())` line:

```ts
store.subscribe(() => viz.invalidate());
store.subscribe((s) => {
  byId('stage').dataset.polyrhythm = String(s.polyrhythm.enabled);
});
byId('stage').dataset.polyrhythm = String(store.get().polyrhythm.enabled);
```

Finally, handle switching Standard ↔ Polyrhythm mode **while the metronome is playing** (Review Focus item): without this, toggling the mode mid-play would leave the old scheduler running underneath the new one, since neither `AudioEngine.start()` nor `.stop()` is otherwise triggered by a settings change. Add:

```ts
store.subscribe((s, prev) => {
  if (s.polyrhythm.enabled !== prev.polyrhythm.enabled && engine.running) {
    engine.stop();
    void engine.start();
  }
});
```

- [ ] **Step 6: Type-check and lint**

Run: `npm run build`
Expected: no TypeScript errors.

Run: `npm run lint`
Expected: no Biome errors.

- [ ] **Step 7: Manual verification (end-to-end)**

Run: `npm run dev`.

1. Open Settings → Signature. Confirm a "Standard / Polyrhythm" pill appears above the existing presets, defaulting to Standard.
2. Switch to Polyrhythm: the existing presets/beats/note-value/subdivision controls hide; Layer A (default 3) and Layer B (default 4) steppers and sound selects appear.
3. Change Layer A to 5 and Layer B to 7 using the +/- steppers; confirm the values update immediately.
4. Pick different sounds for Layer A and Layer B from their selects.
5. Close the dialog and start the metronome (tap the knob). Confirm:
   - Two audibly distinct clicks play, at rates consistent with a 5:7 polyrhythm (Layer B noticeably faster/denser than Layer A).
   - The canvas shows two polygons (a pentagon and a heptagon) with independently glowing active vertices in sync with what's heard.
   - The dial hub is hidden.
6. While still playing, reopen Signature and switch back to Standard. Confirm the polyrhythm audio stops cleanly and the standard beat (with whatever beatsPerBar was previously set) starts immediately, with no overlapping/doubled audio.
7. Switch back to Polyrhythm while playing; confirm the reverse also works cleanly.
8. Reload the page; confirm the polyrhythm settings (mode, a, b, sounds) persisted via `localStorage`.
9. Test on a narrow (mobile-width) viewport via browser dev tools: confirm the Signature dialog's new controls and the polyrhythm canvas both remain usable and the square stage stays square.

- [ ] **Step 8: Commit**

```bash
git add index.html src/styles.css src/i18n/translations.ts src/ui/polyrhythmDialog.ts src/main.ts
git commit -m "$(cat <<'EOF'
Add Polyrhythm mode to the Signature control

A Standard/Polyrhythm toggle inside the existing Signature dialog
reveals two ratio steppers (2-16 each) and two sound pickers, reusing
the dialog's existing stepper/segmented/select conventions. Toggling
modes while the metronome is playing cleanly stops the old scheduler
and starts the new one so audio never overlaps.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final check

- [ ] Run the full test suite: `npm test` — all tests pass.
- [ ] Run `npm run lint` — clean.
- [ ] Run `npm run build` — clean production build.
- [ ] Re-read the Review Focus list above and confirm each item has a passing test or a documented manual-verification step (Task 6 covers items 1-3, Task 10 Step 7.6-7 covers item 4, Task 2 covers item 5).
