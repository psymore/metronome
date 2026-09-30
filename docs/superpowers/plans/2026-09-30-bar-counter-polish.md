# Bar Counter Polish Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Work on a plain branch `bar-counter-polish` (no worktrees). Never add `Co-Authored-By` or any attribution line to commits. Don't push. **No browser/Playwright checks**: the user tests on their phone.

**Goal:** Make the Song length dialog clear, and make applying a length feel immediate and visible. Also make the bar counter count in polyrhythm mode.

**Architecture:**
- Pure formatting lives in `src/state/barCounter.ts` (unit-tested).
- Dialog glue lives in `src/ui/barCounterDialog.ts`.
- Counter updates come from `VizController`'s `onBeatStart(level, barIndex)` callback, which is wired in `src/main.ts`.
- Today only the non-poly render path calls that callback, so polyrhythm never advances the counter.

**Tech Stack:** TypeScript, Vite, Vitest, Biome. No new dependencies.

## Global Constraints
- Every user-visible string goes in `src/i18n/translations.ts`, in both `en` and `tr`.
- Files must use LF line endings. Biome rejects CRLF, so run `npm run format` before committing.
- Run `npm test`, `npm run lint` and `npm run build` before the final commit.

## Review Focus
- Applying a length while the metronome is **playing** must not reset or restart the current run. The counter simply picks up the new total on the next bar.
- Setting 0 with Apply turns the target off, closes the dialog and shows the plain idle text.
- In polyrhythm, one counter bar = one full A:B cycle, so `cycleIndex` is the bar index. Song length should stop the metronome after `targetBars × loopCount` cycles, exactly as in normal mode.

---

### Task 1: Clearer hint texts

**Files:** Modify `src/i18n/translations.ts`

- [ ] Replace these values:

| key | en | tr |
|---|---|---|
| `songLength.hint` | `How many bars is the piece? While it plays, the counter shows which bar you're on (e.g. 5/32) and stops at the end. 0 = off.` | `Parça kaç ölçü? Çalarken sayaç kaçıncı ölçüde olduğunu gösterir (ör. 5/32) ve sonunda durur. 0 = kapalı.` |
| `barCounter.loopHint` | `How many times to play the piece through before stopping. ∞ = until you stop it.` | `Parça durmadan önce kaç kez baştan çalınsın. ∞ = siz durdurana kadar.` |
| `barCounter.loopSubLabel` | (unchanged) | `Başka bir sayı seçmezseniz bir kez çalar` |

- [ ] Commit: `Clarify the song length and loop hints`

### Task 2: Apply applies at once, closes the dialog and flashes the counter

The double-tap confirm (a 3 s armed window) is too fast to read, and it guards a cheap, reversible action. Remove it here. **Do not change** the practice timer's or Reset's confirm gates.

**Files:**
- Modify `src/state/barCounter.ts`, `tests/state/barCounter.test.ts`
- Modify `src/i18n/translations.ts`
- Modify `src/ui/barCounterDialog.ts`, `src/main.ts`
- Modify `src/styles.css`

- [ ] **Step 1: failing test** in `tests/state/barCounter.test.ts`:

```ts
describe('formatIdleBarCounter', () => {
  it('shows a dash for the bar and the target total', () => {
    expect(formatIdleBarCounter(0, 1)).toBe('Bar −');
    expect(formatIdleBarCounter(16, 1)).toBe('Bar −/16');
    expect(formatIdleBarCounter(16, 3)).toBe('Bar −/16 Loop −/3');
    expect(formatIdleBarCounter(16, 0)).toBe('Bar −/16 Loop ∞');
  });
});
```

(Import `formatIdleBarCounter` next to the existing imports. The tests run in `en`.)

- [ ] **Step 2:** Add the i18n keys:
  - en:
    - `'barCounter.idleWithTarget': 'Bar −/{total}'`
    - `'barCounter.idleWithLoop': 'Bar −/{total} Loop −/{loopTotal}'`
    - `'barCounter.idleWithInfiniteLoop': 'Bar −/{total} Loop ∞'`
  - tr:
    - `'Ölçü −/{total}'`
    - `'Ölçü −/{total} Tekrar −/{loopTotal}'`
    - `'Ölçü −/{total} Tekrar ∞'`

- [ ] **Step 3: implement** in `src/state/barCounter.ts`:

```ts
/** The counter while stopped: a dash for the bar, plus the target and loop count when set. */
export function formatIdleBarCounter(targetBars: number, loopCount: number): string {
  if (targetBars <= 0) return format('barCounter.idle', {});
  if (loopCount === 1) return format('barCounter.idleWithTarget', { total: targetBars });
  if (loopCount === 0) return format('barCounter.idleWithInfiniteLoop', { total: targetBars });
  return format('barCounter.idleWithLoop', { total: targetBars, loopTotal: loopCount });
}
```

Run `npm test -- barCounter`. Expected: PASS.

- [ ] **Step 4: `src/main.ts`**
  - `showIdleBarCounter` uses `formatIdleBarCounter(s.targetBars, s.loopCount)` (with `s = store.get()`) instead of `t('barCounter.idle')`.
  - Add a store subscription that calls `showIdleBarCounter()` when `!engine.running` and `targetBars` or `loopCount` changed. Follow the existing `(s, prev)` subscribe pattern used for `polyrhythm.enabled`.
  - While running, the next `onBeatStart` picks up the new values by itself.

- [ ] **Step 5: `src/ui/barCounterDialog.ts`**
  - Delete the `createConfirmGate` import and usage, and all `confirmGate.*` calls.
  - Apply handler:

```ts
  const barCounterBtn = byId('barCounter');
  const flashCounter = () => {
    barCounterBtn.classList.remove('just-set');
    void barCounterBtn.offsetWidth; // restart the animation if it's already running
    barCounterBtn.classList.add('just-set');
  };
  barCounterBtn.addEventListener('animationend', () => barCounterBtn.classList.remove('just-set'));

  targetBarsApply.addEventListener('click', () => {
    const current = store.get().targetBars;
    if (pendingTargetBars <= 0 && current <= 0) {
      toast(t('songLength.needsLength'));
      return;
    }
    store.set({ targetBars: Math.max(0, pendingTargetBars) });
    dialog.close();
    flashCounter();
  });
```

  - Reuse the existing `byId('barCounter')` lookup in the file for `barCounterBtn` rather than calling `byId` twice.
  - Remove the now-unused `songLength.confirm` key from both languages.
  - Grep `confirm-gate` / `songLength.confirm` so nothing else references it.
  - Loop chips stay instant, and the dialog stays open for them.

- [ ] **Step 6: `src/styles.css`**, next to the `.bar-counter` rule:

```css
/* A quick glow on the counter after Song length is applied, so the new total is noticed. */
.bar-counter.just-set {
  animation: bar-counter-set 900ms ease-out;
}
@keyframes bar-counter-set {
  0%, 35% {
    border-color: var(--select);
    box-shadow: 0 0 0 2px var(--select), 0 0 14px var(--select);
  }
}
```

- Reduced motion already sets `animation: none` globally. `animationend` then never fires, so the class simply stays until the next apply, which is harmless.
- If `.bar-counter` has no border, use `outline` in place of `border-color`.

- [ ] **Step 7:** `npm test`, `npm run lint`. Commit: `Song length: apply at once, close the dialog, glow the counter; show −/N while stopped`

### Task 3: Bar counter in polyrhythm

**Files:** Modify `src/viz/vizController.ts` (the poly branch of the render method, around the `this.lastGlow = Math.max(frame.glowA, frame.glowB)` line)

Treat layer A's beats like normal beats: when a new A beat starts, fire `onBeatStart` with its level and `cycleIndex` as the bar index. This also gives polyrhythm the same knob flash, hub pulse and haptics as normal mode.

- [ ] Replace the `lastGlow` update in the poly branch with:

```ts
      if (frame.glowA > this.lastGlow && beatA) {
        const level = s.polyrhythm.levelsA[beatA.index] ?? 'normal';
        this.onBeatStart?.(level, beatA.cycleIndex);
      }
      this.lastGlow = frame.glowA;
```

(Match the non-poly branch: the callback fires on the rising edge of the glow.)

- [ ] Check `transport.toggle()` → `showIdleBarCounter()` still resets the text on stop in poly mode. It runs from `onToggle`, which is mode-independent, so no change is expected.
- [ ] Commit: `Count bars (one A:B cycle each) in polyrhythm mode`

### Task 4: Practice timer in polyrhythm: verify only, by reading the code

The practice timer is started, paused and resumed from `mountTransport`'s `onToggle` in `src/main.ts`. It runs on wall-clock `setTimeout`s, not on beats or the engine mode. It should therefore already work in polyrhythm.

- [ ] Confirm by reading:
  - Nothing in the practice-timer code checks `polyrhythm.enabled`.
  - `engine.switchMode()`, the poly on/off change, doesn't stop the engine without going through `transport.toggle()`.
- [ ] If the second point is false, the timer keeps counting while the sound stops. Report it in `FOLLOWUP.md` and don't fix it here.
- [ ] Update `docs/superpowers/FOLLOWUP.md`: replace the whole file with a short handoff. Include the phone checklist:
  - Song length Apply closes the dialog and the counter glows.
  - −/N shows while stopped.
  - The counter counts and stops in polyrhythm.
  - The practice timer runs in polyrhythm.
- [ ] Commit: `Update FOLLOWUP.md`

### Task 5: Classic engraved-italic font for the "i" buttons and the tempo marking (Moderato…)

Match the old sheet-music look: a serif italic like the tempo words printed on a score. Self-host the font the same way Inter is done; see the comment at the top of `src/styles.css` for why a CDN is not allowed (offline and privacy promises).

**Files:**
- Create `src/assets/fonts/eb-garamond/`, holding the woff2 files and `OFL.txt`
- Modify `src/styles.css`

- [ ] **Step 1: get the font files once.** This is a dev-time download only, so it adds no dependency:

```bash
cd "$TEMP" && npm pack @fontsource/eb-garamond && tar xzf fontsource-eb-garamond-*.tgz
```

  - Copy these files into `src/assets/fonts/eb-garamond/`:
    - `package/files/eb-garamond-latin-600-italic.woff2` → `eb-garamond-italic-latin.woff2`
    - `package/files/eb-garamond-latin-ext-600-italic.woff2` → `eb-garamond-italic-latin-ext.woff2`
    - `package/LICENSE` → `OFL.txt`
  - Don't touch `package.json`.
  - The service worker already precaches `**/*.woff2`.

- [ ] **Step 2:** In `src/styles.css`, add two `@font-face` blocks right after the Inter ones:
  - Copy Inter's `unicode-range` lists exactly.
  - `font-family: "EB Garamond"`, `font-style: italic`, `font-weight: 600`, `font-display: swap`.
  - Then add this token to `:root`:

```css
  --font-score: "EB Garamond", "Palatino Linotype", Georgia, serif;
```

- [ ] **Step 3:** Use it in two places.
  - `.tempo-marking`:
    - `font-family: var(--font-score); font-style: italic; font-weight: 600;`
    - `font-size: 17px`. Garamond's x-height is small, so 13px would read tiny.
    - `letter-spacing: 0.01em`.
  - `.info-btn`:
    - `font-family: var(--font-score); font-style: italic; font-weight: 600; font-size: 16px; line-height: 1;`
    - Nudge the glyph with `padding-right: 1px` if it looks off-center. Italic "i" leans right.
- [ ] `npm run build`. Check that `dist/` contains both new woff2 files.
- [ ] Commit: `Engraved-italic score font (self-hosted EB Garamond) for tempo marking and info buttons`

### Task 6: The info popup stays until dismissed, with a ✕ in its right edge

Today `createInfoPopup` (`src/ui/infoPopup.ts`) hides the popup after 5 s. It should stay open until one of these happens:
- a tap outside it (already works),
- a tap on its ✕,
- Escape.

Tapping the text itself should no longer close it, so users can read and select it calmly.

**Files:** Modify `index.html` (line with `id="infoPopup"`), `src/ui/infoPopup.ts`, `src/styles.css` (`.info-popup`)

- [ ] **index.html:** change the `<p id="infoPopup" …>` to:

```html
<div id="infoPopup" class="info-popup" role="status" aria-live="polite" hidden>
  <p id="infoPopupText" class="info-popup-text"></p>
  <button type="button" id="infoPopupClose" class="info-popup-close" data-i18n-aria-label="close.ariaLabel" aria-label="Close">✕</button>
</div>
```

- [ ] **src/ui/infoPopup.ts:**
  - Drop `durationMs`, the timer, and `el.addEventListener('click', hide)`.
  - Keep the outside-click listener.
  - Add the close button and an Escape handler, and write the message into the text element:

```ts
export function createInfoPopup(el: HTMLElement): InfoPopup {
  const reparent = createTopLayerHost(el);
  const text = el.querySelector<HTMLElement>('.info-popup-text') ?? el;
  const hide = (): void => {
    el.hidden = true;
  };
  el.querySelector('.info-popup-close')?.addEventListener('click', hide);
  document.addEventListener('click', (e) => {
    if (!el.hidden && !el.contains(e.target as Node)) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) hide();
  });
  return (message) => {
    reparent();
    text.textContent = message;
    el.hidden = false;
  };
}
```

  - Update the doc comment to match.
  - In `main.ts`, the call `createInfoPopup(byId('infoPopup'))` stays as it is.
  - If the popup sits inside an open `<dialog>`, Escape also closes that dialog. That's fine, because both should close.

- [ ] **src/styles.css:**
  - Give `.info-popup` `padding: 20px 44px 20px 22px`. The right side leaves room for the ✕.
  - Add:

```css
.info-popup-text {
  margin: 0;
}
.info-popup-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
}
.info-popup-close:active {
  background: var(--pink-soft);
}
```

- [ ] `npm test`, `npm run lint`. Commit: `Info popup stays open until dismissed, with a close button`

(Task 4's FOLLOWUP update comes last. Add these to its phone checklist:
- the "i" and Moderato use the italic score font,
- an info popup stays open and closes with ✕, an outside tap or Escape.)
