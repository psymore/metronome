# Per-level beat volume (Accent / Medium / Normal) — implementation plan

> **For the executor:** this plan is not scheduled yet — the user asked for the idea to be
> written down after a brainstorm, not implemented in the same session it was proposed. Read
> `CLAUDE.md` first, especially "Rules that are easy to break", before starting. Read
> `src/engine/audioEngine.ts`'s `playBeat` (the main, non-poly scheduler's beat player) in full
> before Task 1 — the exact gain-node wiring described below is a snapshot from 2026-09-30 and
> may have shifted.

## What exists today (2026-09-30)

Three beat levels play through the **main** scheduler (`AudioEngine.playBeat`, not the polyrhythm
one): `accent` and `normal` connect their buffer source straight to the master gain (no per-level
attenuation), `medium` borrows the accent buffer through an extra `GainNode` fixed at `0.6`
(`audioEngine.ts`, comment: "tuned by ear: between mute (0) and a full accent (1)"). There is a
single global `Volume` slider (`Settings.volume`, 0–1) on top of all of this.

The **polyrhythm** scheduler (`playPolyBeat`) is a separate, already-tuned system (normal 1,
medium 1.1, accent 1.35, relative to its own layers) and is **out of scope for this plan** —
polyrhythm layers don't have accent/medium/normal beat levels the way the main scheduler's beat
row does, so there's nothing here for these sliders to attach to.

## Global decisions (settled with the user 2026-09-30 — don't re-open)

- **Three independent sliders**, one each for Accent / Medium / Normal gain, 0–100%. **No
  ordering constraint** — the UI does not force Accent ≥ Medium ≥ Normal. A user is free to set
  Normal louder than Accent if that's what they want; this is a deliberate simplicity choice over
  a constrained/clamped-relative-to-each-other UI, which was considered and declined.
- **No new sound slots.** Medium keeps borrowing the Accent buffer exactly as it does today —
  this plan only makes the existing (and two new) gain multipliers user-adjustable, it does not
  add a third sound picker. `accentSoundId`/`normalSoundId` are unchanged.
- Defaults on a fresh install match today's hardcoded behavior exactly: Accent 100%, Medium 60%,
  Normal 100% — so this plan changes nothing audible until a user touches a slider.
- Sliders reuse the just-shipped look and interaction from the Volume/Visual-sync-offset sliders
  in the Settings dialog (`--range-fill` left-filled/right-empty track, a small tappable
  `<input type="number">` value box next to the label) — no new visual language to invent.

## Open question for whoever schedules this (not settled — ask before Task 1)

Where do the three sliders live? Two reasonable options, not yet decided:
- **In the Sounds dialog**, next to the existing Accent/Other-beats sound pickers (`soundDialog.ts`)
  — keeps "what plays" and "how loud" for each level in one place.
- **In the Settings dialog's beat row area**, near the existing per-beat level tap-cycle control
  — keeps "which beats are which level" and "how loud each level is" together.
Either is a small, self-contained UI addition; pick one and note the choice in this plan's ledger
when the plan is executed, rather than guessing silently.

## Task 1: Settings schema

**Files:** `src/state/settings.ts`, tests.

1. Add `accentGain: number`, `mediumGain: number`, `normalGain: number` to `Settings` (0–1 range,
   same convention as `volume`). Defaults: `accentGain: 1`, `mediumGain: 0.6`, `normalGain: 1`
   (matches today's hardcoded constants exactly).
2. `sanitizeSettings` clamps each to `[0, 1]` via the existing `clampNumber` pattern already used
   for `volume`.
3. Tests: `sanitizeSettings` keeps valid gains, clamps out-of-range ones, and defaults missing
   ones — mirror the existing `volume` test cases.

## Task 2: Audio engine reads the new settings

**Files:** `src/engine/audioEngine.ts`, tests if `playBeat` has any (check first).

1. `playBeat`'s `medium` branch: replace the hardcoded `gain.gain.value = 0.6` with
   `store`'s current `mediumGain` (however `AudioEngine` currently gets settings — read the
   constructor/`playBeat` signature first; it may need a settings getter passed in if it doesn't
   have one already for per-call values).
2. `accent` and `normal` currently skip a gain node entirely (source → master directly). Give them
   one each too, reading `accentGain`/`normalGain`, so all three levels go through the same kind
   of node and the sliders have real effect. Verify this doesn't introduce an audible click or
   extra latency versus the direct-connect path it replaces (a `GainNode` in the chain is normal
   Web Audio practice and shouldn't, but confirm by ear per this codebase's "browser glue is
   verified manually" convention).
3. **Do not** touch `playPolyBeat` — out of scope per the Global decisions above.

## Task 3: UI

**Files:** depends on the Open Question above — `src/ui/soundDialog.ts` + `index.html`'s
`#soundDialog`, or `src/ui/settingsDialog.ts` + `index.html`'s beat-row `.field`. Also
`src/i18n/translations.ts`, `src/styles.css` if any new layout is needed beyond what already
exists.

1. Three rows, each: a label (Accent / Medium / Normal — reuse `beatLevel.*` i18n keys if they
   already read naturally as labels, otherwise add new ones), a `type="range"` slider styled like
   the existing `#volumeInput`/`#offsetInput` (`--range-fill` pattern, `min="0" max="100"`), and a
   small tappable `<input type="number" class="field-value-input">` value box showing the percent
   — copy the Volume slider's exact wiring in `settingsDialog.ts` (range → store.set, number input
   → clamp → store.set, `updateRangeFill` on both, render sets both plus the fill) rather than
   inventing a new pattern.
2. Wire to `accentGain`/`mediumGain`/`normalGain` via `store.set`.
3. i18n: new labels/aria-labels in both `en` and `tr`, following the existing key-naming
   convention for the file the sliders land in.

## Final check (after all tasks)

`npm test`, `npm run lint`, `npm run build`. In `npm run dev`: confirm a fresh install (cleared
`localStorage`) sounds identical to before this plan (defaults preserve today's mix), then move
each slider to a few values and confirm Accent/Medium/Normal are each audibly distinct and
independently adjustable, including settings a level "backwards" (e.g. Normal louder than Accent)
without the UI fighting you — that's the deliberately-chosen behavior, not a bug. Don't push;
report back with the commit range.
