# Review fixes — performance, error handling, platforms (2026-09-29)

Fix plan for the highest-impact findings from the 2026-09-29 review
(`docs/superpowers/review-brief-2026-09-29-performance-errors-platforms.md`).
Each task is independent: do them in order, one commit per task. Read
`CLAUDE.md` ("Rules that are easy to break") before starting.

Out of scope here (noted, not forgotten): wireframe blur batching, merged-node
mute glow, settings preview repaint-on-every-store-change, Tauri CSP,
`POST_NOTIFICATIONS` in the TWA shell, English-only upload error strings,
transient-IDB fallback overwriting the saved sound choice (`main.ts:107`).

Final verification after all tasks: `npm test`, `npm run lint`, `npm run build`.

---

## Task 1 — `lighten`/`darken` must accept their own output

**Problem.** `src/viz/nodeStyleKit.ts` `lighten()`/`darken()` parse only
`#rrggbb` but return `rgb(r,g,b)`. Any chained call (`metalDisc`'s
`ringColor` for accents, every colour `polyrhythm.ts` derives via
`darken`/`lighten` then hands to a kit) passes through unchanged, so Metallic
accents and all polyrhythm nodes lose their highlights and dark sweeps.

**Fix.**
- Add a small internal `parseRgb(color): [r, g, b] | null` accepting
  `#rrggbb` and `rgb(r,g,b)` / `rgb(r, g, b)` (whitespace-tolerant). Anything
  else → `null` → return the input unchanged (keep the current safe no-op).
- Rewrite `lighten`/`darken` on top of it; keep the `rgb(...)` output format.

**Tests.** New `tests/viz/nodeStyleKit.test.ts`: hex input, `rgb()` input,
`darken(lighten(x))` actually changes the value, non-colour passes through,
channels clamp to 0..255.

---

## Task 2 — Polyrhythm nodes from the sprite cache

**Problem.** `drawPolyrhythm` ignores its `_sprites` argument
(`src/viz/polyrhythm.ts:33`), so while playing *every* poly node is painted
live every frame (up to 31 nodes: ~60 `shadowBlur` passes/frame in Classic,
~400 draw calls in Metallic, a blur per node even at rest in Frosted). This is
the biggest mobile paint cost in the app.

**Fix.**
- Extend `NodeSprites.get` / `SpriteRenderer` / `spriteKey`
  (`src/viz/nodeSprite.ts`) with an optional `variant: string` (default `''`),
  included in the cache key. Standard mode keeps passing nothing.
- In `polyrhythm.ts`, extract the `layerTheme` construction in `drawLayer`
  into an exported `polyLayerTheme(theme, layerColor): VizTheme` and use it.
- `VizController.paintSprite` (`src/viz/vizController.ts`): when `variant` is
  `'A'` or `'B'`, paint with `polyLayerTheme(this.theme, variant === 'A' ?
  theme.accentAlt : theme.accent)`; otherwise `this.theme` as now. Label
  painting stays as is (Classic only).
- In `drawLayer`, when the node's glow `g === 0`, blit
  `sprites.get(level, label, nodeRadius, layer)` centred at the node
  (`spriteSize(nodeRadius)`, same pattern as `circular.ts:77-83`) and skip
  `drawNode` + `paintLabel`. Pass the layer (`'A'`/`'B'`) into `drawLayer`.
  Rename `_sprites` → `sprites`. Mid-split nodes can use sprites too — only
  their position moves, not their look.
- Merged conjunction nodes and the pair hub stay live (few of them).

**Check.** Cache invalidation already keys on theme/style/DPR; layer colours
derive from the theme, so nothing else is needed. Existing
`tests/viz/nodeSprite.test.ts`: add one case that different variants produce
different keys. Manually: poly 16:15 in each of the 4 styles looks identical
before/after (idle and on hit), and `?debug=1` shows no regression.

---

## Task 3 — A floor under boot and runtime errors

**Problem.** `new AudioContext()` runs at module load
(`src/engine/audioEngine.ts:73`, via `src/main.ts:78`). If it throws (iOS
context limit, resource pressure) or the canvas has no 2D context
(`vizController.ts:71`), `main.ts` aborts before `setBootLoaderHidden(true)`
and the user sees the boot loader spinning forever. The only
`error`/`unhandledrejection` handlers live in the `?debug`-only inline script.
Separately, a throw inside `VizController.render()` kills the rAF loop
permanently.

**Fix.**
1. **Boot failure message** — in `index.html`, add a small inline script
   *before* the module script (independent of `?debug`): a `window` `error`
   listener that, if `#bootLoader` is still visible (not `opacity: 0`),
   replaces its content with a short message and a Reload button. Pick
   Turkish vs English from the saved setting (`localStorage`
   `metronome.settings.v1` → `language`, inside `try`) falling back to
   `navigator.language`. Keep it tiny and plain (inline styles only).
2. **Runtime floor** — in `main.ts`, once `toast` exists, register `error` and
   `unhandledrejection` listeners that `console.error` the reason and show
   `t('toast.unexpectedError')` at most once per 10 s. Add the key in both
   languages in `src/i18n/translations.ts` (e.g. EN "Something went wrong.
   If the metronome misbehaves, reload the app." / TR equivalent).
3. **Keep the render loop alive** — in `VizController.onFrame`, wrap
   `this.render()` in `try/catch`; on error `console.error` once (a boolean
   flag) and still fall through to the `shouldAnimate` re-arm.

**Check.** Temporarily throw in `AudioEngine`'s constructor → the boot loader
shows the message + Reload in both languages. Temporarily throw in
`render()` → one console error, one toast, UI stays responsive. Revert both.

---

## Task 4 — Don't reload the page mid-session on a PWA update

**Problem.** `registerType: 'autoUpdate'` (`vite.config.ts:11`) + `registerSW`
without `onNeedReload` (`main.ts:497`) makes vite-plugin-pwa call
`location.reload()` as soon as a new SW activates. Every Vercel deploy
therefore reloads users' pages a few seconds after launch — often right after
they pressed Start, cutting the metronome (and practice timer) off.

**Fix.** In `main.ts`, pass `onNeedReload` to `registerSW`:
- not running → `location.reload()` immediately (today's behaviour, typically
  at startup before any interaction);
- running → set `reloadPending = true`. Then reload at the first
  `visibilitychange` where `document.hidden && !engine.running`, or, if the
  user stops the metronome, on that next hidden transition too (never
  reload while visible and in use).

`onNeedReload` is a supported option in vite-plugin-pwa 1.3.0
(`types/index.d.ts`). The Tauri path (no SW) is unaffected.

**Check.** `npm run build && npx vite preview`, open, start the metronome,
rebuild with a trivial change, re-preview: playback continues; switching tabs
away and back loads the new version.

---

## Task 5 — `createConicGradient` fallback

**Problem.** `metalDisc` (`nodeStyleKit.ts:225`) calls
`ctx.createConicGradient` unconditionally; it exists only from Safari 16.4 /
Chrome 99. `drawPairHub` (`polyrhythm.ts:171`) uses `metalDisc` in *every*
style, so on iOS 15.x even Classic users hit a TypeError when opening a poly
pair, and (before Task 3) the visualiser froze.

**Fix.** In `metalDisc`, feature-detect
(`typeof ctx.createConicGradient === 'function'`). Fallback: a diagonal
`createLinearGradient` across the disc (top-left → bottom-right) with stops
`light → ringColor → dark`. Same everything else.

**Check.** In devtools, `delete CanvasRenderingContext2D.prototype.createConicGradient`
before load (or temporarily force the fallback branch): Metallic nodes and the
pair hub render with a linear sweep, no console errors.

---

## Task 6 — Keep the volume after `recoverContext()`

**Problem.** `AudioEngine.recoverContext()` (`audioEngine.ts:98`) builds a
new master gain via `createMaster()`, which leaves gain at the default 1.0.
After a start timeout + recovery, output jumps to full volume until the user
touches the slider.

**Fix.** Store the last volume in a private field (`volume = 1`), set it in
`setVolume`, and have `createMaster()` initialise
`master.gain.value = this.volume`.

---

## Task 7 — Self-host fonts (privacy policy, offline, first paint)

**Problem.** `index.html:194-199` loads Inter + Roboto Mono from Google Fonts
as a render-blocking cross-origin stylesheet. That contradicts
`public/privacy-policy.html` ("no third-party services", "works fully
offline"), sends every user's IP to Google, isn't precached (fallback font
offline), and adds a cross-origin round trip to first paint on mobile data.

**Fix.**
- Download the woff2 files (variable fonts where available; subsets **latin
  + latin-ext** — Turkish needs latin-ext for ğ ş ı İ) for Inter 400–700 and
  Roboto Mono 500–700 into `src/assets/fonts/`. Both are OFL: add their
  `OFL.txt` next to them. No npm dependency.
- Add `@font-face` rules (with `font-display: swap` and matching
  `unicode-range`s) at the top of `src/styles.css`, referencing the files
  relatively so Vite hashes them into `/assets/` (already `immutable` in
  `vercel.json`).
- Remove the two `preconnect` links and the Google Fonts stylesheet from
  `index.html`.
- Add `woff2` to Workbox `globPatterns` in `vite.config.ts`.

**Check.** Build; `dist/assets/` contains the fonts; network tab shows no
request to `fonts.googleapis.com`/`fonts.gstatic.com`; offline reload still
renders Inter; Turkish labels render correctly. Note total precache size in
the commit message.

---

## Task 8 — Play App Signing fingerprint in `assetlinks.json` (needs the user)

**Problem.** `public/.well-known/assetlinks.json` lists only the local upload
key's SHA-256. With Play App Signing (mandatory for new AAB apps), Google
re-signs the app with a different key, so the **Play-installed** app fails
Digital Asset Links verification and shows Chrome's URL bar. Locally
side-loaded APKs work, which hides the problem until release.

**Fix.**
1. **User step** (agent can't do it): after creating the app in Play Console,
   copy *App integrity → App signing key certificate → SHA-256* and hand it
   over.
2. Add it as a **second** entry in `sha256_cert_fingerprints` (keep the
   upload-key entry for side-loaded testing). Deploy; verify with the
   `digitalassetlinks.googleapis.com` curl in `docs/architecture/platforms.md`.
3. Update `platforms.md`'s Android release checklist with this step, and fix
   the two doc drifts there: remove the reference to the non-existent
   `platform.ts` (line 42) and add `nodeStyle` to the sprite-cache
   invalidation invariant (line 160).

Until step 1 is available, do only the doc changes and leave a note in
`docs/superpowers/FOLLOWUP.md` (Task 9 section).
