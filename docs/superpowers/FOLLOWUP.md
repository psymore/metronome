# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-10-01)

On `master`, **all changes committed and pushed**. This session was a long UI-polish pass, driven
by the user testing live on their phone and a large desktop monitor. Everything below was looked
at by the user as it landed unless marked otherwise.

### Latest: knob app icon, long-press fix, narrow-phone fix (not browser-checked)

- **App icon** is now the BPM knob redrawn in SVG (`public/icon.svg`): gear teeth, teal metal
  face, indicator tick, dark LCD with only a play glyph (digits are unreadable at icon size), on
  the panel's shaded warm grey with a drop shadow. The user liked the look from the PNG preview.
  PNGs were regenerated with a one-off `sharp` call (svg → `pwa-64/192/512`,
  `maskable-icon-512x512`, `apple-touch-icon-180x180`), not with `pwa-assets-generator`.
- **Not updated for the new icon:** `public/favicon.ico`, everything in `src-tauri/icons/`, and
  the Android launcher icon (`android/`, needs a new Play release).
- **Long-press text selection:** the global `button` rule in `src/styles.css` has
  `user-select: none` + `-webkit-touch-callout: none`, so holding +/- no longer opens the native
  copy menu.
- **Right edge cut off in the installed app** (fd1b666): `.app` uses
  `grid-template-columns: minmax(0, 1fr)`. Confirmed working by the user on their 400px phone.

**Checks that were skipped** (user asked for no browser and no tests, usage limit):

- The long-press fix was not tried on a phone or in a browser.
- The icon was only viewed as the 192px PNG; not seen installed, in a maskable (round) crop, or
  at 64px. The knob's outer radius is 200/512, just inside the maskable safe zone.
- Phones narrower than 400px (320/360px) were not checked. The column can't overflow any more,
  but the controls panel (knob + two 64px button columns) may get tight at 320px.
- No `npm test` / `npm run build` / lint run after these changes.

### Practice timer buttons and inline delete confirm

- Timer bar icons redrawn as inline SVG (`index.html`): filled play/pause, a "replay" reset icon
  (open circle, sharp filled arrowhead at 12 o'clock), an empty outline trash can.
- Buttons shrank 45px → 38px. Sizes live in three CSS variables on `.practice-icon-btn`
  (`--btn-size`, `--capsule-size`, `--inner-size`); `.is-small` overrides them.
- Delete confirm is one capsule (flat top/bottom, round ends) that expands from the round button
  and collapses again on cancel/timeout (`capsuleExpand` / `capsuleCollapse`, `.is-closing`). The
  ✕ / ✓ inside use the same colours as the practice dialog's Start confirm.
- `main.ts`: the confirm logic is now `mountDeleteConfirm(button, onConfirm)`, shared by the
  timer's trash and a new small trash beside the loop pill (`#barCounterDeleteBtn`, shown only
  while `targetBars > 0`; it turns the loop off and leaves the metronome playing).
- The loop pill and its trash sit in `.bar-counter-wrap` (the wrap is what is absolutely
  positioned now, not the pill).
- Loop dialog's Apply now uses the same split ✕ / ✓ confirm as the practice dialog's Start
  (`src/ui/barCounterDialog.ts`).

**Open:** with both the timer and a loop active, the two button groups crowd each other on a
narrow phone, and the timer's open capsule can overlap the loop trash. The user wants to decide
later whether both should be allowed at once.

### Signature dialog

- Beats and Note value sit in two equal-height halves (`.sig-grid-part`), same width.
- The result fraction is a button (`#sigResultBtn`) that opens `#sigWheelDialog`: two
  scroll-snap drum pickers side by side (beats 1–16, note value 2/4/8/16), picked value between
  two theme-coloured guide lines. Nothing applies while scrolling; **Save** commits both wheels,
  **Cancel** / backdrop leaves the signature alone. Logic in `src/ui/signatureDialog.ts`
  (`mountWheel`). Checked in a desktop browser at phone size; real finger scrolling on the phone
  was not confirmed by the user yet.
- The "tap beats" switch shows a lock icon (open/closed) and asks for confirmation in
  `#beatsLockDialog` before locking; unlocking is instant.
- The compound-meter hint keeps its line when not applicable (`.is-idle`, visibility hidden) so
  the sheet doesn't shift.

### Defaults and visuals

- `accentProfile` (`src/state/settings.ts`) now accents only the first beat; no more `medium`
  group heads. Applies to fresh storage and whenever the signature changes. Two existing tests
  were updated to match.
- Polyrhythm outlines use the deep tone of each layer's own hue: layer B `theme.node`, layer A
  the new `theme.nodeAlt` (`--viz-node-alt`, per theme in `styles.css`).
- Toasts have a warning-yellow border (`--confirm-warn`).
- `.sheet` background moved off the `::before` layer onto the sheet itself (it used to scroll
  away on long sheets).
- The one-time knob rotation hint was removed (`src/ui/knobHint.ts` deleted). The user plans a
  proper guided intro later instead.

### Layout

- Tempo marking now sits above the knob; the knob and nudges are tighter; panel padding reduced.
- `.stage` max-height 390px, top margin `clamp(0px, 0.4dvh, 6px)`.
- Wide screens (`min-width: 720px` and `min-height: 640px`): column is 600px and the dial grows
  until it is as wide as the panel, centred in the leftover height. The user liked this.

### Known failing tests (pre-existing, not from this session)

`npm test`: 6 failures in `tests/state/barCounter.test.ts` and `tests/i18n/i18n.test.ts`. They
expect "Bar 3"-style strings; the translations were renamed to "Loop …/Repeat …" in an earlier
commit without updating the tests. Fix is to update the expected strings.

### Standing instructions (apply going forward)

- **Never work in a git worktree for this project.** Plain local branches in the main directory.
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo.**
- The user tests live on a physical Android phone (Chrome) against the dev server's Network URL
  (`http://<LAN-IP>:5173/`).
- The user is near a weekly usage limit: keep turns cheap, no plans, no new tests unless asked,
  and don't run test/build reflexively after small edits.

## Next step

0. Ask the user how the new icon and the +/- long-press fix behave on the phone; if the icon
   stays, regenerate `favicon.ico`, the Tauri icons (`npx tauri icon`) and the Android icon.
1. Ask the user how the wheel picker feels on the phone (finger scrolling, Save/Cancel).
2. Decide with the user whether the timer and the loop may be active at once; if yes, fix the
   crowding/overlap of the two button groups on narrow screens.
3. Offer to fix the 6 stale "Bar → Loop" test expectations.
4. Remaining work from `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`:
   Play Console setup (user side), AAB build and signing, closed testing, production release.
