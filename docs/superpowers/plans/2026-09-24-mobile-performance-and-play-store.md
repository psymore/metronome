# Mobile Performance & Google Play Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the metronome's per-frame CPU cost so a phone stops heating during practice, then ship the app to the Google Play Store as a Capacitor-wrapped Android build.

**Architecture:** Phase A removes the two things that burn battery: the canvas visualiser re-runs an expensive `shadowBlur` pass for *every* beat node on *every* animation frame, and the render loop plus the `AudioContext` keep running when nothing is visible or playing. Idle nodes become pre-rendered sprites drawn with `drawImage`, so only the one glowing node pays for a live blur; the loop pauses on `visibilitychange`; the `AudioContext` suspends on stop; a screen wake lock keeps the phone awake while playing. Phase B wraps the existing `dist/` web build in a Capacitor 8 Android shell — assets are bundled inside the APK, so there is no hosting, domain, or Digital Asset Links dependency — and takes it through signing, an AAB, and Play Console closed testing.

**Tech Stack:** TypeScript, Vite 7, Vitest 5, Biome, Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`), Android Gradle Plugin 8.13.0, Gradle 8.14.3, JDK 17+, Android Studio Otter 2025.2.1+, Google Play Console.

**Spec:** This plan carries its own design rationale (see **Design Decisions** below) — there is no separate spec file for this work. Background reading: `docs/superpowers/specs/2026-09-23-metronome-design.md` (the audio/visualiser contract this work must not break) and `docs/superpowers/specs/2026-09-24-metronome-v2.md`.

---

## Design Decisions

These were settled before planning. Do not re-open them mid-execution; if one turns out to be wrong, stop and say so.

1. **Foreground-only playback.** The click is not required to keep sounding when the screen is off or the user switches apps. This is what makes the whole plan cheap: no Android foreground service, no `MediaSession`, no background-audio permission, no Play "background location/service" disclosure. A **screen wake lock** covers the real need — the phone must not sleep mid-practice.
2. **Capacitor, not a Trusted Web Activity.** A TWA needs `/.well-known/assetlinks.json` served from the **origin root**. The PWA lives on `*.github.io`, a shared origin whose root is not ours, and there is no custom domain. Capacitor bundles `dist/` inside the APK instead — no hosting, no domain, no asset-link verification, and the app is fully offline by construction.
3. **Capacitor, not Tauri 2 Android.** The repo already has Tauri 2 for Windows, but its Android target needs the full Rust + Android NDK toolchain and has no documented Play signing path. Capacitor needs only the JDK and Android SDK. Windows keeps shipping through Tauri, unchanged.
4. **Capacitor is an accepted exception to the "no new runtime dependencies" rule** in `CLAUDE.md`. Shipping to Play is the strong reason. `@capacitor/core` is the only new runtime dependency; **no Capacitor plugins** are added (the wake lock uses the standard `navigator.wakeLock` Web API, which Android's Chromium WebView supports).
5. **Sprite caching, not a blur budget.** Reducing `shadowBlur` radii would look worse and still cost a blur pass per node. Pre-rendering each idle node once and blitting it costs one `drawImage` per node per frame.

---

## Global Constraints

- Node 22+, npm. TypeScript `strict`, ES modules (`"type": "module"`). No UI framework.
- Runtime dependencies after this work: `idb-keyval` and `@capacitor/core` **only**. No Capacitor plugins. No other additions without asking the user.
- App identifier is `com.psymore.metronome` on **every** platform (already the Tauri identifier; reuse it verbatim for Capacitor `appId` and the Android `applicationId`).
- App name displayed everywhere: `Metronome`.
- Capacitor 8 Android floor values, exactly: `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`, AGP `8.13.0`, Gradle wrapper `8.14.3`, Android Studio Otter 2025.2.1+, JDK 17+.
- Google Play, as of 2026-08-31, **requires `targetSdk = 36`** for new apps and updates. Capacitor 8's default already satisfies this — never lower it.
- Colours: background `#141416`, pink accent `#ff2f7d`. Dark theme only.
- Scheduler constants are untouched by this plan: LOOKAHEAD = 0.1 s, worker TICK = 25 ms, START_DELAY = 0.05 s, glow decay = min(0.35 s, 0.9 × beat duration).
- **The timing rule still holds:** `setTimeout`/`setInterval`/`requestAnimationFrame` never decide *when* a click sounds. Only `AudioContext.currentTime` + `source.start(time)` does. Nothing in Phase A may touch `Scheduler`, `timerWorker.ts`, or beat-time accumulation.
- **Visuals stay a pure function of heard time.** Sprite caching changes *how* a node is painted, never *when* or *where*.
- Tests live in `tests/`, mirror `src/`, and run in the Vitest **node** environment. Never touch the DOM, canvas, or Web Audio in a test — inject a fake instead (see `tests/sounds/soundLibrary.test.ts` for the established pattern).
- Browser glue (`audioEngine.ts`, `viz/vizController.ts`, `ui/*`) is verified **manually**, per `CLAUDE.md`. Those tasks carry explicit manual verification steps instead of unit tests.
- Tauri's window must keep `dragDropEnabled: false`.
- Commit after every task. **Never push to a remote, and never upload anything to Play, without asking the user first.**
- Shell snippets are bash (Git Bash on Windows). In PowerShell, replace `&&` chains with `;` and `if ($?)`.

## Review Focus

Five conditions the design implies that no single task's happy path exercises. Each has a test pinned to the task that owns the code.

- **Theme switched while the metronome is running** — cached sprites were painted in the old theme's colours and must not survive the switch, or every idle node keeps the previous accent colour. *Test: Task 2, "drops cached sprites when the theme changes".*
- **Window dragged to a monitor with a different `devicePixelRatio`** — sprites baked at 1× must not be blitted onto a 2× canvas as a blurry square. *Test: Task 2, "drops cached sprites when the pixel ratio changes".*
- **Tab hidden mid-playback, then restored** — the render loop must stop *and* restart. A loop that pauses but never resumes leaves a frozen visualiser while the audio keeps clicking, which looks like a crash. *Test: Task 1, "resumes animating when the page becomes visible again".*
- **Beats-per-bar raised to 16 while running** — the sprite cache must not be consulted with a stale radius, and must not grow without bound as the user sweeps the signature. *Test: Task 2, "reuses one sprite per distinct level, label, and radius".*
- **`OffscreenCanvas`/`getContext('2d')` unavailable, or a sprite fails to paint** — the visualiser must fall back to live drawing, not render blank circles or throw inside the animation loop. *Test: Task 2, "falls back to live drawing when the renderer returns null".*

---

## File Structure

```
metronome/
  capacitor.config.ts               # NEW (Task 5) — appId, appName, webDir
  android/                          # NEW (Task 5) — generated native project, committed
    app/build.gradle                #   signing config (Task 7)
    keystore.properties             #   GITIGNORED, never committed (Task 7)
  docs/architecture/platforms.md    # NEW (Task 9) — PWA + Tauri + Android release runbook
  src/
    platform.ts                     # NEW (Task 5) — isNativeShell(), pure
    viz/
      renderPolicy.ts               # NEW (Task 1) — shouldAnimate(), pure
      nodeSprite.ts                 # NEW (Task 2) — spriteKey/spriteSize/NodeSpriteCache
      types.ts                      # MODIFY (Task 2) — Visualizer.draw gains a sprites param
      circular.ts                   # MODIFY (Task 2) — blit idle nodes
      linear.ts                     # MODIFY (Task 2) — blit idle nodes
      vizController.ts              # MODIFY (Tasks 1, 2) — visibility gate, owns the cache
    engine/audioEngine.ts           # MODIFY (Task 3) — suspend on stop
    ui/wakeLock.ts                  # NEW (Task 4) — screen wake lock
    main.ts                         # MODIFY (Tasks 4, 5) — wire wake lock, native SW guard
    styles.css                      # MODIFY (Task 6) — bottom safe-area inset
  tests/
    viz/renderPolicy.test.ts        # NEW (Task 1)
    viz/nodeSprite.test.ts          # NEW (Task 2)
    platform.test.ts                # NEW (Task 5)
```

`drawNode.ts`, `frame.ts`, `geometry.ts`, `scheduler.ts`, `beatTimeline.ts`, `timerWorker.ts` are **not modified by this plan.**

---

# Phase A — Performance

## Task 1: Pause the render loop when the page is hidden

`VizController.onFrame` re-arms `requestAnimationFrame` for as long as `source.running()` is true, with no visibility check. Browsers throttle rAF in hidden tabs, but the Tauri desktop window and the Android WebView do not reliably do so when occluded or minimised — the loop keeps blurring shadows at full rate against a surface nobody can see.

**Files:**
- Create: `src/viz/renderPolicy.ts`
- Create: `tests/viz/renderPolicy.test.ts`
- Modify: `src/viz/vizController.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `shouldAnimate(input: { running: boolean; hidden: boolean }): boolean` from `src/viz/renderPolicy.ts`. Task 2 does not use it; nothing else depends on it.

- [ ] **Step 1: Write the failing test**

Create `tests/viz/renderPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldAnimate } from '../../src/viz/renderPolicy';

describe('shouldAnimate', () => {
  it('animates while running and visible', () => {
    expect(shouldAnimate({ running: true, hidden: false })).toBe(true);
  });

  it('stops while running but hidden', () => {
    expect(shouldAnimate({ running: true, hidden: true })).toBe(false);
  });

  it('stops when not running', () => {
    expect(shouldAnimate({ running: false, hidden: false })).toBe(false);
  });

  it('resumes animating when the page becomes visible again', () => {
    const hiddenThenVisible = [
      shouldAnimate({ running: true, hidden: true }),
      shouldAnimate({ running: true, hidden: false }),
    ];
    expect(hiddenThenVisible).toEqual([false, true]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/viz/renderPolicy.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/viz/renderPolicy"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/viz/renderPolicy.ts`:

```ts
export interface RenderPolicyInput {
  running: boolean;
  /** `document.hidden` — the page is in a background tab, or the window is minimised. */
  hidden: boolean;
}

/**
 * Whether the visualiser should request another animation frame after the one just drawn.
 * Nothing here affects *when* a click sounds; the audio scheduler runs on its own worker tick.
 */
export function shouldAnimate(input: RenderPolicyInput): boolean {
  return input.running && !input.hidden;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/viz/renderPolicy.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the policy into the controller**

In `src/viz/vizController.ts`, add the import next to the existing `./frame` import:

```ts
import { shouldAnimate } from './renderPolicy';
```

Replace the `onFrame` handler:

```ts
  private readonly onFrame = (): void => {
    this.raf = 0;
    this.render();
    if (this.source.running()) this.invalidate();
  };
```

with:

```ts
  private readonly onFrame = (): void => {
    this.raf = 0;
    this.render();
    if (shouldAnimate({ running: this.source.running(), hidden: document.hidden })) {
      this.invalidate();
    }
  };
```

In the constructor, register a visibility listener immediately after the existing `reducedMotion` listener:

```ts
    this.reducedMotion.addEventListener('change', () => this.invalidate());
    document.addEventListener('visibilitychange', () => {
      // The loop stopped re-arming itself while hidden; restart it on the way back.
      if (!document.hidden) this.invalidate();
    });
```

- [ ] **Step 6: Verify the full suite and the linter still pass**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, Biome reports no errors, `tsc --noEmit` clean.

- [ ] **Step 7: Verify manually in the browser**

Run `npm run dev`, open `http://localhost:5173`, start the metronome, then switch to another browser tab for ~10 seconds and come back.

Expected: the click keeps sounding in the background at the correct tempo (the audio scheduler is unaffected), and on return the visualiser is animating again, in sync with the audio, with no frozen hand and no visual catch-up jump.

- [ ] **Step 8: Commit**

```bash
git add src/viz/renderPolicy.ts tests/viz/renderPolicy.test.ts src/viz/vizController.ts
git commit -m "perf: stop the visualiser render loop while the page is hidden

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Cache idle beat nodes as sprites

This is the single biggest heat contributor. `drawNode` sets `ctx.shadowBlur` for **every** node on **every** frame, and each visualiser then draws a shadowed text label per node on top. At 4/4 that is 8 blur passes per frame, ~480/second; at 16 beats per bar it is ~1920/second. `shadowBlur` is a software blur in Canvas2D and does not batch.

Only the node that is currently glowing actually changes between frames. Every other node is identical to the last time it was drawn. Pre-render each idle node — sphere, shine, and baked-in label — into a small canvas once, then blit it with `drawImage`.

**Files:**
- Create: `src/viz/nodeSprite.ts`
- Create: `tests/viz/nodeSprite.test.ts`
- Modify: `src/viz/types.ts`
- Modify: `src/viz/circular.ts`
- Modify: `src/viz/linear.ts`
- Modify: `src/viz/vizController.ts`

**Interfaces:**
- Consumes: `drawNode(ctx, x, y, radius, level, glow, theme)` from `src/viz/drawNode.ts` (unchanged); `VizTheme` from `src/viz/types.ts`; `BeatLevel` from `src/state/settings.ts`.
- Produces, from `src/viz/nodeSprite.ts`:
  - `SPRITE_PAD: number`
  - `spriteSize(radius: number): number`
  - `spriteKey(themeName: string, level: BeatLevel, label: string, radius: number, dpr: number): string`
  - `interface NodeSprites { get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null }`
  - `type SpriteRenderer = (level: BeatLevel, label: string, radius: number, dpr: number) => CanvasImageSource | null`
  - `class NodeSpriteCache implements NodeSprites` with `constructor(render: SpriteRenderer)`, `setContext(themeName: string, dpr: number): void`, `get(...)`, and a `size` getter.
- Also produces: `Visualizer.draw` gains a fifth parameter, `sprites: NodeSprites`. Both visualisers and `VizController.render` must be updated together.

- [ ] **Step 1: Write the failing test**

Create `tests/viz/nodeSprite.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { NodeSpriteCache, spriteKey, spriteSize } from '../../src/viz/nodeSprite';

// The cache never touches a real canvas: the renderer is injected, so a marker object is enough.
const marker = (tag: string) => ({ tag }) as unknown as CanvasImageSource;

function makeCache(render = vi.fn(() => marker('sprite'))) {
  const cache = new NodeSpriteCache(render);
  cache.setContext('dark', 1);
  return { cache, render };
}

describe('spriteSize', () => {
  it('leaves room on both sides for the idle shadow', () => {
    expect(spriteSize(10)).toBe(36); // (10 + 8) * 2
  });

  it('rounds up so the sprite never clips', () => {
    expect(spriteSize(10.2)).toBe(37);
  });
});

describe('spriteKey', () => {
  it('separates every field that changes the painted pixels', () => {
    const base = spriteKey('dark', 'accent', '1', 12, 2);
    expect(spriteKey('light', 'accent', '1', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'normal', '1', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '2', 12, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '1', 13, 2)).not.toBe(base);
    expect(spriteKey('dark', 'accent', '1', 12, 1)).not.toBe(base);
  });

  it('matches again for the same inputs', () => {
    expect(spriteKey('dark', 'accent', '1', 12, 2)).toBe(spriteKey('dark', 'accent', '1', 12, 2));
  });
});

describe('NodeSpriteCache', () => {
  it('paints a sprite once and reuses it', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('reuses one sprite per distinct level, label, and radius', () => {
    const { cache, render } = makeCache();
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 16; i++) {
        cache.get(i === 0 ? 'accent' : 'normal', String(i + 1), 12);
      }
    }
    // 16 distinct labels, painted once each, not 48 times.
    expect(render).toHaveBeenCalledTimes(16);
    expect(cache.size).toBe(16);
  });

  it('drops cached sprites when the theme changes', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('light', 1);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it('drops cached sprites when the pixel ratio changes', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('dark', 2);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache when the context is set to the same values', () => {
    const { cache, render } = makeCache();
    cache.get('accent', '1', 12);
    cache.setContext('dark', 1);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('passes the current pixel ratio to the renderer', () => {
    const { cache, render } = makeCache();
    cache.setContext('dark', 3);
    cache.get('normal', '4', 9.5);
    expect(render).toHaveBeenCalledWith('normal', '4', 9.5, 3);
  });

  it('falls back to live drawing when the renderer returns null', () => {
    const render = vi.fn(() => null);
    const cache = new NodeSpriteCache(render);
    cache.setContext('dark', 1);
    expect(cache.get('accent', '1', 12)).toBeNull();
  });

  it('does not retry a renderer that already failed', () => {
    const render = vi.fn(() => null);
    const cache = new NodeSpriteCache(render);
    cache.setContext('dark', 1);
    cache.get('accent', '1', 12);
    cache.get('accent', '1', 12);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/viz/nodeSprite.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/viz/nodeSprite"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/viz/nodeSprite.ts`:

```ts
import type { BeatLevel } from '../state/settings';

/** Extra room around the sphere so its idle shadow is not clipped by the sprite edge. */
export const SPRITE_PAD = 8;

/** Side length, in CSS pixels, of the square sprite holding a node of this radius. */
export function spriteSize(radius: number): number {
  return Math.ceil((radius + SPRITE_PAD) * 2);
}

export function spriteKey(
  themeName: string,
  level: BeatLevel,
  label: string,
  radius: number,
  dpr: number,
): string {
  return `${themeName}|${level}|${label}|${radius.toFixed(2)}|${dpr.toFixed(2)}`;
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

  constructor(private readonly render: SpriteRenderer) {}

  /** Every cached sprite is baked in one theme at one pixel ratio; a change invalidates them all. */
  setContext(themeName: string, dpr: number): void {
    if (themeName === this.themeName && dpr === this.dpr) return;
    this.themeName = themeName;
    this.dpr = dpr;
    this.sprites.clear();
  }

  get(level: BeatLevel, label: string, radius: number): CanvasImageSource | null {
    const key = spriteKey(this.themeName, level, label, radius, this.dpr);
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/viz/nodeSprite.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Widen the `Visualizer` interface**

In `src/viz/types.ts`, add the import and the fifth parameter:

```ts
import type { VizFrame } from './frame';
import type { NodeSprites } from './nodeSprite';

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
    sprites: NodeSprites,
  ): void;
}
```

- [ ] **Step 6: Blit idle nodes in the circular visualiser**

In `src/viz/circular.ts`, add the import:

```ts
import { type NodeSprites, spriteSize } from './nodeSprite';
```

Change the signature line from `draw(ctx, { width, height }, frame, theme) {` to:

```ts
  draw(ctx, { width, height }, frame, theme, sprites) {
```

Then replace the final node loop — everything from `ctx.font = ...` to the end of the method:

```ts
    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const p = polar(cx, cy, r, a);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, p.x, p.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(String(i + 1), p.x, p.y);
    }
  },
```

with:

```ts
    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = spriteSize(nodeR);
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const p = polar(cx, cy, r, a);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      const label = String(i + 1);
      const glow = i === frame.activeBeat ? frame.glow : 0;
      if (glow === 0) {
        const sprite = sprites.get(level, label, nodeR);
        if (sprite) {
          ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
          continue;
        }
      }
      drawNode(ctx, p.x, p.y, nodeR, level, glow, theme);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(label, p.x, p.y);
      ctx.restore();
    }
  },
```

Note the label shadow moved inside a `save`/`restore` pair: it used to be set once outside the loop, which is no longer correct now that most iterations skip the live path.

- [ ] **Step 7: Blit idle nodes in the linear visualiser**

In `src/viz/linear.ts`, add the same import:

```ts
import { type NodeSprites, spriteSize } from './nodeSprite';
```

Change the signature line from `draw(ctx, { width, height }, frame, theme) {` to:

```ts
  draw(ctx, { width, height }, frame, theme, sprites) {
```

Replace the final node loop:

```ts
    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < n; i++) {
      const x = linearNodeX(i, n, track.left, track.width);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, x, track.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(String(i + 1), x, track.y);
    }
  },
```

with:

```ts
    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = spriteSize(nodeR);
    for (let i = 0; i < n; i++) {
      const x = linearNodeX(i, n, track.left, track.width);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      const label = String(i + 1);
      const glow = i === frame.activeBeat ? frame.glow : 0;
      if (glow === 0) {
        const sprite = sprites.get(level, label, nodeR);
        if (sprite) {
          ctx.drawImage(sprite, x - size / 2, track.y - size / 2, size, size);
          continue;
        }
      }
      drawNode(ctx, x, track.y, nodeR, level, glow, theme);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(label, x, track.y);
      ctx.restore();
    }
  },
```

- [ ] **Step 8: Give the controller the cache and the real sprite renderer**

In `src/viz/vizController.ts`, add two imports. `BeatLevel` is **already** imported on the existing line `import type { BeatLevel, Settings } from '../state/settings';` — leave that line alone and do not duplicate it. Add only:

```ts
import { drawNode } from './drawNode';
import { NodeSpriteCache, spriteSize } from './nodeSprite';
```

Add the field next to `private lastGlow = 0;`:

```ts
  private readonly sprites = new NodeSpriteCache((level, label, radius, dpr) =>
    this.paintSprite(level, label, radius, dpr),
  );
```

Add the renderer method to the class, just above `private render()`:

```ts
  /** Paints one idle node, label and all, into its own canvas so frames can blit it. */
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

In `render()`, refresh the cache context and pass it to the visualiser. Replace:

```ts
    const s = this.getSettings();
    if (s.theme !== this.themeName) {
      this.themeName = s.theme;
      this.theme = readTheme(this.canvas);
    }
```

with:

```ts
    const s = this.getSettings();
    if (s.theme !== this.themeName) {
      this.themeName = s.theme;
      this.theme = readTheme(this.canvas);
    }
    this.sprites.setContext(s.theme, this.dpr);
```

and replace:

```ts
    visualizer.draw(this.ctx, this.size, frame, this.theme);
```

with:

```ts
    visualizer.draw(this.ctx, this.size, frame, this.theme, this.sprites);
```

- [ ] **Step 9: Run the full suite, linter, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass (including the 11 new ones), Biome clean, `tsc --noEmit` clean. A type error on `Visualizer.draw` means Step 5, 6, 7, or 8 is incomplete.

- [ ] **Step 10: Verify manually — appearance is unchanged**

Run `npm run dev`. With the metronome **stopped**, screenshot the circular visualiser. Then compare against `git stash`-ed old behaviour if unsure.

Check each of these, in both the circular and linear visualiser:
- Idle spheres look identical to before: same size, same colour, same soft shadow, same white shine highlight, same centred number.
- Accent (beat 1) is still pink, normal beats are still the node colour, muted beats are still hollow outlines with a pink number.
- Start playback: the travelling node still swells, brightens, and shows its hot white core, with no seam, halo box, or square edge around any node.
- Tap a node to cycle it through accent → normal → mute: the change appears immediately.
- Change the time signature to 16 beats: nodes shrink, stay crisp, and stay centred on the ring.
- Switch themes in settings while running: **every** node picks up the new colours immediately, not just the glowing one. (This is the Review Focus case — if idle nodes keep the old accent colour, `setContext` is not being called.)

- [ ] **Step 11: Verify manually — the frame cost actually dropped**

Run `npm run dev`, open the app, set the signature to 16/4 and the tempo to 200 BPM, and start it.

In Chrome DevTools → Performance, record ~5 seconds. In the flame chart, look at the scripting time inside the `requestAnimationFrame` handler.

Expected: total scripting time per frame is **substantially** lower than on `master`, and the per-frame work no longer scales with the beat count the way it did (15 of the 16 nodes are now `drawImage` calls). Record the before/after numbers in the commit message.

- [ ] **Step 12: Commit**

```bash
git add src/viz/nodeSprite.ts tests/viz/nodeSprite.test.ts src/viz/types.ts \
        src/viz/circular.ts src/viz/linear.ts src/viz/vizController.ts
git commit -m "perf: blit idle beat nodes from cached sprites

Every node re-ran a shadowBlur pass on every frame. Only the glowing node
changes between frames, so idle nodes are now painted once and blitted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Suspend the AudioContext when stopped

`AudioEngine.stop()` stops the scheduler and the worker but leaves the `AudioContext` in the `running` state forever. A running context keeps the OS audio thread and the audio hardware clock alive, which costs battery even in silence — on a phone, an app left open on the metronome screen keeps draining.

**Files:**
- Modify: `src/engine/audioEngine.ts:61-73`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports. `AudioEngine.stop()` keeps its `(): void` signature.

- [ ] **Step 1: Read the surrounding code before editing**

Read `src/engine/audioEngine.ts` in full. Confirm three things, because the change is only safe if all three hold:
- `start()` already calls `await this.ctx.resume()` before scheduling, so a suspended context recovers on the next start.
- `preview()` already calls `await this.ctx.resume()`, so previewing a sound from the sound sheet while stopped still works.
- The `statechange` listener only forces a resume when `this.scheduler.isRunning` is true, so it will **not** fight a deliberate suspend (the scheduler is stopped by then).

If any of these is not true, stop and report it instead of proceeding.

- [ ] **Step 2: Make the change**

In `src/engine/audioEngine.ts`, replace the `stop()` method:

```ts
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
```

with:

```ts
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
    // A running context holds the audio hardware clock open and drains battery in silence.
    // start() and preview() both resume it, so suspending here is self-healing.
    this.ctx.suspend().catch(() => {
      // Nothing to do: the context is already closed or the browser refused.
    });
  }
```

- [ ] **Step 3: Run the full suite, linter, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. No test covers `AudioEngine` (it is browser glue) — this step is to confirm nothing else broke.

- [ ] **Step 4: Verify manually — the five ways this could regress**

Run `npm run dev` and check each in order. Every one must pass before committing.

1. **Stop then start.** Start, stop, start again. The click resumes immediately at the correct tempo, with no missing first beat and no long silence.
2. **Preview while stopped.** Stop the metronome, open the sound sheet, tap a sound to preview it. It is audible.
3. **Upload while stopped.** Stop, open the sound sheet, upload a sound file. It decodes and previews — `decodeAudioData` must still work on a suspended context.
4. **Rapid toggling.** Tap play/pause ten times quickly. No errors in the console, no stuck state, audio still works afterwards.
5. **Practice timer auto-stop.** Set a 1-minute practice timer, start, and let it run out. The metronome stops on its own; starting again afterwards works.

Add `?debug=1` and confirm `minLead` stays positive after a stop/start cycle — a negative value would mean a click was scheduled late.

- [ ] **Step 5: Commit**

```bash
git add src/engine/audioEngine.ts
git commit -m "perf: suspend the AudioContext while the metronome is stopped

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Hold a screen wake lock while playing

Foreground-only playback was the explicit design choice, and it only works if the screen stays on. Without this, Android sleeps the display mid-practice and the WebView is suspended with it — the click stops. `navigator.wakeLock` is supported in Android's Chromium WebView, so no Capacitor plugin is needed.

Android releases a wake lock whenever the page is hidden, so it must be re-acquired on `visibilitychange`.

**Files:**
- Create: `src/ui/wakeLock.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createWakeLock(): WakeLock` from `src/ui/wakeLock.ts`, where `interface WakeLock { setActive(active: boolean): void }`.

- [ ] **Step 1: Create the wake lock module**

Create `src/ui/wakeLock.ts`:

```ts
export interface WakeLock {
  /** Request the screen stay awake (true) or let it sleep again (false). */
  setActive(active: boolean): void;
}

/**
 * Keeps the screen on while the metronome is playing. Every call is best-effort: the API is
 * missing on some browsers, and the lock is revoked whenever the page is hidden, so it is
 * re-acquired on the way back. It is never load-bearing for audio.
 */
export function createWakeLock(): WakeLock {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  const acquire = (): void => {
    if (!wanted || sentinel || document.hidden) return;
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (!wanted) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          sentinel = null;
        });
      })
      .catch(() => {
        // Denied, unsupported, or the document lost focus. The metronome still works.
      });
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) acquire();
  });

  return {
    setActive(active: boolean): void {
      wanted = active;
      if (active) {
        acquire();
        return;
      }
      const lock = sentinel;
      sentinel = null;
      lock?.release().catch(() => {
        // Already released.
      });
    },
  };
}
```

- [ ] **Step 2: Wire it into the transport toggle**

In `src/main.ts`, add the import beside the other `./ui/*` imports:

```ts
import { createWakeLock } from './ui/wakeLock';
```

Add the instance just above the `let practiceTimer` declarations:

```ts
const wakeLock = createWakeLock();
```

Inside the `mountTransport({ ... onToggle: () => { ... } })` callback, add the wake lock line as the **first** statement, before `viz.invalidate()`:

```ts
  onToggle: () => {
    wakeLock.setActive(engine.running);
    viz.invalidate();
```

`engine.running` is already correct by the time `onToggle` fires — the existing `if (!engine.running)` branch below it relies on the same thing.

- [ ] **Step 3: Run the full suite, linter, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. If `tsc` reports `WakeLockSentinel` is not defined, the `dom` lib is missing from `tsconfig.json` — check `compilerOptions.lib` includes `DOM` before adding any type shim.

- [ ] **Step 4: Verify manually on a desktop browser**

Run `npm run dev` in Chrome. Start the metronome. In DevTools → Application → Background Services, or by evaluating `navigator.wakeLock` in the console, confirm no error is thrown. Stop the metronome; confirm no console errors.

This only proves it does not crash — the real test is Step 5 of Task 8, on a phone.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wakeLock.ts src/main.ts
git commit -m "feat: keep the screen awake while the metronome plays

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase B — Google Play release

> **Prerequisites before starting Task 5.** Install and verify, in this order:
> - JDK 17 or newer — `java -version`
> - Android Studio **Otter | 2025.2.1 or newer**, with the Android SDK Platform 36 and Build-Tools installed via the SDK Manager
> - `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) set to the SDK path, with `platform-tools` on `PATH` — `adb --version`
>
> If any of these is missing, install it before continuing. Do not try to work around a missing SDK.

## Task 5: Add the Capacitor Android shell

Wraps the existing `dist/` build in a native Android project. Assets are bundled into the APK, so the app needs no network, no hosting, and no Digital Asset Links.

One subtlety must be handled here or it causes a confusing bug later: `vite-plugin-pwa` registers a service worker, and inside the Capacitor WebView that would cache the app shell on top of assets that are *already* local, producing stale screens after an update. `main.ts` already skips registration under Tauri; the same guard must cover Capacitor.

**Files:**
- Create: `src/platform.ts`
- Create: `tests/platform.test.ts`
- Create: `capacitor.config.ts`
- Create: `android/` (generated by `npx cap add android`)
- Modify: `src/main.ts:182-188`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isNativeShell(w: NativeShellWindow): boolean` and `interface NativeShellWindow { __TAURI_INTERNALS__?: unknown; Capacitor?: unknown }` from `src/platform.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNativeShell } from '../src/platform';

describe('isNativeShell', () => {
  it('is false in a plain browser', () => {
    expect(isNativeShell({})).toBe(false);
  });

  it('is true under Tauri', () => {
    expect(isNativeShell({ __TAURI_INTERNALS__: {} })).toBe(true);
  });

  it('is true under Capacitor', () => {
    expect(isNativeShell({ Capacitor: {} })).toBe(true);
  });

  it('is true even when the injected global is falsy but present', () => {
    expect(isNativeShell({ Capacitor: undefined })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/platform.test.ts`
Expected: FAIL — `Failed to resolve import "../src/platform"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/platform.ts`:

```ts
export interface NativeShellWindow {
  __TAURI_INTERNALS__?: unknown;
  Capacitor?: unknown;
}

/**
 * Whether the app is running inside a native shell rather than a browser. Both shells serve the
 * build from local files, so the service worker has nothing to add and would only serve stale
 * assets after an update.
 */
export function isNativeShell(w: NativeShellWindow): boolean {
  return '__TAURI_INTERNALS__' in w || 'Capacitor' in w;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/platform.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in the composition root**

In `src/main.ts`, add the import beside the other `./` imports:

```ts
import { isNativeShell } from './platform';
```

Replace the block at the end of the file:

```ts
if (!('__TAURI_INTERNALS__' in window)) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}
```

with:

```ts
if (!isNativeShell(window)) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}
```

- [ ] **Step 6: Install Capacitor**

```bash
npm install @capacitor/core@^8 @capacitor/android@^8
npm install --save-dev @capacitor/cli@^8
```

Verify: `npx cap --version` prints an 8.x version.

- [ ] **Step 7: Create the Capacitor config**

Create `capacitor.config.ts` at the repo root:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.psymore.metronome',
  appName: 'Metronome',
  webDir: 'dist',
  android: {
    backgroundColor: '#141416',
  },
};

export default config;
```

`webDir` is `dist` and the Vite `base` stays `/` (it only becomes `/metronome/` when `GITHUB_PAGES=true`). Never set `GITHUB_PAGES` when building for Android — a `/metronome/` base produces a white screen in the WebView.

- [ ] **Step 8: Generate the Android project**

```bash
npm run build
npx cap add android
npx cap sync android
```

Then confirm the SDK levels Capacitor generated. Read `android/variables.gradle` and verify it contains exactly:

```gradle
minSdkVersion = 24
compileSdkVersion = 36
targetSdkVersion = 36
```

If `targetSdkVersion` is below 36, raise it to 36 — Google Play rejects new submissions below API 36 as of 2026-08-31.

- [ ] **Step 9: Add the Android build scripts**

In `package.json`, add these three entries to `"scripts"`, after `"tauri"`:

```json
    "android": "npm run build && npx cap sync android && npx cap open android",
    "android:sync": "npm run build && npx cap sync android",
    "android:run": "npm run build && npx cap sync android && npx cap run android",
```

- [ ] **Step 10: Ignore the Android build outputs**

Append to `.gitignore`:

```gitignore
android/.gradle/
android/build/
android/app/build/
android/app/src/main/assets/public/
android/app/release/
android/local.properties
android/keystore.properties
*.keystore
*.jks
```

The `android/` project itself **is** committed — only its build outputs, the copied web assets, and anything key-bearing are ignored.

- [ ] **Step 11: Run the app on a device or emulator**

Connect a phone with USB debugging on (`adb devices` lists it), or start an emulator running API 36.

```bash
npm run android:run
```

Verify on the device:
- The app launches to the metronome screen with no white flash and no error page.
- Tapping play produces an audible click at the right tempo.
- The visualiser animates in sync with the audio.
- Changing tempo, signature, and sounds all work.
- Uploading a sound file works (this exercises IndexedDB in the WebView).
- Killing and reopening the app restores the saved settings (this exercises `localStorage`).

- [ ] **Step 12: Run the full suite, linter, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, including the 4 new `platform` tests.

- [ ] **Step 13: Commit**

```bash
git add src/platform.ts tests/platform.test.ts src/main.ts capacitor.config.ts \
        package.json package-lock.json .gitignore android/
git commit -m "feat: add the Capacitor Android shell

Bundles dist/ into the APK, so Android needs no hosting or asset links.
Skips service-worker registration inside both native shells.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Fit the edge-to-edge Android window

`targetSdk 36` forces edge-to-edge on Android 15+: the app draws behind the status bar and the gesture navigation bar. `.app` already pads the top with `env(safe-area-inset-top)`, but its bottom padding is a flat `24px`, so the bottom controls sit under the gesture bar on most phones.

**Files:**
- Modify: `src/styles.css:124-130`
- Modify: `android/app/src/main/res/values/styles.xml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no code interfaces.

- [ ] **Step 1: Pad the bottom for the gesture bar**

In `src/styles.css`, replace the `.app` rule:

```css
.app {
  max-width: 480px;
  margin: 0 auto;
  padding: max(12px, env(safe-area-inset-top)) 16px 24px;
  display: grid;
  gap: 14px;
}
```

with:

```css
.app {
  max-width: 480px;
  margin: 0 auto;
  padding: max(12px, env(safe-area-inset-top)) 16px
    max(24px, calc(env(safe-area-inset-bottom) + 12px));
  display: grid;
  gap: 14px;
}
```

`index.html` already carries `viewport-fit=cover`, so the `env()` values resolve.

- [ ] **Step 2: Match the native window background to the app**

Read `android/app/src/main/res/values/styles.xml`. In the `AppTheme.NoActionBarLaunch` style, set the launch background so there is no white flash before the WebView paints:

```xml
<item name="android:background">@color/metronomeBackground</item>
```

Then create `android/app/src/main/res/values/colors.xml` if it does not exist, or add to it:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="metronomeBackground">#141416</color>
</resources>
```

If `colors.xml` already exists with other entries, add only the `metronomeBackground` line and leave the rest alone.

- [ ] **Step 3: Rebuild and check on the device**

```bash
npm run android:run
```

Verify on a phone with gesture navigation enabled:
- No white or grey flash on launch — the screen goes straight from the icon to the dark app background.
- The bottom row of controls is fully tappable and not overlapped by the gesture pill.
- The top bar (title, language switch) is below the status bar clock, not behind it.
- Rotating to landscape and back does not clip anything.

- [ ] **Step 4: Confirm the web build is unaffected**

Run `npm run dev` and check in a desktop browser that the layout is unchanged — `env(safe-area-inset-bottom)` is `0px` there, so the `max()` resolves to the original `24px`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css android/app/src/main/res/
git commit -m "fix: respect Android edge-to-edge insets and launch background

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Sign the release build and produce an AAB

Google Play requires an Android App Bundle signed with an upload key. **The keystore is not recoverable** — losing it means losing the ability to update the app under this listing.

**Files:**
- Create: `android/keystore.properties` (gitignored)
- Create: the keystore file itself, **outside the repo**
- Modify: `android/app/build.gradle`

**Interfaces:**
- Consumes: the Android project from Task 5.
- Produces: `android/app/build/outputs/bundle/release/app-release.aab`.

- [ ] **Step 1: Ask the user before generating the key**

Stop and confirm with the user before running the next step. They need to choose and record a keystore password and a key password, and decide where the keystore file will live and be backed up. Do not invent passwords for them, and do not store passwords in the repo.

- [ ] **Step 2: Generate the upload keystore**

Run this **outside** the repository — for example in the user's home directory. Replace the placeholder values with what the user chose:

```bash
keytool -genkey -v \
  -keystore ~/metronome-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias metronome-upload
```

`keytool` prompts for the passwords and the distinguished-name fields. Record where the file ended up.

Tell the user, explicitly: **back this file up somewhere safe. If it is lost, no future update can be published to this listing.**

- [ ] **Step 3: Point Gradle at the keystore**

Create `android/keystore.properties` (already gitignored in Task 5, Step 10):

```properties
storeFile=C:/Users/4D/metronome-upload.jks
storePassword=<the keystore password>
keyAlias=metronome-upload
keyPassword=<the key password>
```

Use forward slashes in `storeFile` even on Windows. Adjust the path to wherever Step 2 actually wrote the file.

- [ ] **Step 4: Add the signing config**

In `android/app/build.gradle`, add this **above** the `android {` block:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Then, inside the `android {` block, add a `signingConfigs` block before `buildTypes` and reference it from the release build type:

```gradle
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
```

Keep whatever else is already inside `buildTypes.release`; only add the `signingConfig` line if the block already exists.

The `if (keystorePropertiesFile.exists())` guard matters: without it, a fresh clone without the properties file fails to configure at all.

- [ ] **Step 5: Set the version for the first release**

In `android/app/build.gradle`, inside `defaultConfig`, set:

```gradle
        versionCode 1
        versionName "0.1.0"
```

`versionName` matches `package.json` and `src-tauri/tauri.conf.json` (both `0.1.0`). `versionCode` is an integer that must increase on **every** upload to Play — note this in the docs in Task 9.

- [ ] **Step 6: Build the signed bundle**

```bash
npm run android:sync
cd android && ./gradlew bundleRelease && cd ..
```

On Windows PowerShell, use `.\gradlew.bat bundleRelease`.

Expected: `BUILD SUCCESSFUL`, and the file `android/app/build/outputs/bundle/release/app-release.aab` exists.

- [ ] **Step 7: Verify the bundle is signed and targets API 36**

```bash
cd android && ./gradlew signingReport && cd ..
```

Expected: the `release` variant shows the `metronome-upload` alias with a valid SHA-256 fingerprint — not the debug key.

Confirm `targetSdkVersion = 36` in `android/variables.gradle` one more time. An AAB below API 36 is rejected at upload as of 2026-08-31.

- [ ] **Step 8: Install the release build on a real device and test it**

A release build is not a debug build: it is minified differently, it has no dev server, and it is the first time the bundled assets are exercised as shipped.

```bash
cd android && ./gradlew installRelease && cd ..
```

Verify on the device, with the phone **unplugged from the computer**:
- The app launches and plays.
- Audio is clean at 40 BPM and at 400 BPM, and at 16/4 with 16th-note subdivisions.
- **Leave it playing for 10 minutes and then feel the back of the phone.** Compare against how it felt before Phase A if possible. It should be warm at most, not hot.
- Check the battery usage for the app in Android Settings after that run.
- **Wake lock:** leave it playing and do not touch the screen for longer than the display timeout (set the timeout to 30 seconds in Android Settings to test this quickly). The screen must stay on and the click must keep sounding.
- **Backgrounding:** press Home while playing. It is expected and acceptable that the click stops — this is the foreground-only design decision. Reopening the app must return it to a clean stopped state with no stuck UI.

- [ ] **Step 9: Commit**

```bash
git add android/app/build.gradle
git commit -m "build: sign the Android release and produce an AAB

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Run `git status` afterwards and confirm **no keystore and no `keystore.properties`** were staged. If either appears, stop, unstage it, and fix `.gitignore` before continuing.

---

## Task 8: Publish to the Play Console

The user already has a Play Console account and the icon plus store graphics. This task is mostly console work, not code. **Every step that publishes something must be confirmed with the user first.**

**Files:**
- Create: `docs/privacy-policy.md` and the published page it maps to
- Modify: nothing in `src/`

**Interfaces:**
- Consumes: the signed AAB from Task 7.
- Produces: a Play Console listing in closed testing.

- [ ] **Step 1: Determine which testing rule applies**

Ask the user: is the Play Console account a **personal** account or an **organisation** account, and when was it created?

- **Organisation account** (registered to a legal business entity): exempt. It can go straight to production.
- **Personal account created after 2023-11-13**: it must run a **closed test with at least 12 testers opted in continuously for 14 days** before production access can be requested, and Google checks that those testers actually used the app.
- **Personal account created on or before 2023-11-13**: exempt.

This determines the timeline. If the 12-tester rule applies, the earliest possible production date is **14 days after the closed test reaches 12 opted-in testers** — say so plainly, and plan the rest around it.

- [ ] **Step 2: Write the privacy policy**

Play requires a privacy policy URL for every listing, even for an app that collects nothing.

Create `docs/privacy-policy.md`:

```markdown
# Metronome — Privacy Policy

_Last updated: 2026-09-24_

Metronome does not collect, transmit, or share any personal data.

## What the app stores

Everything the app saves stays on your device:

- **Settings** (tempo, time signature, accent pattern, sounds, theme, language,
  volume, sync offset) are stored in the app's local storage.
- **Sound files you upload** are stored in the app's local database on your device.

None of this is sent anywhere. The app has no account system, no analytics, no
advertising, and no third-party services.

## Network access

The app works fully offline and makes no network requests while in use.

## Permissions

The app requests no Android runtime permissions.

## Deleting your data

Uninstalling the app, or clearing its storage from Android Settings, permanently
removes everything it saved.

## Contact

Questions about this policy: egeozeldev@gmail.com
```

Publish it at a public URL. The simplest option that needs no new infrastructure is the existing GitHub Pages site — confirm the exact published URL with the user before entering it in the console.

- [ ] **Step 3: Confirm the store listing assets**

The user already has the icon and store graphics. Verify each against Play's requirements before uploading:

| Asset | Requirement |
|---|---|
| App icon | 512 × 512 PNG, 32-bit, under 1 MB |
| Feature graphic | 1024 × 500 PNG or JPEG |
| Phone screenshots | 2–8 images, 16:9 or 9:16, each side 320–3840 px |
| Short description | ≤ 80 characters |
| Full description | ≤ 4000 characters |

Draft copy for the user to approve or edit:

- **Short description:** `A precise metronome with custom sounds and synced visualisers.`
- **Full description:** lead with the sample-accurate timing, then custom sound uploads, the circular and linear visualisers, subdivisions, accent patterns, tap tempo, the practice timer, and offline-by-default operation. State plainly that it has no ads, no accounts, and no tracking.

Take the screenshots from the release build on a real device, with the metronome running, showing both visualisers.

- [ ] **Step 4: Create the app in the Play Console**

Confirm with the user before creating it. Then, in the Play Console:

- App name: `Metronome`
- Default language, app-or-game: **App**, free-or-paid: confirm with the user
- Complete the **App content** declarations: privacy policy URL, ads (**none**), data safety (**no data collected, no data shared**), content rating questionnaire, target audience, news app (**no**), government app (**no**), financial features (**none**)
- Data safety is the one people get wrong: uploaded sounds never leave the device, so the answer is genuinely "no data collected". Do not declare local storage as collection.

- [ ] **Step 5: Upload the AAB to a closed testing track**

Confirm with the user before uploading — this is the first irreversible external action.

Create a **Closed testing** release, upload `android/app/build/outputs/bundle/release/app-release.aab`, and write release notes.

If Play reports the upload key is not registered, enroll in **Play App Signing** when prompted — this is the default and recommended path.

- [ ] **Step 6: Recruit testers and start the clock**

If the 12-tester rule applies from Step 1: create an email list of at least 12 testers, share the opt-in link, and confirm each one has actually opted in. The 14 days counts only while at least 12 testers are continuously opted in — anyone who opts out resets their own contribution.

Ask testers to actually open and use the app, not just install it.

- [ ] **Step 7: Apply for production**

After 14 continuous days with 12+ opted-in testers, apply for production access in the console, then promote the release. Confirm with the user before promoting.

- [ ] **Step 8: Commit the privacy policy**

```bash
git add docs/privacy-policy.md
git commit -m "docs: add the privacy policy required for the Play listing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Write the platforms runbook

`CLAUDE.md` already points at `docs/architecture/platforms.md` for "PWA, GitHub Pages, Tauri, CI", but the file does not exist yet. Android now belongs in it too.

**Files:**
- Create: `docs/architecture/platforms.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 5–8.
- Produces: no code interfaces.

- [ ] **Step 1: Write the runbook**

Create `docs/architecture/platforms.md` covering, as a runbook someone can follow without reading this plan:

- **The four targets** and how each gets its assets: dev server, GitHub Pages PWA (`GITHUB_PAGES=true`, base `/metronome/`), Tauri Windows (NSIS), Capacitor Android (bundled `dist/`).
- **Why Capacitor and not a TWA** — one paragraph, so nobody re-litigates it: `*.github.io` is a shared origin, its root cannot serve `assetlinks.json`, and there is no custom domain.
- **The service-worker guard** — `isNativeShell()` in `src/platform.ts`, and why registering a SW inside a native shell serves stale assets.
- **Never set `GITHUB_PAGES=true` for an Android build** — the `/metronome/` base white-screens the WebView.
- **Android release checklist**, in order: bump `versionCode` (must increase on every upload) and `versionName`; `npm run android:sync`; `./gradlew bundleRelease`; verify with `./gradlew signingReport`; test the release build unplugged on a real device; upload.
- **The keystore** — where it lives, that it is gitignored, and that losing it ends the ability to update the listing.
- **Version floors** — `minSdk 24`, `compileSdk 36`, `targetSdk 36`, and that Play has required API 36 for new submissions since 2026-08-31.
- **The 12-testers/14-days rule** and who it applies to.
- **Performance invariants from Phase A**, so they are not undone: the render loop must stay gated on `document.hidden`; idle nodes must stay sprite-cached and the cache must be invalidated on theme and DPR change; the `AudioContext` must stay suspended while stopped.

- [ ] **Step 2: Update CLAUDE.md**

In the architecture table in `CLAUDE.md`, change the platforms row to mention Android:

```markdown
| PWA, GitHub Pages, Tauri, Android/Play release, CI | `docs/architecture/platforms.md` |
```

In the "Rules that are easy to break" list, add three entries:

```markdown
- Android builds must never set `GITHUB_PAGES=true`: the `/metronome/` base white-screens the WebView.
- Idle beat nodes are drawn from cached sprites, not painted live. Anything that changes their appearance (theme, pixel ratio) must invalidate the cache, or nodes keep the old look.
- The visualiser's `requestAnimationFrame` loop stops while `document.hidden` and must be restarted on `visibilitychange`. Audio is unaffected — it runs on the worker tick.
```

Also update the **Status** line if the metronome plan's final task is now done.

- [ ] **Step 3: Verify the docs match reality**

Re-read `docs/architecture/platforms.md` against the repo. Every command in it must be one that exists in `package.json` or was actually run in Tasks 5–8. Every version number must match `android/variables.gradle`. Fix any drift.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/platforms.md CLAUDE.md
git commit -m "docs: add the platforms runbook covering the Android release

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test`, `npm run lint`, and `npm run build` all pass.
- A 10-minute run at 16/4, 200 BPM on a real phone leaves the device warm, not hot, and the DevTools frame cost is measurably below `master`.
- The screen stays on while playing and the click survives past the display timeout.
- A signed, API-36 AAB is uploaded to a Play closed-testing track.
- `docs/architecture/platforms.md` exists and `CLAUDE.md` points at it.
