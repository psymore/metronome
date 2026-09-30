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
