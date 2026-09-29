# Beat Sphere Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a beat-sphere visual style (Classic / Flat / Outline) from Settings, rendered consistently across the circular, linear, and polyrhythm visualizers.

**Architecture:** A new `src/viz/nodeStyleKit.ts` centralizes the three styles' paint logic behind one small `NodeStyleKit` interface (`paintMute`/`paintNormal`/`paintAccent`). `drawNode.ts` becomes a thin dispatcher onto the selected kit; `polyrhythm.ts`'s own per-half/accent painters call the same kit instead of their own hardcoded canvas code. A new `nodeStyle` setting flows through the same plumbing `theme` already uses end-to-end (state → `VizController` → visualizers → `drawNode`/kit), and joins the sprite-cache key so switching styles invalidates cached idle nodes.

**Tech Stack:** TypeScript, Canvas 2D — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-beat-sphere-styles-design.md`

## Global Constraints

- No new runtime dependencies.
- No unit tests for this feature unless explicitly requested later — verify manually in the dev server instead (per the spec's Testing section).
- One `nodeStyle` setting governs circular, linear, and polyrhythm rendering — no per-mode override.
- The beat number label is always white (`#fff`) in every style and every level, including mute — fixing three existing spots that instead color the mute label with the layer/theme color.
- Classic style's `mute`/`normal` painting must be pixel-identical to today's `drawNode.ts` — only `accent` gains one small addition (a uniform brighter wash), because polyrhythm has only one color per layer and needs *some* structural (not just color) difference between normal and accent. This is a known, intentional, minor visual change to Classic's accent look on standard-mode nodes too — flag it for the user to eyeball during manual verification (see Review Focus).

## Review Focus

- Switching `nodeStyle` while the metronome is running must invalidate cached sprites immediately, not show a stale style until the next theme change or resize.
- Old saved settings with no `nodeStyle` key (pre-existing localStorage from before this feature) must load without error and default to `'classic'`.
- The polyrhythm collapsed (still-merged) conjunction node must reflect the chosen style per half, exactly like already-split nodes do — this is the piece most likely to be missed since it's a separate code path (`drawCombinedHalf`) from the main per-layer loop (`drawLayer`).
- The beat label must render pure white for every style × level combination, including a muted beat — today three call sites (`circular.ts`, `linear.ts`, `polyrhythm.ts`) instead color a muted label with the layer/theme color.
- Reduced-motion mode forces `glow` to `0` for every node — each style's three levels (mute/normal/accent) must still look visibly distinct from each other at `glow === 0` (Flat and Outline are designed to already satisfy this; worth an explicit check since Classic historically leaned on glow for some of its distinction).

---

## File Structure

- Modify `src/state/settings.ts` — add `NodeStyleName`/`NODE_STYLES`, `Settings.nodeStyle`, `DEFAULT_SETTINGS.nodeStyle`, `isNodeStyleName`, and the `sanitizeSettings` line for it.
- Create `src/viz/nodeStyleKit.ts` — the `NodeStyleKit` interface, three concrete kits (classic/flat/outline), and `getNodeStyleKit`.
- Modify `src/viz/drawNode.ts` — dispatch through the selected kit instead of hardcoded canvas code; gains a `style` parameter.
- Modify `src/viz/types.ts` — `Visualizer.draw` gains a `style: NodeStyleName` parameter.
- Modify `src/viz/circular.ts`, `src/viz/linear.ts` — thread `style` through to `drawNode`; always paint the beat label white.
- Modify `src/viz/nodeSprite.ts` — `spriteKey`, `SpriteRenderer`, and `NodeSpriteCache.setContext` gain a `style` component.
- Modify `src/viz/vizController.ts` — read `s.nodeStyle`, pass it into `sprites.setContext`, `paintSprite`, `visualizer.draw`, and `drawPolyrhythm`; `paintSprite` always paints the label white.
- Modify `src/viz/polyrhythm.ts` — `drawPolyrhythm` gains a `style` parameter; `drawLayer`, `drawAccentNode` (removed, replaced by kit calls), `drawCombinedHalf` all dispatch through the kit; labels always white.
- Modify `index.html` — new "Beat sphere" field, chip row mirroring the existing Theme field.
- Modify `src/ui/settingsDialog.ts` — wire the new chips exactly like the existing `themeButtons` block.
- Modify `src/i18n/translations.ts` — add `nodeStyle.label`/`nodeStyle.classic`/`nodeStyle.flat`/`nodeStyle.outline` for `en` and `tr`.

---

### Task 1: Settings data model

**Files:**
- Modify: `src/state/settings.ts`

**Interfaces:**
- Produces: `NODE_STYLES: readonly ['classic', 'flat', 'outline']`, `type NodeStyleName`, `Settings.nodeStyle: NodeStyleName`, `isNodeStyleName(v: unknown): v is NodeStyleName`.

- [ ] **Step 1: Add the type and constant**

Right after the existing `THEMES`/`ThemeName` declaration (`src/state/settings.ts:9-10`):

```ts
export const THEMES = ['teal', 'amber', 'blue', 'chrome'] as const;
export type ThemeName = (typeof THEMES)[number];
export const NODE_STYLES = ['classic', 'flat', 'outline'] as const;
export type NodeStyleName = (typeof NODE_STYLES)[number];
```

- [ ] **Step 2: Add the field to `Settings`**

Find `theme: ThemeName;` inside the `Settings` interface and add directly below it:

```ts
  theme: ThemeName;
  nodeStyle: NodeStyleName;
```

- [ ] **Step 3: Add the default**

In `DEFAULT_SETTINGS`, find `theme: 'teal',` and add directly below it:

```ts
  theme: 'teal',
  nodeStyle: 'classic',
```

- [ ] **Step 4: Add the type guard**

Directly below the existing `isThemeName`:

```ts
export function isThemeName(v: unknown): v is ThemeName {
  return (THEMES as readonly unknown[]).includes(v);
}

export function isNodeStyleName(v: unknown): v is NodeStyleName {
  return (NODE_STYLES as readonly unknown[]).includes(v);
}
```

- [ ] **Step 5: Sanitize it**

In `sanitizeSettings`, find `theme: isThemeName(r.theme) ? r.theme : d.theme,` and add directly below it:

```ts
    theme: isThemeName(r.theme) ? r.theme : d.theme,
    nodeStyle: isNodeStyleName(r.nodeStyle) ? r.nodeStyle : d.nodeStyle,
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — expect no errors (the existing `settings.test.ts` compares against `DEFAULT_SETTINGS` itself, so it stays green with no test changes needed).
Run: `npm test -- --run` — expect all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/settings.ts
git commit -m "Add nodeStyle setting for beat sphere styles"
```

---

### Task 2: The node style kit

**Files:**
- Create: `src/viz/nodeStyleKit.ts`

**Interfaces:**
- Consumes: `NodeStyleName` from `src/state/settings.ts` (Task 1).
- Produces: `NodeStyleKit` interface and `getNodeStyleKit(style: NodeStyleName): NodeStyleKit`, each with `paintMute(ctx, x, y, radius, idleColor, flashColor, glowColor, glow, startAngle?, endAngle?)`, `paintNormal(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle?, endAngle?)`, `paintAccent(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle?, endAngle?)`. `startAngle`/`endAngle` default to a full circle (`0`/`2π`) — passing a half range paints just that arc, which is how `polyrhythm.ts` (Task 7) reuses these for a conjunction node's two halves.

- [ ] **Step 1: Write the file**

```ts
import type { NodeStyleName } from '../state/settings';

const FULL_START = 0;
const FULL_END = Math.PI * 2;

export interface NodeStyleKit {
  /** Ring-only, no fill — a muted beat. */
  paintMute(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    idleColor: string,
    flashColor: string,
    glowColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
  /** The node's normal, at-rest look. */
  paintNormal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    glowColor: string,
    coreColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
  /** The emphasized/accent look. Must read as distinct from `paintNormal` even at `glow === 0`
   *  and even when given the exact same `color` as the `paintNormal` call for this node —
   *  polyrhythm has only one color per layer, not a separate accent color, so the distinction has
   *  to come from the painting itself, never just from the caller picking a different color. */
  paintAccent(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    glowColor: string,
    coreColor: string,
    glow: number,
    startAngle?: number,
    endAngle?: number,
  ): void;
}

function classicFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  glowColor: string,
  coreColor: string,
  glow: number,
  startAngle: number,
  endAngle: number,
  extraWash: boolean,
): void {
  const r = radius * (1 + 0.3 * glow);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6 + 34 * glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, startAngle, endAngle);
  ctx.fill();

  ctx.shadowBlur = 0;
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  shine.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * glow})`);
  shine.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, startAngle, endAngle);
  ctx.fill();

  if (extraWash) {
    // The one structural marker that keeps accent visually distinct from normal even when a
    // caller (polyrhythm) passes the identical `color` for both — a uniform brighter wash, never
    // a second hue, so a node never looks like it "belongs to two layers".
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x, y, r, startAngle, endAngle);
    ctx.fill();
  }

  if (glow > 0) {
    ctx.globalAlpha = glow * 0.8;
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, startAngle, endAngle);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

const classicKit: NodeStyleKit = {
  paintMute(ctx, x, y, radius, idleColor, flashColor, glowColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 8 * glow;
    ctx.lineWidth = 2;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    if (glow > 0) {
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  paintNormal(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    classicFill(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle, endAngle, false);
  },
  paintAccent(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    classicFill(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle, endAngle, true);
  },
};

const flatKit: NodeStyleKit = {
  paintMute(ctx, x, y, radius, idleColor, flashColor, glowColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    if (glow > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  },
  paintNormal(ctx, x, y, radius, color, glowColor, _coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 10 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
  },
  paintAccent(ctx, x, y, radius, color, glowColor, _coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 4 + 10 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
    // The distinguishing mark: a crisp bright ring border instead of a bigger glow bloom.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius - 1), startAngle, endAngle);
    ctx.stroke();
  },
};

const outlineKit: NodeStyleKit = {
  paintMute(ctx, x, y, radius, idleColor, flashColor, glowColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = idleColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (glow > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6 * glow;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = flashColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  },
  paintNormal(ctx, x, y, radius, color, glowColor, _coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6 * glow;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  paintAccent(ctx, x, y, radius, color, glowColor, coreColor, glow, startAngle = FULL_START, endAngle = FULL_END) {
    // The distinguishing mark: the ring fills solid instead of staying hollow.
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6 + 20 * glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (glow > 0) {
      ctx.globalAlpha = glow * 0.8;
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, startAngle, endAngle);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
};

const KITS: Record<NodeStyleName, NodeStyleKit> = {
  classic: classicKit,
  flat: flatKit,
  outline: outlineKit,
};

export function getNodeStyleKit(style: NodeStyleName): NodeStyleKit {
  return KITS[style];
}
```

Each `paint*` function assumes the caller has already called `ctx.save()` and will call `ctx.restore()` afterward — it resets any `globalAlpha`/`shadowBlur` it changes before returning, but doesn't save/restore itself, matching how `drawNode.ts` (Task 3) already wraps its call.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add src/viz/nodeStyleKit.ts
git commit -m "Add node style kit with classic/flat/outline beat sphere painters"
```

---

### Task 3: `drawNode.ts` becomes a dispatcher

**Files:**
- Modify: `src/viz/drawNode.ts`

**Interfaces:**
- Consumes: `getNodeStyleKit` from Task 2.
- Produces: `drawNode(ctx, x, y, radius, level, glow, theme, style: NodeStyleName)` — same as today plus the new trailing `style` parameter.

- [ ] **Step 1: Replace the file's contents**

```ts
import type { BeatLevel, NodeStyleName } from '../state/settings';
import { getNodeStyleKit } from './nodeStyleKit';
import type { VizTheme } from './types';

/** A beat sphere, painted in the given `style`. `glow` 0..1 swells/brightens it, style-dependent. */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  level: BeatLevel,
  glow: number,
  theme: VizTheme,
  style: NodeStyleName,
): void {
  const kit = getNodeStyleKit(style);
  ctx.save();
  if (level === 'mute') {
    kit.paintMute(ctx, x, y, radius, theme.nodeIdle, theme.node, theme.glow, glow);
  } else if (level === 'accent') {
    kit.paintAccent(ctx, x, y, radius, theme.accent, theme.glow, theme.core, glow);
  } else {
    kit.paintNormal(ctx, x, y, radius, theme.node, theme.glow, theme.core, glow);
  }
  ctx.restore();
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — this will show errors at every existing call site of `drawNode` (missing the new `style` argument) — that's expected; Tasks 4, 6, and 7 fix each call site. Confirm the errors are only "expected an argument" type errors at `drawNode(...)` call sites in `circular.ts`, `linear.ts`, `polyrhythm.ts`, and `vizController.ts`, nothing else.

- [ ] **Step 3: Commit**

```bash
git add src/viz/drawNode.ts
git commit -m "Make drawNode dispatch through the selected node style kit"
```

---

### Task 4: Thread `style` through the standard visualizers, fix label color

**Files:**
- Modify: `src/viz/types.ts`
- Modify: `src/viz/circular.ts`
- Modify: `src/viz/linear.ts`

**Interfaces:**
- Consumes: `NodeStyleName` from Task 1, `drawNode(..., style)` from Task 3.
- Produces: `Visualizer.draw(ctx, size, frame, theme, sprites, style: NodeStyleName)`.

- [ ] **Step 1: Update the `Visualizer` interface**

In `src/viz/types.ts`:

```ts
import type { VizFrame } from './frame';
import type { NodeSprites } from './nodeSprite';
import type { NodeStyleName } from '../state/settings';

export interface VizTheme {
  ring: string;
  spoke: string;
  node: string;
  accent: string;
  /** Contrasting accent used for polyrhythm layer A so the two layers read as distinct colors. */
  accentAlt: string;
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
    sprites: NodeSprites,
    style: NodeStyleName,
  ): void;
}
```

- [ ] **Step 2: Update `circular.ts`**

Change the `draw` signature and the node-drawing loop's `drawNode` call and label fill. In `src/viz/circular.ts`:

```ts
export const circularVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme, sprites, style) {
```

(only the function signature line changes — everything else above the node loop is unchanged). Then in the node loop near the bottom:

```ts
      drawNode(ctx, p.x, p.y, nodeR, level, glow, theme, style);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, p.x, p.y);
      ctx.restore();
```

(replacing the old `drawNode(ctx, p.x, p.y, nodeR, level, glow, theme);` and `ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';` lines).

- [ ] **Step 3: Update `linear.ts`**

Same two changes in `src/viz/linear.ts`:

```ts
export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme, sprites, style) {
```

And in its node loop:

```ts
      drawNode(ctx, x, y, nodeR, level, glow, theme, style);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, y);
      ctx.restore();
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expect errors only at `visualizer.draw(...)` call sites in `vizController.ts` (missing the new argument) and `drawNode(...)`/`drawPolyrhythm(...)` call sites still in `polyrhythm.ts`/`vizController.ts` — fixed in Tasks 6-7.

- [ ] **Step 5: Commit**

```bash
git add src/viz/types.ts src/viz/circular.ts src/viz/linear.ts
git commit -m "Thread node style through circular/linear visualizers, always paint labels white"
```

---

### Task 5: Style-aware sprite cache

**Files:**
- Modify: `src/viz/nodeSprite.ts`

**Interfaces:**
- Produces: `spriteKey(themeName, style, level, label, radius, dpr)`, `SpriteRenderer = (level, label, radius, dpr) => ...` (unchanged shape — the renderer closure captures the current style itself, see Task 6), `NodeSpriteCache.setContext(themeName: string, dpr: number, style: NodeStyleName): void`.

- [ ] **Step 1: Update `spriteKey` and `setContext`**

In `src/viz/nodeSprite.ts`, add the import and update the key/cache logic:

```ts
import type { BeatLevel, NodeStyleName } from '../state/settings';

/** Extra room around the sphere so its idle shadow is not clipped by the sprite edge. */
export const SPRITE_PAD = 8;

/** Side length, in CSS pixels, of the square sprite holding a node of this radius. */
export function spriteSize(radius: number): number {
  return Math.ceil((radius + SPRITE_PAD) * 2);
}

export function spriteKey(
  themeName: string,
  style: NodeStyleName,
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
): string {
  return `${themeName}|${style}|${level}|${label}|${radius.toFixed(2)}|${dpr.toFixed(2)}`;
}

export interface NodeSprites {
  /** A pre-painted idle (glow-free) node, or null when it must be drawn live instead. */
  get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null;
}

export type SpriteRenderer = (
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
) => CanvasImageSource | null;

/**
 * Memoises idle beat nodes. Painting one costs a `shadowBlur` pass; blitting the result costs a
 * `drawImage`. Only the node that is currently glowing still needs to be painted every frame.
 */
export class NodeSpriteCache implements NodeSprites {
  private readonly sprites = new Map<string, CanvasImageSource | null>();
  private themeName = '';
  private dpr = 1;
  private style: NodeStyleName = 'classic';

  constructor(private readonly render: SpriteRenderer) {}

  /** Every cached sprite is baked in one theme/style at one pixel ratio; a change invalidates
   *  all of them. */
  setContext(themeName: string, dpr: number, style: NodeStyleName): void {
    if (themeName === this.themeName && dpr === this.dpr && style === this.style) return;
    this.themeName = themeName;
    this.dpr = dpr;
    this.style = style;
    this.sprites.clear();
  }

  get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null {
    const key = spriteKey(this.themeName, this.style, level, label, radius, this.dpr);
    const cached = this.sprites.get(key);
    if (cached !== undefined) return cached;
    const sprite = this.render(level, label, radius, this.dpr);
    this.sprites.set(key, sprite);
    return sprite;
  }

  get size(): number {
    return this.sprites.size;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — expect an error at `vizController.ts`'s `this.sprites.setContext(s.theme, this.dpr);` call (missing the new `style` argument) — fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/viz/nodeSprite.ts
git commit -m "Fold node style into the sprite cache key"
```

---

### Task 6: Thread `nodeStyle` through `VizController`, fix its label color

**Files:**
- Modify: `src/viz/vizController.ts`

**Interfaces:**
- Consumes: `Settings.nodeStyle` (Task 1), `drawNode(..., style)` (Task 3), `Visualizer.draw(..., style)` (Task 4), `NodeSpriteCache.setContext(themeName, dpr, style)` (Task 5), `drawPolyrhythm(..., style)` (Task 7 — written in this task, consumed there).

- [ ] **Step 1: Fix `paintSprite`'s label color and thread `style` into its `drawNode` call**

In `src/viz/vizController.ts`, `paintSprite` currently reads:

```ts
  private paintSprite(
    level: BeatLevel,
    label: string,
    radius: number,
    dpr: number,
  ): CanvasImageSource | null {
    const size = spriteSize(radius);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = canvas.width;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = size / 2;
    drawNode(c, mid, mid, radius, level, 0, this.theme);
    c.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowBlur = 3;
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.fillStyle = level === 'mute' ? this.theme.accent : '#fff';
    c.fillText(label, mid, mid);
    return canvas;
  }
```

Replace the `drawNode` call and the `fillStyle` line:

```ts
    drawNode(c, mid, mid, radius, level, 0, this.theme, this.getSettings().nodeStyle);
    c.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowBlur = 3;
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.fillStyle = '#fff';
    c.fillText(label, mid, mid);
```

- [ ] **Step 2: Thread `style` into `render()`**

In `render()`, find:

```ts
    this.sprites.setContext(s.theme, this.dpr);
```

Replace with:

```ts
    this.sprites.setContext(s.theme, this.dpr, s.nodeStyle);
```

Then find the polyrhythm branch's draw call:

```ts
      drawPolyrhythm(this.ctx, this.size, frame, this.theme, this.sprites);
```

Replace with:

```ts
      drawPolyrhythm(this.ctx, this.size, frame, this.theme, this.sprites, s.nodeStyle);
```

Then find the standard-mode draw call:

```ts
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme, this.sprites);
```

Replace with:

```ts
    const visualizer = s.visualizer === 'linear' ? linearVisualizer : circularVisualizer;
    visualizer.draw(this.ctx, this.size, frame, this.theme, this.sprites, s.nodeStyle);
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — expect an error only at `drawPolyrhythm`'s own definition in `polyrhythm.ts` not yet accepting a `style` parameter — fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/viz/vizController.ts
git commit -m "Thread nodeStyle through VizController, always paint sprite labels white"
```

---

### Task 7: Polyrhythm renders through the same style kit

**Files:**
- Modify: `src/viz/polyrhythm.ts`

**Interfaces:**
- Consumes: `NodeStyleName` (Task 1), `getNodeStyleKit` (Task 2), `drawNode(..., style)` (Task 3).
- Produces: `drawPolyrhythm(ctx, size, frame, theme, sprites, style: NodeStyleName)`.

- [ ] **Step 1: Add the `style` parameter and thread it to `drawLayer`/`drawCombinedNode`**

In `src/viz/polyrhythm.ts`, update the imports and `drawPolyrhythm` signature:

```ts
import type { BeatLevel, NodeStyleName } from '../state/settings';
import { drawNode } from './drawNode';
import { getNodeStyleKit } from './nodeStyleKit';
import type { NodeSprites } from './nodeSprite';
import type { PolyFrame } from './polyFrame';
import { polyNodeRadius, polyPositions, polyStageLayout } from './polyGeometry';
import type { VizTheme } from './types';

/** Warm red-coral used to hint "tap to close" on a branched pair's hub node — deliberately
 *  in-between red and white rather than a full alarm red, so it reads as a cue, not an error. */
const CLOSE_HINT_COLOR = '#e0685c';

export function drawPolyrhythm(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  frame: PolyFrame,
  theme: VizTheme,
  _sprites: NodeSprites,
  style: NodeStyleName,
): void {
```

Then update the two `drawLayer` calls to pass `style` as an extra trailing argument, and the `drawCombinedNode` call the same way:

```ts
  drawLayer(
    ctx,
    vertsA,
    nodePosA,
    NODE_RADIUS,
    theme.accentAlt,
    frame.activeIndexA,
    glowA,
    frame.levelsA,
    theme,
    combinedA,
    style,
  );
  drawLayer(
    ctx,
    vertsB,
    nodePosB,
    NODE_RADIUS,
    theme.accent,
    frame.activeIndexB,
    glowB,
    frame.levelsB,
    theme,
    combinedB,
    style,
  );
```

```ts
      drawCombinedNode(
        ctx,
        p.x,
        p.y,
        NODE_RADIUS,
        theme.accentAlt,
        theme.accent,
        levelA,
        levelB,
        activeA && levelA !== 'mute' ? glowA : 0,
        activeB && levelB !== 'mute' ? glowB : 0,
        String(p.aIndex + 1),
        style,
      );
```

- [ ] **Step 2: Rewrite `drawLayer` to dispatch through the kit and drop `drawAccentNode`**

Replace the whole `drawLayer` function and delete `drawAccentNode` entirely (its job is now `getNodeStyleKit(style).paintAccent`):

```ts
function drawLayer(
  ctx: CanvasRenderingContext2D,
  outlineVerts: { x: number; y: number }[],
  nodeVerts: { x: number; y: number }[],
  nodeRadius: number,
  layerColor: string,
  activeIndex: number,
  glow: number,
  levels: readonly BeatLevel[],
  theme: VizTheme,
  skip: Set<number>,
  style: NodeStyleName,
): void {
  if (outlineVerts.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = layerColor;
  ctx.beginPath();
  for (const [i, v] of outlineVerts.entries()) {
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Override both `node` (normal-level fill) and `accent` (accent-level fill) so every node in
  // this layer reads as its layer's color — not just the accent-level ones — matching the
  // connecting lines, which are already drawn in layerColor regardless of beat level.
  const layerTheme: VizTheme = { ...theme, node: layerColor, accent: layerColor, glow: layerColor };
  for (const [i, v] of nodeVerts.entries()) {
    if (skip.has(i)) continue;
    const configured: BeatLevel = levels[i] ?? 'normal';
    const isActive = i === activeIndex;
    const g = isActive && configured !== 'mute' ? glow : 0;
    drawNode(ctx, v.x, v.y, nodeRadius, configured, g, layerTheme, style);
    paintLabel(ctx, v.x, v.y, nodeRadius, String(i + 1));
  }
}
```

(Note: `drawNode` now handles all three levels for polyrhythm too, since the style kit's `paintAccent` supplies the "distinct from normal" behavior that the old bespoke `drawAccentNode` used to provide — the special-case branch is gone.)

- [ ] **Step 3: Simplify `paintLabel` to always paint white**

Replace:

```ts
function paintLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
  level: BeatLevel,
  layerColor: string,
): void {
  ctx.save();
  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = level === 'mute' ? layerColor : '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}
```

With:

```ts
function paintLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
): void {
  ctx.save();
  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}
```

- [ ] **Step 4: Rewrite `drawCombinedNode` and `drawCombinedHalf` to dispatch through the kit**

Replace both functions (the trailing label-painting code in `drawCombinedNode` also drops its own `fillStyle` ternary, matching Step 3):

```ts
/** A single sphere split down the middle — left half layer A, right half layer B — so at rest
 *  the two coincident layers read as one node with a visible hint that it is composed of two
 *  things. Each half is styled by that layer's own beat level, through the same style kit a
 *  standalone node uses, so a collapsed conjunction never hides what its layers are actually
 *  doing. Tapping it branches the two out along their diagonals. */
function drawCombinedNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorA: string,
  colorB: string,
  levelA: BeatLevel,
  levelB: BeatLevel,
  glowA: number,
  glowB: number,
  label: string,
  style: NodeStyleName,
): void {
  ctx.save();
  const r = radius * (1 + 0.25 * Math.max(glowA, glowB));

  drawCombinedHalf(ctx, x, y, r, Math.PI / 2, (3 * Math.PI) / 2, colorA, levelA, glowA, style);
  drawCombinedHalf(ctx, x, y, r, -Math.PI / 2, Math.PI / 2, colorB, levelB, glowB, style);

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  ctx.font = `600 ${Math.round(Math.max(10, radius * 1.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}

/** One half of a still-merged conjunction sphere, styled exactly like that layer's standalone
 *  node would be (via the same style kit `drawNode` uses) — an outline arc when muted, a solid
 *  fill when normal, the style's accent look when accented — so a collapsed conjunction stays
 *  truthful about what each layer is actually doing, not a fixed two-tone regardless of level. */
function drawCombinedHalf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  startAngle: number,
  endAngle: number,
  color: string,
  level: BeatLevel,
  glow: number,
  style: NodeStyleName,
): void {
  const kit = getNodeStyleKit(style);
  ctx.save();
  if (level === 'mute') {
    kit.paintMute(ctx, x, y, r, color, color, color, glow, startAngle, endAngle);
  } else if (level === 'accent') {
    kit.paintAccent(ctx, x, y, r, color, color, color, glow, startAngle, endAngle);
  } else {
    kit.paintNormal(ctx, x, y, r, color, color, color, glow, startAngle, endAngle);
  }
  ctx.restore();
}
```

Note `drawCombinedHalf` passes `color` for all three of `idleColor`/`flashColor`/`glowColor` (and `color`/`glowColor`/`coreColor` for the fill variants) — a conjunction half has only the one layer color to work with, same as the rest of polyrhythm's rendering; the removed shared "shine across both halves" pass from the old `drawCombinedNode` is no longer needed since each half's own kit call now paints its own shine/wash within its own arc.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit` — expect zero errors across the whole project now that every `drawNode`/`Visualizer.draw`/`drawPolyrhythm`/`NodeSpriteCache.setContext` call site has been updated (Tasks 3-7).
Run: `npx biome check src/viz/` — fix any formatting/lint issues it reports.
Run: `npm test -- --run` — expect all existing tests to still pass.

- [ ] **Step 6: Commit**

```bash
git add src/viz/polyrhythm.ts
git commit -m "Route polyrhythm node painting through the shared node style kit"
```

---

### Task 8: Settings UI

**Files:**
- Modify: `index.html`
- Modify: `src/ui/settingsDialog.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `isNodeStyleName` (Task 1).

- [ ] **Step 1: Add the field markup**

In `index.html`, find the existing Theme field:

```html
      <div class="field">
        <span data-i18n="theme.label">Theme</span>
        <div class="unit-row" role="radiogroup" aria-label="Color theme">
          <button type="button" role="radio" class="chip" data-theme-option="teal" aria-checked="false" data-i18n="theme.teal">Teal</button>
          <button type="button" role="radio" class="chip" data-theme-option="amber" aria-checked="false" data-i18n="theme.amber">Amber</button>
          <button type="button" role="radio" class="chip" data-theme-option="blue" aria-checked="false" data-i18n="theme.blue">Blue</button>
          <button type="button" role="radio" class="chip" data-theme-option="chrome" aria-checked="false" data-i18n="theme.chrome">Chrome</button>
        </div>
      </div>
```

Add a new field directly after its closing `</div>`:

```html
      <div class="field">
        <span data-i18n="nodeStyle.label">Beat sphere</span>
        <div class="unit-row" role="radiogroup" aria-label="Beat sphere style">
          <button type="button" role="radio" class="chip" data-node-style-option="classic" aria-checked="false" data-i18n="nodeStyle.classic">Classic</button>
          <button type="button" role="radio" class="chip" data-node-style-option="flat" aria-checked="false" data-i18n="nodeStyle.flat">Flat</button>
          <button type="button" role="radio" class="chip" data-node-style-option="outline" aria-checked="false" data-i18n="nodeStyle.outline">Outline</button>
        </div>
      </div>
```

- [ ] **Step 2: Wire it up in `settingsDialog.ts`**

In `src/ui/settingsDialog.ts`, update the import:

```ts
import {
  clampPracticeSeconds,
  defaultSettings,
  isNodeStyleName,
  isThemeName,
  type Settings,
} from '../state/settings';
```

Add the query, right after `themeButtons`:

```ts
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );
  const nodeStyleButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-node-style-option]'),
  );
```

Add the click handler, right after the theme buttons' handler:

```ts
  for (const button of themeButtons) {
    button.addEventListener('click', () => {
      const theme = button.dataset.themeOption;
      if (isThemeName(theme)) store.set({ theme });
    });
  }
  for (const button of nodeStyleButtons) {
    button.addEventListener('click', () => {
      const nodeStyle = button.dataset.nodeStyleOption;
      if (isNodeStyleName(nodeStyle)) store.set({ nodeStyle });
    });
  }
```

Add the `aria-checked` sync, right after the theme buttons' sync line inside `render`:

```ts
    for (const button of themeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === s.theme));
    }
    for (const button of nodeStyleButtons) {
      button.setAttribute('aria-checked', String(button.dataset.nodeStyleOption === s.nodeStyle));
    }
```

- [ ] **Step 3: Add translations**

In `src/i18n/translations.ts`, in the `en` block, find `'theme.chrome': 'Chrome',` and add directly after it:

```ts
    'theme.chrome': 'Chrome',
    'nodeStyle.label': 'Beat sphere',
    'nodeStyle.classic': 'Classic',
    'nodeStyle.flat': 'Flat',
    'nodeStyle.outline': 'Outline',
```

In the `tr` block, find `'theme.chrome': 'Krom',` and add directly after it:

```ts
    'theme.chrome': 'Krom',
    'nodeStyle.label': 'Küre stili',
    'nodeStyle.classic': 'Klasik',
    'nodeStyle.flat': 'Düz',
    'nodeStyle.outline': 'Çerçeveli',
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx biome check src/ui/settingsDialog.ts index.html src/i18n/translations.ts` — fix any formatting issues.
Run: `npm test -- --run` — expect all existing tests to still pass.

- [ ] **Step 5: Manual verification in the dev server**

Run: `npm run dev`, open the app, open Settings, and for each of the three "Beat sphere" chips:
- Confirm the chip's `aria-checked` state updates and persists across a page reload (it's stored in the same `localStorage` settings blob as `theme`).
- Confirm the circular visualizer's nodes change look immediately.
- Switch to the Line visualizer and confirm the same style shows there too.
- Enable Polyrhythm mode and confirm: (a) split individual nodes render in the chosen style for all three levels (mute/normal/accent), (b) a still-collapsed conjunction node's two halves also reflect the chosen style per their own level, (c) the beat number label is pure white in every case, including muted beats, in every style, in every mode.
- With the metronome running, confirm the active/glowing beat still animates correctly in all three styles (no stuck glow, no flicker).
- Toggle "Reduced motion" (OS-level or via `prefers-reduced-motion` in devtools) and confirm mute/normal/accent still look distinguishable from each other at `glow === 0` in all three styles.

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/settingsDialog.ts src/i18n/translations.ts
git commit -m "Add Beat sphere style selector to Settings"
```
