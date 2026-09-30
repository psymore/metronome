# Settings-to-Header (Control Hierarchy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project overrides (from `docs/superpowers/FOLLOWUP.md`, standing):** never use a git worktree —
> plain local branch in the main working directory. Never add `Co-Authored-By` or any attribution
> line to a commit. Don't push; report the commit range when done.

**Goal:** Make the main panel read BPM/knob → Tap → Signature/Sound → Settings by moving Settings
out of the panel into the header as a small icon button, and giving Tap a stronger resting glow
than the other panel buttons.

**Architecture:** DOM/CSS-only change. `#settingsBtn` keeps its id, so its click wiring
(`src/ui/settingsDialog.ts:62`, `byId('settingsBtn')`) needs no change. The panel's 3-column grid
(`.controls`, `src/styles.css:814`) stays; the right column just ends up holding Tap alone.
The header's language button style is generalised into a shared `.icon-btn` class that both
header buttons use.

**Tech Stack:** Vite + TypeScript, plain DOM/CSS, no UI framework. Tests are Vitest in a node
environment — there is no DOM test harness, so this plan's verification is manual (dev server +
browser viewport emulation + the user's phone).

**Spec:** No separate spec file. Source: the user's "Metronome ana ekran — kontrol hiyerarşisi
düzenlemesi (v2)" plan (pasted in chat on 2026-09-30), reviewed and narrowed to its Alternative A.
The decisions it left open are settled below.

## Settled decisions

- **Only Alternative A is in scope.** Settings moves to the header, next to the language button.
  Alternatives B and C of the source plan were the same change with different wording. Alternative D
  (a bottom tab bar replacing the panel's side columns) is **out of scope** — revisit only if,
  after A, the user still wants the panel smaller.
- **Settings icon:** a standard gear (the panel's current "sliders" icon doesn't read as
  "settings" without its text label, which the header button won't have).
- **Header button size:** visual size stays 30×30px (same as today's language button, so the
  header doesn't change look), but each header icon button gets an invisible 44×44px hit area via
  `::after`. This also fixes the language button, which is currently only a 30px target.
- **Tap's resting glow:** Tap keeps the stronger glow the square buttons used to have
  (`0 0 4.2px var(--accent-glow)`); Signature/Sound keep the faint one from the pending change.
- Panel square buttons stay 64px on mobile (52px in the existing ≥900px block). No shrinking.

## Global Constraints

- Don't touch the practice timer (`#practiceTimerBar`, `#practiceTimerButtons`): it must stay
  hidden (`is-off`).
- Don't touch canvas code (`#viz`, `#knob`, `src/viz/*`, `src/ui/knob.ts`).
- No new dependencies.
- Every interactive target ≥44×44px hit area on mobile.
- Circle and Line visualiser modes, Signature, Sound, Tap, BPM knob/nudges, Settings and language
  switching must all still work exactly as before.
- Should feel like the same app, not a redesign: reuse existing colors, gradients, radii.

## Review Focus

1. **320px-wide phones:** the header (title + 2 icon buttons + the 168px Circle/Line switch) is
   already tight at 320px; adding a button must not overflow, clip, or wrap. Task 3 measures and
   fixes this.
2. **Turkish UI:** "Metronom" title, Turkish aria-labels. Switching language must not shift the
   header or panel layout.
3. **Language menu anchoring:** `#langMenu` is absolutely positioned inside `.lang-switch`; after
   the markup change it must still open under the globe and not be covered by the Settings
   button's enlarged hit area.
4. **Settings dialog focus return:** closing the Settings dialog should return focus to the
   (moved) Settings button, as it did before. Check with keyboard (Tab/Enter/Esc) on desktop.
5. **Panel vertical balance:** with Tap alone in the right column, the panel's height must not
   change (the left column still sets it) and the knob must stay horizontally centered.

---

### Task 1: Commit the pending glow change and give Tap its stronger glow

**Files:**
- Modify: `src/styles.css` (pending uncommitted diff around lines 845 and 865; `.tap` rule at ~942)

Context: `master` has an uncommitted `src/styles.css` change from an earlier session that dims
`.square-btn`'s resting glow to `0 0 2px var(--accent-idle)` and moves the full glow to `:active`.
It applies to Tap too (Tap is `.square-btn.tap`), which flattens the Tap-over-Signature/Sound
hierarchy. There are also untracked PNG screenshots in the repo root
(`after-glow-fix*.png`, `bar-counter-zoom-teal.png`, `current-app*.png`) — **do not add or delete
them**; they're the user's.

- [ ] **Step 1: Branch and commit the pending change as-is**

```bash
git checkout -b settings-to-header
git add src/styles.css
git commit -m "Dim the resting glow on panel square buttons"
```

Only `src/styles.css` goes into this commit. Run `git status` first and confirm it's the only
modified tracked file.

- [ ] **Step 2: Give Tap the stronger resting glow**

In `src/styles.css`, add a `box-shadow` to the existing `.tap` rule (~line 942):

```css
.tap {
  font-weight: 700;
  letter-spacing: 0.12em;
  font-size: 13px;
  /* A faint tint of the theme color at rest sets TAP apart from the other square buttons,
     which stay plain --text. */
  color: color-mix(in srgb, var(--select) 25%, var(--text));
  /* Tap outranks Signature/Sound in the panel's hierarchy, so it keeps the fuller resting glow
     the other square buttons dropped (see .square-btn). */
  box-shadow: 0 0 4.2px var(--accent-glow);
}
```

`.tap` comes after `.square-btn` in the file with equal specificity, so it wins at rest.
`.tap:active`/`.tap.flash` (~line 953) come later still and keep the pink press ring — don't
change them.

Also update the `.square-btn` comment from the pending change, which will be stale after Task 2:

```css
  /* Faint resting glow: Signature/Sound are supporting controls and shouldn't compete with the
     BPM knob or Tap (which overrides this, see .tap), but need to stay visible as targets. */
  box-shadow: 0 0 2px var(--accent-idle);
```

- [ ] **Step 3: Lint and commit**

Run: `npm run lint` — expected: no errors.

```bash
git add src/styles.css
git commit -m "Keep Tap's fuller resting glow above Signature/Sound"
```

---

### Task 2: Move Settings into the header

**Files:**
- Modify: `index.html:309-321` (title row), `index.html:386-394` (right `.col`)
- Modify: `src/styles.css` (`.title-row` ~414, `.lang-switch` ~419, `.lang-btn*` ~423-449,
  `.label-spacer` ~333, `.col .label-spacer + .square-btn` ~831)
- Modify: `src/i18n/translations.ts:23` and `:188` (remove the now-unused `label.settings`)

**Interfaces:**
- Consumes: `#settingsBtn` id (wired in `src/ui/settingsDialog.ts:62`), `#langBtn` id (wired in
  `src/ui/languageSwitch.ts:6`), i18n key `settings.ariaLabel` (kept).
- Produces: CSS class `.icon-btn` (replaces `.lang-btn`), used by `#langBtn` and `#settingsBtn`.

- [ ] **Step 1: Rename `.lang-btn` to `.icon-btn` and add the 44px hit area**

`.lang-btn` is referenced only in `src/styles.css` and `index.html` (verified by grep). Replace
the four `.lang-btn` rules (~423-449) with:

```css
/* Round header icon button (language, settings). Same subtle accent-tinted border as the panel
   buttons (.square-btn), but no box-shadow at rest — only :active gets one, for the press
   feedback. */
.icon-btn {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--select) 20%, transparent);
  background: linear-gradient(135deg, #3a362c 0%, #211f18 55%, #121108 100%);
  color: var(--pink);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* Invisible 44×44px hit area around the 30px visual button — mobile touch-target minimum
   without making the header's icons visually bigger. */
.icon-btn::after {
  content: "";
  position: absolute;
  inset: -7px;
}
.icon-btn svg {
  width: 16px;
  height: 16px;
  display: block;
}
.icon-btn[aria-expanded="true"] {
  color: var(--select);
  box-shadow: inset 0 0 0 1px var(--select);
}
.icon-btn:active {
  transform: scale(0.92);
  box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.55);
}
```

Keep the original property values exactly — the only additions are `position: relative` and the
`::after` rule. Check that `position: relative` doesn't change where `#langMenu` anchors (it's a
sibling of the button inside `.lang-switch`, which is the positioned ancestor, so it shouldn't).

In `index.html`, change `#langBtn`'s `class="lang-btn"` to `class="icon-btn"`.

- [ ] **Step 2: Add the Settings button to the header**

In `index.html`, inside `.title-row`, directly after the closing `</div>` of `.lang-switch`, add:

```html
          <button type="button" id="settingsBtn" class="icon-btn" data-i18n-aria-label="settings.ariaLabel" aria-label="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="stroke"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
          </button>
```

(Feather "settings" gear, MIT.) `svg.stroke` (`src/styles.css:303`) already gives it
`fill: none; stroke: currentColor; stroke-width: 2`, matching the globe.

Spacing: `.title-row` has `gap: 8px` and `.lang-switch` has `margin-left: 4px`. With 7px hit-area
overhang on each side, the two buttons' invisible hit areas overlap by 6px inside the 8px gap —
that's fine (the visible buttons themselves never overlap). Don't add extra margin unless Task 3's
width check shows room for it.

- [ ] **Step 3: Remove Settings (and the now-useless spacer) from the panel**

In `index.html`, the right `.col` (~386-394) becomes just:

```html
          <div class="col">
            <button type="button" id="tapBtn" class="square-btn tap" data-i18n-aria-label="tap.ariaLabel" aria-label="Tap tempo" data-i18n="tap.label">TAP</button>
          </div>
```

The `.label-spacer` existed only to align Settings with Sound across the two columns; with one
button left it has no job. `.controls` is `align-items: center`, so Tap sits vertically centered
beside the knob, and `.col`'s fixed `width: 64px` keeps the grid symmetric so the knob stays
centered.

In `src/styles.css`, delete the now-dead rules:
- the `.label-spacer { height: 11px; }` rule and its comment (~331-335)
- the `.col .label-spacer + .square-btn` selector (~831) — keep `.col .label + .square-btn`, so the
  rule becomes:

```css
.col .label + .square-btn {
  margin-top: 10px;
}
```

In `src/i18n/translations.ts`, delete the `'label.settings'` entries (English ~line 23, Turkish
~line 188). Keep `'settings.ariaLabel'`. Then grep to confirm nothing else uses it:

Run: `grep -rn "label.settings\|label-spacer\|lang-btn" src index.html tests`
Expected: no output.

- [ ] **Step 4: Tests, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: all pass (no test covers this DOM, but translations may have a key-parity test — if one
fails, it's because only one language's `label.settings` was removed).

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css src/i18n/translations.ts
git commit -m "Move Settings from the panel into the header as a gear icon button"
```

---

### Task 3: Verify across widths and fix header overflow

**Files:**
- Modify (only if Step 2 finds overflow): `src/styles.css` (new narrow-width rule near the `.seg`
  rule at ~480)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` (http://localhost:5173). Use Playwright MCP or browser devtools device
emulation. If Playwright reports "Browser is already in use", tell the user and ask them to check
on their phone via the dev server's Network URL instead.

- [ ] **Step 2: Measure the header at 320, 360, 390, 412px widths, in both languages**

At each width, run in the console:

```js
const bar = document.querySelector('.topbar');
const seg = document.querySelector('.seg');
({ overflow: bar.scrollWidth > bar.clientWidth,
   segRight: seg.getBoundingClientRect().right,
   limit: window.innerWidth - 16 });
```

Expected: `overflow: false` and `segRight <= limit`, and the title, globe, gear and Circle/Line
switch sit on one line without touching.

If it fails at 320px (likely: the title at 21px + two icons + the fixed 168px switch is ~330px
against 288px of content width), add below the `.seg-btn` rule:

```css
/* Narrow phones (320–359px): the header has to fit the title, the language and settings icon
   buttons, and the Circle/Line switch on one line. */
@media (max-width: 359px) {
  .seg {
    width: 136px;
  }
  .seg-btn {
    padding: 6px 8px;
  }
}
```

The thumb (`.seg-thumb`) is sized in percent, so it follows the narrower track — confirm it still
lines up under the selected label in both states. Re-measure. If it still overflows, report the
measured numbers to the user instead of shrinking the title or icons further.

- [ ] **Step 3: Walk the acceptance checks at 390px and at ≥900px desktop**

- Gear opens Settings. Esc closes it and focus returns to the gear (Tab-navigate to check).
- Globe opens the language menu under itself. Picking Türkçe relabels everything and moves nothing.
- Tapping ~6px outside the visible gear/globe circle still hits it (the 44px hit area).
- Signature, Sound, Tap, knob drag, knob-center start/stop and −/+ nudges all work.
- Circle and Line modes both render and animate while playing.
- The practice timer bar and its buttons are nowhere visible.
- The panel's height is unchanged vs. `master` (compare `document.querySelector('.controls')
  .getBoundingClientRect().height` against a `master` checkout, or a screenshot) and the knob is
  horizontally centered.
- At rest, Tap's glow is visibly stronger than Signature's/Sound's.
- At ≥900px (the `@media (min-width: 900px)` block, `.col`/`.square-btn` 52px), Tap still sits
  centered in its column and nothing overlaps.

- [ ] **Step 4: Commit (only if Step 2 needed the CSS fix)**

```bash
git add src/styles.css
git commit -m "Fit the header on 320px phones with the added Settings button"
```

- [ ] **Step 5: Update FOLLOWUP and hand back**

Overwrite `docs/superpowers/FOLLOWUP.md` per `CLAUDE.md`'s rule (replace, don't append): note that
branch `settings-to-header` holds this work, unmerged and unpushed, awaiting the user's phone
check and review; Alternative D (bottom tab bar) stays unscheduled. Commit it, then report the
commit range (`git log --oneline master..settings-to-header`) to the user.
