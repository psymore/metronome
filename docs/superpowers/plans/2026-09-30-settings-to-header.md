# Control Hierarchy: Panel Regroup + Side Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project overrides (from `docs/superpowers/FOLLOWUP.md`, standing):** never use a git worktree —
> plain local branch in the main working directory. Never add `Co-Authored-By` or any attribution
> line to a commit. Don't push; report the commit range when done.

**Goal:** Main screen reads BPM/knob → Tap → Signature/Sound → Timer, with everything rarely used
behind a ☰ side menu. Concretely:
- The panel gets two balanced columns: **left = Timer + Tap** (time/action, under the running
  timer's ⏸⏹✕ buttons), **right = Signature + Sound** (musical structure, under the Bar pill).
- The Settings dialog is dissolved:
  - Beats → Signature dialog.
  - Volume + Vibrate → Sound dialog.
  - Practice timer → its own Timer dialog.
  - Theme / Beat sphere / 2.5D knob / Visual sync offset / Reset / Language → a left side drawer
    opened from a ☰ button in the header.

**Architecture:** Plain DOM/CSS/TS, no framework.
- The drawer is a `<dialog>` opened with `showModal()`, which gives Android Back-to-close, focus
  trapping and Esc for free (same as the existing `.sheet` dialogs).
- `src/ui/settingsDialog.ts` and `src/ui/languageSwitch.ts` are replaced by
  `src/ui/practiceTimerDialog.ts` and `src/ui/menuDrawer.ts`. The Volume/Vibrate and Beats wiring
  moves into `soundDialog.ts` / `signatureDialog.ts`.
- No `Settings` state changes: every field keeps its key; only where its control lives changes.

**Tech Stack:** Vite + TypeScript, Vitest (node env, no DOM harness — verification of this plan is
manual: dev server + viewport emulation + the user's phone).

**Spec:** No spec file. Source: chat with the user on 2026-09-30. The layout was agreed as:

```
 [⏸ ⏹ ✕]                    [Bar –]
 [ ⏱ ]                       [ 4/4 ]
 TIMER        KNOB           SIGNATURE
 [ TAP ]                     [ 🔊 ]
                             SOUND
```

## Status of earlier tasks (already on branch `settings-to-header`)

- [x] **Task 1** — `6638542` dim resting glow on square buttons, `87c8623` Tap keeps fuller glow.
- [x] **Task 2** — `8127427` Settings as a gear in the header. **Superseded by Task 5** (the gear
  and globe both leave the header for the ☰ drawer).
  - **Known bug from this commit, fixed in Task 5:** it renamed `.lang-btn` to `.icon-btn`, but
    `.icon-btn` already existed (`src/styles.css` ~1181) as the ✕ close button on every dialog.
    The two rule sets now merge:
    - The header buttons pick up the close button's 34px size and shadows.
    - Every dialog's ✕ picks up the header's pink color, the 44px `::after` hit area and the svg
      sizing.
- The old Task 3 (header width check) is folded into Task 6.
- There's an **uncommitted** `src/styles.css` change on the branch: `.title` `font-size: 21px →
  14.7px`. The user saw it on their phone and approved it. It's committed in Task 3 Step 1.

## Global Constraints

- The practice timer's behavior must stay exactly as it is; only where its settings live changes.
  Its running controls (`#practiceTimerBar`, `#practiceTimerButtons`) stay hidden (`is-off`) until
  a timer is started.
- Don't touch canvas drawing code (`src/viz/*`, `src/ui/knob.ts`). The node-style previews move
  along with their existing code.
- No new dependencies. No changes to `src/state/settings.ts` field names or defaults.
- Every interactive target ≥44×44px hit area on mobile.
- The drawer opens **only** from the ☰ button — no edge-swipe to open. On Android gesture
  navigation, a swipe in from either screen edge is the system Back gesture, and in the Play
  Store build (TWA) it would leave the app.
- Swipe-left *on the open drawer* closes it, and so do tapping the backdrop, Esc and Android Back.
- Every visible string goes through i18n (English + Turkish); `tests/i18n/i18n.test.ts` checks key
  parity between the two languages.
- Same look as the rest of the app: reuse the existing panel gradient
  (`linear-gradient(135deg, #3a362c 0%, #211f18 55%, #121108 100%)`), `.field`, `.chip`,
  `.sheet-head`, `.sheet-sub`, `.switch`, `--accent-idle` border. Not a redesign.

## Review Focus

1. **Moved controls still sync both ways.** Changing Volume / Vibrate / Beats / Theme / Language /
   offset from its new home must update everywhere else. The beat row in the Signature dialog and
   the beats on the visualiser stay in lockstep, and the language switch relabels every dialog,
   including closed ones.
2. **Signature dialog in Polyrhythm mode.** The moved Beats field must hide with the other
   standard-only blocks (`[data-standard-block]`, toggled in `src/ui/polyrhythmDialog.ts:122`).
3. **Swipe-to-close vs. sliders.** Dragging the Visual sync offset slider left inside the drawer
   must move the slider, not close the drawer.
4. **Backdrop-click vs. drawer padding.** `closeOnBackdropClick` closes when
   `event.target === dialog`. Clicks on the dialog's own padding also match that check, so the
   drawer puts all its content and padding in an inner `.drawer-body`, and the `<dialog>` itself
   has `padding: 0`.
5. **Panel alignment.** The Timer/Tap column must have the same total height as the
   Signature/Sound column (Tap has no text label, so it needs the 11px `.label-spacer` back), or
   `.controls { align-items: center }` offsets the columns and the buttons stop lining up across.

---

### Task 3: Panel regroup + Timer button and dialog

**Files:**
- Create: `src/ui/practiceTimerDialog.ts`
- Modify: `index.html` (panel `.col`s ~365-390; new `#practiceTimerDialog`; remove the practice
  timer field from `#settingsDialog`)
- Modify: `src/ui/settingsDialog.ts` (remove the practice-timer code), `src/main.ts` (~504-513)
- Modify: `src/styles.css` (restore `.label-spacer`), `src/i18n/translations.ts` (`label.timer`)

**Interfaces:**
- Produces: `mountPracticeTimerDialog({ store, onStartPractice }: PracticeTimerDialogDeps): void`
  in `src/ui/practiceTimerDialog.ts`. It is opened by `#timerBtn`.
- Consumes (unchanged): `onStartPractice` callback currently passed to `mountSettingsDialog` in
  `src/main.ts:506-512`.

- [ ] **Step 1: Commit the pending title change**

`git status` must show only `src/styles.css` modified (plus the user's untracked PNGs — never add
or delete those).

```bash
git add src/styles.css
git commit -m "Shrink the header title"
```

- [ ] **Step 2: Regroup the panel columns**

In `index.html`, the first `.col` (currently Signature + Sound) and the last `.col` (currently Tap
alone) become:

```html
          <div class="col">
            <button type="button" id="timerBtn" class="square-btn" data-i18n-aria-label="practiceTimer.label" aria-label="Practice timer">
              <svg viewBox="0 0 24 24" aria-hidden="true" class="stroke"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2h5M12 2v3" /></svg>
            </button>
            <span class="label" data-i18n="label.timer">Timer</span>
            <button type="button" id="tapBtn" class="square-btn tap" data-i18n-aria-label="tap.ariaLabel" aria-label="Tap tempo" data-i18n="tap.label">TAP</button>
            <span class="label-spacer" aria-hidden="true"></span>
          </div>
```

…and the last `.col` gets the existing Signature and Sound markup **moved verbatim**, including
`#signatureBtn`'s inner spans and `#subdivisionBadge`, both `.label` spans, and `#soundBtn`'s svg.
Don't retype them.

In `src/styles.css`, restore the spacer (removed in `8127427`) right after `.label-sm`:

```css
/* Invisible placeholder the same height as .label under TAP (which has its text on the button
   itself), so the Timer/Tap column is exactly as tall as the Signature/Sound column and
   .controls' align-items: center keeps the buttons of both columns on the same rows. */
.label-spacer {
  height: 11px;
}
```

…and put the selector back on the margin rule (~831):

```css
.col .label + .square-btn,
.col .label-spacer + .square-btn {
  margin-top: 10px;
}
```

(The second selector never matches today — the spacer is last — but keeps the rule symmetric if
the order is ever swapped.)

- [ ] **Step 3: Add the i18n key**

In `src/i18n/translations.ts`, next to `label.sound`:
- English: `'label.timer': 'Timer',`
- Turkish: `'label.timer': 'Süre',`

"Zamanlayıcı" is too wide for the 64px column even at the 9px fallback size that
`src/ui/labelFit.ts` shrinks labels to.

- [ ] **Step 4: Move the practice-timer markup into its own dialog**

In `index.html`, cut the whole practice-timer `<div class="field">` out of `#settingsDialog`. It
starts with `<span><span data-i18n="practiceTimer.label">` and ends after its `.sub-head` with the
info button. Add this new dialog right after `#barCounterDialog`, pasting the cut `.field` where
marked:

```html
    <dialog id="practiceTimerDialog" class="sheet" aria-labelledby="practiceTimerTitle">
      <form method="dialog" class="sheet-head">
        <h2 id="practiceTimerTitle" data-i18n="practiceTimer.label">Practice timer</h2>
        <button type="submit" class="icon-btn" data-i18n-aria-label="close.ariaLabel" aria-label="Close">✕</button>
      </form>
      <!-- the practice-timer .field cut from #settingsDialog goes here, unchanged -->
    </dialog>
```

- [ ] **Step 5: Create `src/ui/practiceTimerDialog.ts`**

Move the practice-timer code out of `src/ui/settingsDialog.ts` as-is. That's the element lookups,
`PRACTICE_STEP_SECONDS`, `practiceConfirm`, `setPracticeSeconds`, the input and hold-repeat
listeners, the Apply handler, and the four practice lines of `render`.

```ts
import { format, t } from '../i18n/i18n';
import { formatTimeLeft } from '../state/practiceTimer';
import { clampPracticeSeconds, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { createConfirmGate } from './confirmGate';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';

export interface PracticeTimerDialogDeps {
  store: Store<Settings>;
  /** Called after the user confirms starting a practice session from the dialog. */
  onStartPractice: () => void;
}

/** Seconds a single tap (or hold-repeat tick) of the practice timer's +/- buttons moves by. */
const PRACTICE_STEP_SECONDS = 15;

export function mountPracticeTimerDialog({
  store,
  onStartPractice,
}: PracticeTimerDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('practiceTimerDialog');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceSecondsInput = byId<HTMLInputElement>('practiceSecondsInput');
  const practiceTimeValue = byId('practiceTimeValue');
  const practiceTimeDown = byId<HTMLButtonElement>('practiceTimeDown');
  const practiceTimeUp = byId<HTMLButtonElement>('practiceTimeUp');
  const practiceTimerApply = byId<HTMLButtonElement>('practiceTimerApply');

  const practiceConfirm = createConfirmGate(practiceTimerApply, {
    idleText: () => t('practiceTimer.apply'),
    armedText: () =>
      format('practiceTimer.confirm', { time: formatTimeLeft(0, store.get().practiceSeconds) }),
  });

  byId('timerBtn').addEventListener('click', () => {
    practiceConfirm.disarm();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  // …setPracticeSeconds, the two input listeners, the two mountHoldRepeat calls and the
  // practiceTimerApply click handler, moved verbatim from settingsDialog.ts…

  const render = (s: Settings) => {
    practiceMinutesInput.value = String(Math.floor(s.practiceSeconds / 60));
    practiceSecondsInput.value = String(s.practiceSeconds % 60);
    practiceTimeValue.textContent =
      s.practiceSeconds > 0 ? formatTimeLeft(0, s.practiceSeconds) : t('practiceTimer.off');
    practiceTimerApply.disabled = s.practiceSeconds <= 0;
  };
  render(store.get());
  store.subscribe(render);
}
```

The `// …` comment stands for code that already exists — **move it**, don't rewrite it. In
`settingsDialog.ts`, delete everything moved plus the now-unused imports (`format`,
`formatTimeLeft`, `clampPracticeSeconds`, `mountHoldRepeat`). Also drop the `onStartPractice`
field from `SettingsDialogDeps` and remove `practiceConfirm.disarm();` from the `settingsBtn`
click handler.

- [ ] **Step 6: Wire it in `src/main.ts`**

Replace the `mountSettingsDialog({ store, onStartPractice: … })` call (~504-513) with:

```ts
mountPracticeTimerDialog({
  store,
  onStartPractice: () => {
    if (engine.running) {
      startPracticeTimer(store.get().practiceSeconds);
    } else {
      void transport.toggle();
    }
  },
});
mountSettingsDialog({ store });
```

…and add `import { mountPracticeTimerDialog } from './ui/practiceTimerDialog';` in alphabetical
position among the `./ui/*` imports (Biome enforces import order — `npm run format` fixes it).

- [ ] **Step 7: Test, lint, build, commit**

Run: `npm test && npm run lint && npm run build` — expected: all pass.

Quick manual check (`npm run dev`):
- Timer opens its dialog; setting 0:30 + Start (two taps) starts the metronome and the timer.
- The ⏸⏹✕ buttons appear above the panel's top-left.
- The Timer/Tap buttons line up row-for-row with Signature/Sound.

```bash
git add index.html src/styles.css src/i18n/translations.ts src/main.ts src/ui/settingsDialog.ts src/ui/practiceTimerDialog.ts
git commit -m "Regroup the panel (Timer+Tap left, Signature+Sound right) with its own Timer dialog"
```

---

### Task 4: Beats into the Signature dialog, Volume + Vibrate into the Sound dialog

**Files:**
- Modify: `index.html` (`#settingsDialog`, `#signatureDialog`, `#soundDialog`)
- Modify: `src/ui/settingsDialog.ts`, `src/ui/signatureDialog.ts`, `src/ui/soundDialog.ts`

**Interfaces:**
- Consumes: `#beatRow` (rendered and clicked in `src/ui/controls.ts:30,70,112` by id — the id
  stays, so `controls.ts` needs no change), `#beatsClickableToggle`, `#volumeInput`,
  `#volumeValue`, `#hapticsToggle`.
- Produces: nothing new; ids are unchanged.

- [ ] **Step 1: Move the Beats field to the Signature dialog**

In `index.html`, cut the Beats `<div class="field">` from `#settingsDialog`. It's the one
containing `#beatsClickableToggle` and `#beatRow`. Paste it into `#signatureDialog` directly after
`<p … id="subdivisionCompoundHint" …>` and before `<div id="polyBlock" …>`. Add
`data-standard-block` to its outer div so Polyrhythm mode hides it:

```html
      <div class="field" data-standard-block>
```

`src/ui/polyrhythmDialog.ts:27` collects `[data-standard-block]` once at mount from static HTML,
so no JS change is needed there.

In `src/ui/settingsDialog.ts`, delete `beatsClickableToggle`, `beatRow`, their click handler and
their two `render` lines. Add the same code to `src/ui/signatureDialog.ts`:

```ts
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  beatsClickableToggle.addEventListener('click', () => {
    store.set({ beatsClickable: !store.get().beatsClickable });
  });
```

…and in `signatureDialog.ts`'s existing store-subscribed render function (find it with `grep -n
"subscribe" src/ui/signatureDialog.ts`) add:

```ts
    beatsClickableToggle.setAttribute('aria-checked', String(s.beatsClickable));
    beatRow.classList.toggle('dim', !s.beatsClickable);
```

- [ ] **Step 2: Move Volume and Vibrate to the Sound dialog**

In `index.html`:
- Cut the Volume `<label class="field">` (the one containing `#volumeValue` and `#volumeInput`)
  from `#settingsDialog`. Paste it into `#soundDialog` right after its `<form class="sheet-head">`,
  as the first field. It's the master level the per-beat sliders below it scale.
- Cut the "Vibrate on beat" `<div class="field">` (containing `#hapticsToggle`). Paste it into
  `#soundDialog` right before `<div id="dropZone" …>`.

In `src/ui/settingsDialog.ts`, delete `volumeInput`, `volumeValue`, `hapticsToggle`, their
listeners and their `render` lines. Add the same code to `src/ui/soundDialog.ts`, inside
`mountSoundDialog`, after the `mountGainSlider(…)` calls:

```ts
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId<HTMLInputElement>('volumeValue');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
    updateRangeFill(volumeInput);
  });
  volumeValue.addEventListener('input', () => {
    if (volumeValue.value === '') return;
    const percent = Math.min(100, Math.max(0, Number(volumeValue.value)));
    store.set({ volume: percent / 100 });
  });
  hapticsToggle.addEventListener('click', () => {
    store.set({ haptics: !store.get().haptics });
  });
  const renderVolumeAndHaptics = (s: Settings): void => {
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    volumeValue.value = String(percent);
    updateRangeFill(volumeInput);
    hapticsToggle.setAttribute('aria-checked', String(s.haptics));
  };
  renderVolumeAndHaptics(store.get());
  store.subscribe(renderVolumeAndHaptics);
```

This is a separate subscription on purpose. The dialog's existing
`store.subscribe((s, prev) => …)` only re-renders on sound/gain changes, and folding these into
its if/else chain would be easy to get wrong.

Also update the stale doc comment on `mountGainSlider` (~line 190): "same pattern the app already
uses for Volume/Visual sync offset in the Settings dialog" → "same pattern as the Volume slider
above and Visual sync offset in the side menu".

- [ ] **Step 3: Test, lint, build, commit**

Run: `npm test && npm run lint && npm run build` — expected: all pass.

Manual check:
- Signature dialog: tapping a beat in its beat row cycles it, and the visualiser follows.
- Switching to Polyrhythm hides the Beats field.
- Sound dialog: the Volume slider changes loudness while playing, and Vibrate toggles.

```bash
git add index.html src/ui/settingsDialog.ts src/ui/signatureDialog.ts src/ui/soundDialog.ts
git commit -m "Move Beats into the Signature dialog and Volume/Vibrate into the Sound dialog"
```

---

### Task 5: ☰ side menu replaces the Settings dialog, the gear and the globe

**Files:**
- Create: `src/ui/menuDrawer.ts`
- Delete: `src/ui/settingsDialog.ts`, `src/ui/languageSwitch.ts`
- Modify: `index.html` (header `.title-row`; `#settingsDialog` → `#menuDrawer`)
- Modify: `src/styles.css` (header button class; `.lang-switch`/`.lang-menu`/`.lang-option` rules
  removed; new `.drawer*` rules), `src/main.ts`, `src/i18n/translations.ts`

**Interfaces:**
- Produces: `mountMenuDrawer({ store }: { store: Store<Settings> }): void` in
  `src/ui/menuDrawer.ts`, opened by `#menuBtn`.
- Consumes: everything `settingsDialog.ts` still holds after Tasks 3-4 (theme, node style +
  previews, 2.5D, sync offset, reset), plus the language options from `languageSwitch.ts`.

- [ ] **Step 1: Header — ☰ button, and fix the `.icon-btn` collision**

In `index.html`, `.title-row` becomes the menu button followed by the title. Delete the whole
`.lang-switch` div (globe + `#langMenu`) and the header `#settingsBtn`:

```html
        <div class="title-row">
          <button type="button" id="menuBtn" class="header-btn" aria-haspopup="dialog" aria-controls="menuDrawer" data-i18n-aria-label="menu.ariaLabel" aria-label="Menu">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="stroke"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <h1 class="title">
            <button type="button" id="titleBtn" class="title-btn" data-i18n="app.title" aria-label="Preview the loading screen">Metronome</button>
          </h1>
        </div>
```

In `src/styles.css`, in the header block (~414-452), which `8127427` renamed from `.lang-btn`:
- Rename every `.icon-btn` selector to `.header-btn`: the base rule, `::after`, `svg`,
  `[aria-expanded="true"]` and `:active`.
- Fix the comment to "Round header icon button (☰ menu)".
- Delete the `.lang-switch` rule, and any `.lang-menu` / `.lang-option` rules
  (`grep -n "lang-menu\|lang-option" src/styles.css`).

**Leave the other `.icon-btn` rule (~1181, the dialogs' ✕) exactly as it was before `8127427`.**
Then:

Run: `grep -n "icon-btn" src/styles.css`
Expected: only the ~1181 `.icon-btn` and `.icon-btn:active` rules, plus the unrelated
`.practice-icon-btn*` rules.

- [ ] **Step 2: Drawer markup**

In `index.html`, replace the whole `<dialog id="settingsDialog" …>…</dialog>` (after Tasks 3-4 it
only holds Theme, Beat sphere, 2.5D knob, Visual sync offset and Reset). Move those five blocks
verbatim into the marked places:

```html
    <dialog id="menuDrawer" class="drawer" aria-labelledby="menuTitle">
      <div class="drawer-body">
        <form method="dialog" class="sheet-head">
          <h2 id="menuTitle" data-i18n="menu.title">Menu</h2>
          <button type="submit" class="icon-btn" data-i18n-aria-label="close.ariaLabel" aria-label="Close">✕</button>
        </form>

        <h3 class="sheet-sub" data-i18n="menu.language">Language</h3>
        <div class="field">
          <div class="unit-row" role="radiogroup" data-i18n-aria-label="language.ariaLabel" aria-label="Change language">
            <button type="button" role="radio" class="chip" data-lang="en" aria-checked="true">English</button>
            <button type="button" role="radio" class="chip" data-lang="tr" aria-checked="false">Türkçe</button>
          </div>
        </div>

        <h3 class="sheet-sub" data-i18n="menu.appearance">Appearance</h3>
        <!-- Theme .field, Beat sphere .field, 2.5D knob .field — moved verbatim -->

        <h3 class="sheet-sub" data-i18n="menu.advanced">Advanced</h3>
        <!-- Visual sync offset <label class="field">, then #resetBtn — moved verbatim -->

        <h3 class="sheet-sub" data-i18n="menu.about">About</h3>
        <a class="drawer-link" href="privacy-policy.html" target="_blank" rel="noopener" data-i18n="menu.privacyPolicy">Privacy policy</a>
      </div>
    </dialog>
```

Notes:
- Language names are endonyms ("English", "Türkçe") and deliberately not translated. The old
  `language.english`/`language.turkish` keys go away with `#langMenu`. Delete them from both
  languages if `grep -rn "language.english\|language.turkish" index.html src` finds no other use.
- `privacy-policy.html` is relative on purpose: `public/privacy-policy.html` is served next to
  `index.html` under both the Vercel base (`/`) and the GitHub Pages base (`/metronome/`).

- [ ] **Step 3: Drawer CSS**

Add near the `.sheet` rules (~1126) in `src/styles.css`:

```css
/* Left side menu (☰). A modal <dialog> like .sheet, so focus trapping, Esc and Android Back all
   close it for free. The dialog itself has no padding: closeOnBackdropClick() closes on clicks
   whose target is the <dialog> element, and padding on the dialog would count as that too — all
   content and spacing live in .drawer-body instead. Opening is button-only (no edge swipe):
   edge swipes are Android's system Back gesture. */
.drawer {
  position: fixed;
  inset: 0 auto 0 0;
  margin: 0;
  width: min(86vw, 340px);
  max-width: none;
  height: 100dvh;
  max-height: none;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--accent-idle);
  border-radius: 0 12px 12px 0;
  background: linear-gradient(135deg, #3a362c 0%, #211f18 55%, #121108 100%);
  color: var(--text);
  box-shadow: 20px 0 60px rgb(0 0 0 / 0.6);
  overflow: hidden;
  /* Vertical scrolling stays native; horizontal moves reach menuDrawer.ts's swipe-to-close. */
  touch-action: pan-y;
}
.drawer[open] {
  animation: drawer-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes drawer-in {
  from {
    transform: translateX(-100%);
  }
}
.drawer::backdrop {
  background: rgb(0 0 0 / 0.6);
}
.drawer-body {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: max(18px, env(safe-area-inset-top)) 18px max(22px, env(safe-area-inset-bottom));
}
.drawer-link {
  display: block;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--panel-lo);
  color: var(--text);
  text-decoration: none;
}
```

The existing `@media (prefers-reduced-motion: reduce)` block already turns off all animations,
including `drawer-in`.

- [ ] **Step 4: `src/ui/menuDrawer.ts`**

Rename `src/ui/settingsDialog.ts` → `src/ui/menuDrawer.ts` with `git mv`, so history follows. Then:

1. Rename `mountSettingsDialog` → `mountMenuDrawer`; delete the `SettingsDialogDeps` interface
   and use the signature `mountMenuDrawer({ store }: { store: Store<Settings> }): void`.
2. `const dialog = byId<HTMLDialogElement>('settingsDialog');` →
   `const drawer = byId<HTMLDialogElement>('menuDrawer');`. Rename every later `dialog` use to
   `drawer`, including the theme/node-style `querySelectorAll` calls and `readTheme(dialog)` →
   `readTheme(drawer)`.
3. Replace the `byId('settingsBtn')` click handler with:

```ts
  byId('menuBtn').addEventListener('click', () => {
    resetConfirm.disarm();
    drawer.showModal();
  });
  closeOnBackdropClick(drawer);
```

   Move the `resetConfirm` declaration above this handler so it's defined before use.
4. Add the language options (replacing `languageSwitch.ts`) next to the theme button loop:

```ts
  const languageButtons = Array.from(
    drawer.querySelectorAll<HTMLButtonElement>('[data-lang]'),
  );
  for (const button of languageButtons) {
    button.addEventListener('click', () => {
      const language = button.dataset.lang;
      if (isLanguage(language)) store.set({ language });
    });
  }
```

   …and in `render`:

```ts
    for (const button of languageButtons) {
      button.setAttribute('aria-checked', String(button.dataset.lang === s.language));
    }
```

   Add `isLanguage` to the `../state/settings` import.
5. Swipe left on the open drawer to close it. Add it after `closeOnBackdropClick(drawer)`:

```ts
  // Swipe left on the open drawer closes it (the drawer slides in from the left). Ignored when
  // the gesture starts on a range input, so dragging the sync-offset slider left still moves the
  // slider. Opening stays button-only — see the .drawer note in styles.css.
  const SWIPE_CLOSE_PX = 60;
  let swipeStart: { x: number; y: number } | null = null;
  drawer.addEventListener('pointerdown', (e) => {
    const onSlider = (e.target as HTMLElement).closest('input[type="range"]');
    swipeStart = onSlider ? null : { x: e.clientX, y: e.clientY };
  });
  drawer.addEventListener('pointerup', (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    swipeStart = null;
    if (dx < -SWIPE_CLOSE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) drawer.close();
  });
  drawer.addEventListener('pointercancel', () => {
    swipeStart = null;
  });
```

Then delete `src/ui/languageSwitch.ts` (`git rm`).

- [ ] **Step 5: `src/main.ts` and i18n**

In `src/main.ts`:
- Replace `mountSettingsDialog({ store });` with `mountMenuDrawer({ store });`.
- Delete `mountLanguageSwitch({ store });`.
- Fix the imports: remove `./ui/settingsDialog` and `./ui/languageSwitch`, add
  `import { mountMenuDrawer } from './ui/menuDrawer';`, then run `npm run format` for import order.

In `src/i18n/translations.ts`, add to **both** languages:

| key | English | Turkish |
|---|---|---|
| `menu.ariaLabel` | `Menu` | `Menü` |
| `menu.title` | `Menu` | `Menü` |
| `menu.language` | `Language` | `Dil` |
| `menu.appearance` | `Appearance` | `Görünüm` |
| `menu.advanced` | `Advanced` | `Gelişmiş` |
| `menu.about` | `About` | `Hakkında` |
| `menu.privacyPolicy` | `Privacy policy` | `Gizlilik politikası` |

Delete from both: `settings.ariaLabel` and `settingsDialog.title`, plus `language.english` /
`language.turkish` if Step 2 found them unused. Then:

Run: `grep -rn "settingsDialog\|settingsBtn\|langBtn\|langMenu\|lang-option\|languageSwitch\|settings.ariaLabel" src index.html tests`
Expected: no output.

- [ ] **Step 6: Test, lint, build, commit**

Run: `npm test && npm run lint && npm run build` — expected: all pass.

```bash
git add -A src index.html
git status   # confirm the user's PNGs are NOT staged; unstage them if they are
git commit -m "Replace the Settings dialog, gear and globe with a ☰ side menu"
```

---

### Task 6: Verify on real widths, then hand back

**Files:** only `src/styles.css` if a fix is needed; `docs/superpowers/FOLLOWUP.md`.

- [ ] **Step 1: Dev server and viewport**

Run `npm run dev` and use Playwright MCP or devtools device emulation. If Playwright reports
"Browser is already in use", tell the user and ask them to check on their phone via the dev
server's Network URL instead.

- [ ] **Step 2: Header fits at 320 / 360 / 390 / 412px, in English and Turkish**

```js
const bar = document.querySelector('.topbar');
const seg = document.querySelector('.seg');
({ overflow: bar.scrollWidth > bar.clientWidth,
   segRight: seg.getBoundingClientRect().right,
   limit: window.innerWidth - 16 });
```

Expected: `overflow: false` and `segRight <= limit`. With the globe and gear gone and the title at
14.7px, this should pass without changes. If it doesn't, report the numbers to the user rather
than shrinking things further.

- [ ] **Step 3: Acceptance walkthrough at 390px and at ≥900px desktop**

- ☰ opens the drawer sliding in from the left. Each of these closes it:
  - ✕
  - a tap on the dark backdrop
  - Esc
  - a left swipe on the drawer
  - the phone's Back gesture (ask the user to check this one on the phone)
- Dragging Visual sync offset left inside the drawer moves the slider and does not close the
  drawer.
- Tapping a field's padding inside the drawer does not close it.
- Language: Türkçe relabels the header, panel labels, every dialog and the drawer, without layout
  jumps. English switches back.
- Theme, Beat sphere (previews still paint and flash on tap), 2.5D knob and sync offset all apply
  live. Reset needs two taps.
- Privacy policy link opens the policy.
- Panel:
  - Timer/Tap on the left, Signature/Sound on the right.
  - Buttons in the two columns line up row-for-row, and the knob is centered.
  - Tap's resting glow is stronger than the other three.
  - At ≥900px (52px buttons) the columns still line up.
- Timer: dialog → set time → Start (two taps) → ⏸⏹✕ appear top-left above the panel without
  covering the Timer button. Pause, stop and ✕ behave as before.
- Signature dialog: Beats row is under Subdivision and hides in Polyrhythm mode.
- Sound dialog: Volume on top, Vibrate above the drop zone. Both work.
- Every dialog's ✕ looks as it did on `master` (round 34px, no pink tint). This confirms the
  `.icon-btn` collision fix.
- Circle and Line modes both render and animate while playing.

- [ ] **Step 4: Commit any fix, update FOLLOWUP, hand back**

If Step 2 or 3 needed a CSS fix, commit it with a message naming what it fixed.

Overwrite `docs/superpowers/FOLLOWUP.md` per `CLAUDE.md` (replace, don't append):
- Branch `settings-to-header` holds this work, unmerged and unpushed, awaiting the user's phone
  check and a review.
- The Settings dialog no longer exists: list where each of its controls went.
- A bottom tab bar is not planned.

Commit it, then report `git log --oneline master..settings-to-header` to the user.
