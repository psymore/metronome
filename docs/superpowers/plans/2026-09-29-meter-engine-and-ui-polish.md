# Meter-aware pulse, accent profiles, and UI polish — implementation plan

> **For the executor (Sonnet 5):** tasks are independent unless a task says otherwise. Do them
> in order anyway: Task 1 changes types other tasks read. One commit per task. Run `npm test`,
> `npm run lint`, `npm run build` at the end of each task that touches TypeScript. CSS-only tasks
> need a visual check in `npm run dev` at 360px and 412px width (Chrome device toolbar) instead.
> Read `CLAUDE.md` first — especially "Rules that are easy to break".

## What already exists — do not rebuild it

- `Subdivision` (1/2/3/4 = off/8ths/triplets/16ths) in `settings.ts`, scheduled by
  `Scheduler.tick()` → `onSubdivision` → `AudioEngine.playSubdivision()` (normal sound, gain 0.4).
- `isCompoundMeter(beatsPerBar, beatUnit)` and `compoundAccentLevels()` in `settings.ts`; the
  signature dialog's presets already apply group accents for 6/8, 9/8, 12/8.
- Per-beat levels `accent | normal | mute`, tap-to-cycle on the visualiser and the Settings beat row.

What is **missing** and is this plan's job: the BPM does not follow the meter (6/8 at 60 BPM plays
six clicks at 60/min instead of two dotted-quarter beats with three eighths each), there is no
middle accent level, and a batch of UI requests.

## Global decisions (settled with the user — don't re-open)

- **BPM means the felt beat.** Simple meters (x/4, x/2, and non-compound x/8 like 5/8, 7/8):
  unchanged — one pulse per written beat at BPM. Compound meters (`isCompoundMeter` true: 6/8,
  9/8, 12/8, …): BPM is the **dotted quarter**, each pulse (visualiser node) is an eighth, so pulse
  duration = `60 / bpm / 3`.
- In a compound meter the eighths *are* the subdivision, so the Subdivision setting is ignored
  (scheduled as 1) and its chips are disabled with a hint. The stored value is kept, so going
  back to 4/4 restores it.
- A new beat level **`medium`** sits between normal and accent. Tap cycle becomes
  `mute → normal → medium → accent → mute`.
- **One font: Inter** everywhere (DOM and canvas). Roboto Mono and the serif stack go away.
- All numeric +/- pickers inside dialogs use the practice-timer format (value box on top, round
  −/+ buttons below). Only the main panel's BPM nudges stay metallic.

---

## Task 1: `medium` beat level + accent profiles

**Files:** `src/state/settings.ts`, `src/engine/audioEngine.ts`, `src/engine/polyScheduler.ts`
(type only), `src/viz/drawNode.ts`, `src/viz/nodeStyleKit.ts`, `src/viz/polyrhythm.ts`,
`src/ui/settingsDialog.ts`, `src/main.ts`, `src/i18n/translations.ts`, `src/styles.css`, tests.

1. `BeatLevel = 'accent' | 'medium' | 'normal' | 'mute'`; `isBeatLevel` accepts it (so saved
   settings with `medium` survive `sanitizeSettings`). `nextLevel`: mute→normal→medium→accent→mute.
   Replace the inline `('accent' | 'normal' | 'mute')[]` in `polyScheduler.ts` with `BeatLevel`.
2. Add `accentProfile(beatsPerBar, beatUnit): BeatLevel[]`. First pulse `accent`, each later
   group head `medium`, everything else `normal`. Grouping:
   - compound meter → groups of 3 (6/8 = H L L M L L)
   - 4 → 2+2 (H L M L); 2 and 3 → no medium (H L / H L L); 5 → 3+2; 6 (x/4) → 3+3; 7 → 2+2+3
   - anything else: groups of 2, with a final 3 when odd.
   Implement it as a small `groupSizes(n, beatUnit): number[]` plus the mapping, so the table is
   testable. `compoundAccentLevels` becomes redundant — delete it and its uses.
3. Default settings `levels` = `accentProfile(4, 4)` (existing users' saved levels are untouched).
4. Audio: `AudioEngine.playBeat` plays `medium` with the **accent** buffer through a gain node at
   ~0.6 (accent stays at full, no gain node — keep current behaviour). `playPolyBeat`: medium
   gain ~1.1 (between normal 1 and accent 1.35). Tune by ear; note the values in a comment.
5. Visuals: `drawNode` routes `medium` to `kit.paintAccent` with the accent colour blended ~50%
   toward the normal node colour (`nodeStyleKit.ts` has `lighten`/`darken` and a private
   `parseRgb`; add one small exported `mixColor(a, b, t)` there next to them if no existing
   helper fits). Sprites are keyed by level already (`spriteKey`), so no cache
   change is needed; confirm by reading `nodeSprite.ts`. `polyrhythm.ts` `levelColor`: medium =
   `lighten(layerColor, 0.1)`. `settingsDialog.ts` node-style preview row can stay 3 nodes.
6. Settings beat row: `.beat.level-medium` CSS between normal and accent. Haptics: medium 20 ms.
   `knob.flash()` stays accent-only.
7. i18n: `beatLevel.medium` (`medium` / `orta`); fix `beats.subLabel` and `beats.hint` in both
   languages to the new cycle (the current text also has the old order — this fixes it).
8. Tests: `groupSizes`/`accentProfile` table (2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 9/8, 12/8, 6/4),
   `nextLevel` full cycle, `sanitizeSettings` keeps `medium`.

## Task 2: Signature changes apply the accent profile

**Files:** `src/ui/signatureDialog.ts`, `src/state/settings.ts`, tests.

Add `withSignature(beatsPerBar, beatUnit): Pick<Settings, 'beatsPerBar' | 'beatUnit' | 'levels'>`
(clamped like `withBeatsPerBar`, levels = `accentProfile`). Use it for presets, the beats −/+,
and the note-value chips. A signature change resets custom accents; per-beat taps afterwards are
kept until the next signature change. Keep `withBeatsPerBar` if anything else still uses it.
Test: changing 4/4 → 6/8 yields `['accent','normal','normal','medium','normal','normal']`.

## Task 3: Meter-aware pulse in the scheduler

**Files:** `src/engine/scheduler.ts`, `src/main.ts`, `src/state/settings.ts`, tests.

1. `Pattern` gains `pulsesPerBeat: 1 | 3`. In `tick()` and `skipMissed()`:
   `duration = secondsPerBeat(bpm) / pulsesPerBeat`. `BeatEvent.duration` is then the pulse
   length, which is what the visualisers already expect per node — no viz change.
2. Pure helper `patternFromSettings(s: Settings): Pattern` (put it next to `isCompoundMeter`):
   `pulsesPerBeat = isCompoundMeter ? 3 : 1`, `subdivision = compound ? 1 : s.subdivision`.
   `main.ts:93` `getPattern: () => store.get()` becomes `getPattern: () =>
   patternFromSettings(store.get())`. It runs every tick — keep it allocation-light (or memoise on
   the settings object identity; the store replaces the object on every `set`).
3. Beat times stay accumulated (`nextTime += duration`) — the CLAUDE.md rule. Changing meter
   mid-play just changes the next duration, like a BPM change.
4. Tests (`tests/engine/scheduler.test.ts`): 6/8 at 60 BPM → six pulses 1/3 s apart per bar;
   `skipMissed` lands on the same 1/3 s grid; `patternFromSettings` zeroes subdivision in 6/8
   and keeps it in 4/4; 7/8 stays one pulse per beat.
5. Signature dialog: in a compound meter disable the Subdivision chips (`disabled` + a one-line
   `sub-label` like "Eighths are already the beat's subdivision" / "Sekizlikler zaten vuruşun alt
   bölümü" — new i18n key).

## Task 4: Subdivision badge on the signature button

**Files:** `index.html`, `src/ui/controls.ts`, `src/styles.css`, `src/i18n/translations.ts`.

A small round chip overlapping the top-right corner of `#signatureBtn`, showing the active
subdivision: `8`, `3`, `16` (for 2/3/4). Hidden when subdivision is off, in polyrhythm mode, and
in compound meters (Task 3). Style = the **recessed, unselected** look of the Circle/Line tab
track (`.seg`): `linear-gradient(180deg, #100f0c, #1a1812)`, `1px solid var(--line)`,
`inset 0 2px 4px rgb(0 0 0 / 0.6)`, `border-radius: 999px`, text `var(--muted)`, ~10px, min
~18px tall. Position absolute `top: -6px; right: -6px`. `aria-hidden`; instead extend the
button's aria-label with the subdivision name (reuse `subdivision.*` keys). Render it in
`controls.ts` where `sigTop`/`sigBottom` are updated.

## Task 5: Bar counter looks attached to the panel

**Files:** `src/styles.css` (`.bar-counter`, ~line 560).

The pill straddles the panel's top edge (`top: -16px`). Keep the upper half exactly as now. The
lower half (the part inside the panel) should read as part of the panel frame: its border uses
the panel's border recipe (`1px solid var(--accent-idle)` + the `.panel::before` machined-edge
look), and the outer glow (`box-shadow: 0 0 4.2px var(--accent-glow)`) only shows on the upper
half. Suggested approach: move the glow to a `::after` clipped with
`clip-path: inset(-8px -8px 50% -8px)`, and draw the lower-half border with a `::before` clipped
to `inset(50% 0 0 0)` in the panel's border colour. Verify in all 4 themes; the seam at the
midline must line up with the panel's top border.

## Task 6: Main-panel BPM nudges — bigger LCD

**Files:** `src/styles.css` (`.nudge::before`).

Screen area 1.3× wider/taller: `inset: 26.6%` → `inset: 19.6%` (46.8% → 60.8% of the button).
Also check the mobile `@media` block near the end of `styles.css` for a `.nudge` override.

## Task 7: Dialog number pickers use the practice-timer format

**Files:** `index.html`, `src/styles.css`, `src/ui/signatureDialog.ts`,
`src/ui/polyrhythmDialog.ts`, `src/ui/barCounterDialog.ts`, maybe `src/ui/holdRepeat.ts`.

1. Generalise the practice timer's picker into shared classes: `.num-picker` (from
   `.time-picker`), a value box styled like `.time-fields input` (dark box, `--line` border,
   tabular numbers), and `.round-step-btn` (rename of `.time-step-btn`: round, border +
   box-shadow, **no metallic conic/LCD**). The practice timer switches to the shared classes.
2. Apply it to every `+/−` + number in a dialog: Beats (signature), Layer A / Layer B (poly),
   Song length (bar counter). The value stays an `<output>` (not an input) except where it is
   already an input. Delete the `.stepper`/`#polyBlock .nudge` overrides that become dead; the
   dialogs must no longer use `.nudge` at all.
3. Wire hold-to-repeat (`holdRepeat.ts`, as the practice timer does) on the new buttons.

## Task 8: Signature dialog layout

**Files:** `index.html`, `src/styles.css`, `src/ui/signatureDialog.ts`. Depends on Task 7.

1. Merge the Beats and Note value blocks into **one** `picker-block` card, a 3-column grid
   `1fr 1fr auto`: Beats (heading + Task 7 picker) | Note value (heading + chips `2 4 / 8 16`
   as a 2×2 grid) | the resulting signature as a stacked fraction, same markup/style as the
   panel's `.sig` but larger (~30px), separated by a thin `--line` divider. Columns 1 and 2 are
   the same width and height. Check at 320px width — shrink chip `min-width` inside this grid
   if needed.
2. Presets strip (`.segmented` with 2/4 … 12/8): a fade on the right edge showing it continues:
   `mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent)`, toggled by a
   class that `signatureDialog.ts` removes when scrolled to the end (`scrollLeft +
   clientWidth >= scrollWidth - 1`) and re-checks on `scroll` and on dialog open. Scope it to
   the presets strip only (the Standard/Polyrhythm switch is also `.segmented`).

## Task 9: Polyrhythm sound pickers match the Sounds dialog

**Files:** `index.html`, `src/ui/polyrhythmDialog.ts`, `src/ui/soundDialog.ts`, `src/main.ts`,
`src/styles.css`, `src/i18n/translations.ts`.

Keep the dropdowns, but use the Sounds dialog structure: `.slot` > `label` + `.slot-row` >
`select` + `.small-btn` `▶`. The play button previews the currently selected sound of that
layer. Extract `soundDialog.ts`'s `preview(id)` into a shared function (or pass a
`previewSound(id)` dep from `main.ts` into both mounts) — don't duplicate the load/decode path.
Remove the `#polyBlock select { width: 100% }` rule. New aria-label keys for the two preview
buttons in both languages.

## Task 10: Circle/Line tabs — no press scale

**Files:** `src/styles.css`.

Delete the `.seg-btn:active { transform: scale(0.95); }` rule and its comment. Keep the
`::after` suppression.

## Task 11: One font (Inter)

**Files:** `src/styles.css`, `src/ui/knob.ts`, `src/viz/{circular,linear,polyrhythm,vizController}.ts`,
`src/assets/fonts/roboto-mono/` (delete), docs.

1. `--font-mono` and `--serif` go away; every use becomes `var(--font-sans)`. Where the mono
   face was used for numbers (`.sig`, `.stepper-value`, time fields, `.bar-counter`,
   `.practice-time-left`, `.segment`, `.nudge`), add `font-variant-numeric: tabular-nums` so
   digits don't jitter. The italic tempo marking becomes Inter, non-italic (no italic file is
   shipped — don't rely on synthesised oblique).
2. Canvas: node labels (`system-ui` in circular/linear/polyrhythm/vizController) and the knob's
   BPM (`"Roboto Mono"`) → `"Inter", system-ui, sans-serif`. Make sure the knob and the sprite
   cache repaint once `document.fonts.ready` resolves (extend the existing
   `document.fonts?.ready.then(() => fitColumnLabels())` in `main.ts` ~line 503) — otherwise the first paint keeps the fallback font. The sprite cache
   must be invalidated for that (CLAUDE.md rule on sprite invalidation).
3. Delete the two Roboto Mono `@font-face` blocks and `src/assets/fonts/roboto-mono/`. Grep
   docs (`platforms.md`, privacy policy) for "Roboto" and update.

## Task 12: Themed sound picker (replace native `<select>`)

**Files:** `src/ui/soundDialog.ts`, `src/ui/polyrhythmDialog.ts` (via the shared picker from Task 9),
`index.html`, `src/styles.css`, `src/i18n/translations.ts`, maybe a new `src/ui/soundPicker.ts`.

The current sound choosers (`accentSoundId`/`normalSoundId` in the Sounds dialog, `soundIdA`/
`soundIdB` in the Polyrhythm dialog) are plain `<select>` elements. On mobile the OS renders its
own light-themed list (see reference screenshot: white sheet, radio circles, "Built-in" group
label, "No sounds added yet" row) which clashes with the app's dark panel chrome — everything
around it is themed, the picker itself isn't.

1. Build one shared custom listbox component (`openSoundPicker(...)` in a new `soundPicker.ts`,
   or inline in `soundDialog.ts` if a shared module isn't warranted — decide once the existing
   `.slot`/dialog structure from Task 9 is in place, since both dialogs must call the same thing).
   It replaces the `<select>` visually but keeps the same data: grouped by `soundGroup.builtin` /
   `soundGroup.yours` (existing i18n keys, reuse them), one row per sound with a radio-style
   selected indicator, dark panel background matching the parent dialog (`--panel`, `--line`
   borders, per-theme accent colour for the selected radio — teal/pink/whatever `--accent`
   resolves to in the active theme), row dividers, and the empty-state row
   (`soundList.empty` — "No sounds added yet.") when there are no custom sounds.
2. Keep the underlying `<select>` in the DOM but visually hidden (`opacity:0`/off-screen, not
   `display:none`) so existing keyboard/a11y/form semantics and the `change` event wiring in
   `soundDialog.ts:150-153` keep working — the custom listbox opens on click/tap of the `.slot`
   row, writes the choice back into the hidden `<select>` (`select.value = id; dispatch
   'change'`), and closes. This avoids duplicating the `store.set` wiring.
3. Open/close as a small popover or bottom-sheet anchored to the triggering row (match how other
   in-app dialogs/popovers are already positioned — check `settingsDialog.ts` or the existing
   dialog `<dialog>` pattern before inventing a new one). Dismiss on backdrop tap, `Escape`, and
   selecting a row.
4. Apply to all four sound slots (Sounds dialog's accent/normal, Polyrhythm dialog's A/B) so the
   picker is visually consistent everywhere, per-theme. Verify in all 4 themes and at 320px width.

## Final check (after all tasks)

`npm test`, `npm run lint`, `npm run build`. In `npm run dev` walk through: 4/4 → 6/8 → 12/8
at 60 BPM (count 2 / 4 felt beats per bar, 3 clicks each, H-L-L-M-L-L dynamics audible), tap a
node through all four levels, subdivision badge on/off/poly/compound, dialogs at 320px, all four
themes. Don't push; report back with the commit range.
