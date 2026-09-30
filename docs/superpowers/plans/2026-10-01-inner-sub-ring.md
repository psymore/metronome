# Inner Subdivision Ring (Circle View) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Plain branch `inner-sub-ring` from `master` (no worktrees). Never add `Co-Authored-By` or any attribution line. Don't push. No browser/Playwright checks: the user tests on their phone. Edit files only with the Edit/Write tools, never with PowerShell `Set-Content`/`Out-File` (they break UTF-8). Line endings must be LF: run `npm run format` before each commit.

**Goal:** In the circle view (standard mode, not polyrhythm), when subdivision dots are too small to fit between beat nodes (e.g. 16/4 with 16ths), stop hiding them. Draw them on a thin inner ring instead, each at its exact time position, with a short tick pointing toward the center, like the minute marks on a clock face.

**Architecture:** All layout lives in `src/viz/subDots.ts` (`circularSubDotLayout`), and drawing lives in `src/viz/subDotsDraw.ts`. The linear view, polyrhythm and the fan are unchanged. The fan still opens outward from the ring gap, exactly as today.

## Global Constraints
- The layout for circle views where dots already fit in the gaps must stay **pixel-identical** (e.g. 4/4 with 16ths on a phone).
- No new dependencies.

## Review Focus
- 16/4 with 16ths on a 320px stage: 48 dots are visible on the inner ring, and none of them overlaps a beat node.
- Tapping an inner dot opens that beat's fan. Tapping a node still cycles the node.
- Off dots on the inner ring are hollow, on dots are solid, and the heard one flashes, exactly like the in-gap dots.

---

### Task 1: Inner-ring layout plus hit testing

**Files:** Modify `src/viz/subDots.ts`, `tests/viz/subDots.test.ts`

- [ ] **Step 1: failing tests.** Append to `tests/viz/subDots.test.ts` and add `circularLayout` to the imports from `'../../src/viz/geometry'`:

```ts
describe('inner subdivision ring', () => {
  it('moves dots to an inner ring when they do not fit between nodes', () => {
    const layout = subDotLayout('circular', 320, 320, 16, 4);
    expect(layout.inner).toBe(true);
    expect(layout.dots).toHaveLength(16 * 3);
    const { cx, cy, r } = circularLayout(320, 320);
    const radii = layout.dots.map((d) => Math.hypot(d.x - cx, d.y - cy));
    for (const rad of radii) {
      expect(rad).toBeLessThan(r - 15);
      expect(rad).toBeCloseTo(radii[0] as number, 5);
    }
    for (const d of layout.dots) expect(d.tick).toBeDefined();
  });

  it('keeps dots in the gaps when they fit', () => {
    const layout = subDotLayout('circular', 320, 320, 4, 4);
    expect(layout.inner).toBe(false);
    for (const d of layout.dots) expect(d.tick).toBeUndefined();
  });

  it('a tap on an inner dot hits its beat group', () => {
    const layout = subDotLayout('circular', 320, 320, 16, 4);
    const dot = layout.dots.find((d) => d.beat === 5 && d.k === 2);
    expect(dot).toBeDefined();
    if (!dot) return;
    expect(subDotAt(layout, dot.x, dot.y)).toEqual({ kind: 'group', beat: 5 });
  });
});
```

Run `npm test -- subDots`. Expected: FAIL (`inner` / `tick` don't exist).

- [ ] **Step 2: types.** In `src/viz/subDots.ts`:
  - Add to `SubDot`:

```ts
  /** Inner-ring dots only: a short radial tick from just inside the dot toward the center. */
  tick?: { x1: number; y1: number; x2: number; y2: number };
```

  - Add to `SubDotLayout`:

```ts
  /** Circle view only: dots didn't fit between the nodes, so they sit on an inner ring. */
  inner: boolean;
```

  - In `linearSubDotLayout`'s return object, add `inner: false,`.

- [ ] **Step 3: circular layout.** In `circularSubDotLayout`, replace the `const dotR = subDotRadius(nodeR, spacing);` line and the dots loop.
  - Keep the `groups.push(...)` part exactly as it is.
  - Replace the final `return` too.
  - The new body from `const dotR` down to the end of the function:

```ts
  const inGapR = subDotRadius(nodeR, spacing);
  // Under 3px an in-gap dot is invisible in practice: switch to the inner ring instead.
  const inner = sub > 1 && inGapR < 3;
  const innerR = r - nodeR - 12;
  // Every click of the bar is evenly spaced around the inner ring, so this is its pitch.
  const innerPitch = (2 * Math.PI * innerR) / (count * sub);
  const innerDotR = Math.max(1.5, Math.min(3.5, innerPitch / 2 - 1));

  const dots: SubDot[] = [];
  const groups: SubGroup[] = [];
  if (sub > 1) {
    for (let i = 0; i < count; i++) {
      const start = nodeAngle(i, count) + gapAngle;
      if (inner) {
        for (let k = 1; k < sub; k++) {
          // Exact time position: beat i's angle plus k/sub of one beat's arc.
          const a = nodeAngle(i, count) + ((2 * Math.PI) / count) * (k / sub);
          const p = polar(cx, cy, innerR, a);
          // Clock-face hierarchy: the click halfway through the beat gets the longer tick.
          const len = k * 2 === sub ? 9 : 5;
          const t1 = polar(cx, cy, innerR - innerDotR - 2, a);
          const t2 = polar(cx, cy, innerR - innerDotR - 2 - len, a);
          dots.push({
            beat: i,
            k,
            x: p.x,
            y: p.y,
            r: innerDotR,
            tick: { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y },
          });
        }
      } else if (inGapR > 0) {
        for (let k = 1; k < sub; k++) {
          const p = polar(cx, cy, r, start + (arcSpan * k) / sub);
          dots.push({ beat: i, k, x: p.x, y: p.y, r: inGapR });
        }
      }
      // ...the existing `const a = start + arcSpan / 2;` + `groups.push({...})` block, unchanged...
    }
  }
  return { dots, groups, spacing, direct: !inner && spacing >= SUB_TAP_MIN_SPACING, inner };
```

  - Keep the existing comment above the loop that explains why every beat gets a group.
  - Don't rename the existing `a` inside the groups block. The new `a` is scoped inside the `for k` loop, so the two don't clash.

- [ ] **Step 4: hit test.** In `subDotAt`'s non-direct branch (the `const maxR = 22;` part), add this **before** the group loop:

```ts
  // Inner-ring dots are visible but too small to toggle directly: a tap on one opens its fan.
  if (layout.inner) {
    let near: { dot: SubDot; d: number } | null = null;
    for (const dot of layout.dots) {
      const d = Math.hypot(x - dot.x, y - dot.y);
      if (d <= 14 && (!near || d < near.d)) near = { dot, d };
    }
    if (near) return { kind: 'group', beat: near.dot.beat };
  }
```

- [ ] **Step 5:** Run `npm test -- subDots`. Expected: PASS. Then run `npm test`: all pass.
- [ ] **Step 6:** Commit `Circle view: move subdivision dots that don't fit between nodes to an inner ring`

### Task 2: Draw the ticks

**Files:** Modify `src/viz/subDotsDraw.ts` (`drawSubdivisionDots`)

- [ ] Inside the `for (const dot of layout.dots)` loop, after the `if (dot.beat === fanBeat) continue;` line and before `drawSubDot(...)`, add:

```ts
    if (dot.tick) {
      ctx.save();
      ctx.strokeStyle = theme.ring;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dot.tick.x1, dot.tick.y1);
      ctx.lineTo(dot.tick.x2, dot.tick.y2);
      ctx.stroke();
      ctx.restore();
    }
```

- [ ] Update the doc comment above `drawSubdivisionDots` to mention the inner ring and its ticks.
- [ ] `npm test`, `npm run lint`, `npm run build`: all pass. Only the pre-existing `index.html` warnings are allowed.
- [ ] Commit `Draw clock-face ticks under inner-ring subdivision dots`

### Task 3: FOLLOWUP

- [ ] Replace `docs/superpowers/FOLLOWUP.md` entirely with a short handoff. Include this phone checklist:
  - 16/4 with 16ths: dots are on the inner ring with short ticks, and the halfway tick is longer.
  - Tapping an inner dot opens the fan, and the fan toggles work.
  - 4/4 with 16ths looks exactly as before.
  - The glow of the heard dot is visible.
  - Off dots are hollow.
- [ ] Commit `Update FOLLOWUP.md`
