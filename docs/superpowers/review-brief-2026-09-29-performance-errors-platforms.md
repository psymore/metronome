# Review brief — performance, error handling, multi-platform readiness

Written 2026-09-29, for running a focused review with Opus 5.5 (`/code-review high`
or `/code-review ultra`, or pasted into a fresh Opus 5.5 conversation). This is a
**scope document**, not the review itself — it tells the reviewer what to look at
and why, based on a walkthrough of the current repo state. It does not fix
anything.

## 0. What to point the reviewer at

- **Branch/state**: `master`, plus the current uncommitted working-tree diff
  (beat-sphere-styles feature — `src/viz/nodeStyleKit.ts`, `circular.ts`,
  `linear.ts`, `polyrhythm.ts`, `polyGeometry.ts`, `geometry.ts`,
  `vizController.ts`, `settingsDialog.ts`, `settings.ts`, `translations.ts`,
  `styles.css`, `index.html`, plus test files). This is the newest, least-reviewed
  surface in the repo — review it, not just committed history.
- **Read first**: `CLAUDE.md` ("Rules that are easy to break" section),
  `docs/architecture/platforms.md`, `docs/superpowers/specs/2026-09-23-metronome-design.md`,
  `docs/superpowers/specs/2026-09-29-beat-sphere-styles-design.md`.
- **Already-known, already-tracked issues** — don't re-report these as new
  findings, but do verify they're still accurate and re-assess severity if the
  new node-style work touches the same code:
  - Sprite-cache growth across window resizes in linear mode.
  - Sub-pixel sprite blit softening.
  - `SPRITE_PAD` marginally tight for the idle shadow at DPR 1.
  - `AudioEngine.preview()` leaves the context running until next stop/start.
  - (All from `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`
    Task 4 history / `docs/superpowers/FOLLOWUP.md`.)
- **Open platform work** — Play Console listing steps (account type, AAB upload,
  closed testing) are still open per `FOLLOWUP.md`; don't flag "app isn't live on
  Play yet" as a finding, it's already tracked.

Run one high-effort pass covering all three pillars below rather than three
separate reviews — they overlap heavily in the same files (visualiser,
`audioEngine.ts`, storage), so splitting them would mean re-reading the same
code three times for no benefit.

## 1. Performance & resource competence (mobile is the primary target)

The app ships mobile-first (PWA + Android TWA), with desktop (Tauri) and a
possible future iOS wrapper as secondary. Review resource cost with that
priority order, not desktop-first.

- **Live-repainted (non-sprite-cached) canvas paint cost.** `vizController.ts`
  draws idle beat nodes from cached sprites (`NodeSpriteCache`), but polyrhythm
  nodes mid-split are repainted live every animation frame (see the comment in
  `nodeStyleKit.ts`'s `frostBase`, which already had to swap `ctx.filter` blur
  for `shadowBlur` because of exactly this cost). Check, for each of the four
  node styles (classic/metallic/wireframe/frosted), the actual per-frame paint
  cost of the live path: `shadowBlur`, radial/conic gradients, and clip regions
  are all recreated every frame. Ask: what happens on a mid-range Android phone
  with several coincident pairs mid-split at once, in the most expensive style
  (wireframe's per-node conic geometry loop, or frosted's `shadowBlur`)?
- **Sprite cache invalidation.** `NodeSpriteCache` must already invalidate on
  theme and DPR change (per `CLAUDE.md`). Confirm it also invalidates on
  `nodeStyle` change (new with this feature) — a stale sprite from a previous
  style would be a visible correctness bug, not just a performance one.
- **`requestAnimationFrame` gating.** `renderPolicy.ts` (`shouldAnimate`) must
  keep the RAF loop off while `document.hidden`. Confirm none of the four node
  styles or the polyrhythm split-animation path (`polyPairAnim`) create timers,
  gradients, or other per-frame work that keeps running while hidden, and that
  `shouldAnimate` still resumes correctly for all of them.
- **Background scheduling under real mobile throttling.** The scheduler runs
  off a dedicated worker (`timerWorker.ts`) specifically to dodge tab
  throttling. Confirm this still holds under Android's Doze/battery-saver and
  backgrounded-TWA conditions, not just backgrounded-desktop-tab conditions.
- **Memory growth.** The known linear-mode sprite-cache-on-resize leak — check
  whether it's made materially worse now that there are 4 styles × 2 DPR
  buckets × N radii of sprites potentially cached simultaneously.
- **Cold start / bundle size for mobile data.** Is there any budget or CI check
  on `dist/` size or first-paint cost? If not, flag it as a gap — a TWA/PWA's
  first load over real mobile data matters more than desktop load time.
- **Service worker cache scope.** `vite.config.ts`'s Workbox `globPatterns`
  caches all `js,css,html,svg,png,ico` — confirm this doesn't balloon install
  size on mobile (e.g. if uploaded/synth sound assets or many icon variants
  ever get swept into precache).
- **Desktop (Tauri) shouldn't need special-casing to be light.** Confirm there's
  no polling loop, unbounded `setInterval`, or Tauri-only code path that does
  more work than the browser build — the render/audio cost should be identical
  to running the same PWA in Chrome.

## 2. Error handling correctness

- **Confirmed gap to verify and scope**: `src/sounds/soundStore.ts` calls
  `idb-keyval`'s `set`/`get`/`values`/`del` with no `try/catch` anywhere in the
  file — every IndexedDB operation is unguarded. This directly conflicts with
  the `CLAUDE.md` rule "every `localStorage`/IndexedDB access can throw
  (private windows): wrap it and fall back." Trace every caller
  (`soundLibrary.ts`, `importSound.ts`, `soundDialog.ts`) to determine whether
  the catch genuinely happens further up the stack with a real fallback, or
  whether a private-browsing/quota-exceeded/blocked-storage user just gets an
  unhandled rejection and a broken sound picker.
- **Audit every storage touch point** (`main.ts`, `settings.ts`,
  `soundStore.ts`, `wakeLock.ts`) for the same class of bug: does the fallback
  keep the app *usable* (metronome still runs, just without persisted
  settings/sounds), or does it just avoid a crash while leaving the feature
  silently broken?
- **`decodeAudioData` buffer-detach rule.** `CLAUDE.md` calls this out
  explicitly: decoding detaches the source `ArrayBuffer`. Check every call site
  that might reuse the original bytes afterward (`importSound.ts`, `trim.ts`,
  `pcm.ts`) for a decode-a-copy pattern, not the original.
- **`AudioContext` failure paths.** iOS Safari has a low ceiling on concurrent
  `AudioContext`s system-wide; other browsers can also refuse under resource
  pressure. `audioEngine.ts` has the most `catch` blocks in the codebase (6) —
  assess whether each is a genuine recovery with user-visible feedback, or a
  swallow-and-continue that leaves the user tapping Start with nothing
  happening and no explanation.
- **Uploaded-file error handling.** Malformed, huge, or unsupported-codec
  uploads through `importSound.ts`/`validate.ts` — confirm the user gets a
  message (via `toast.ts` or similar), not a silent failure or an unhandled
  promise rejection in the console.
- **No global safety net found in the grep pass** — check whether there's a
  top-level `window.onerror`/`unhandledrejection` handler anywhere. If the
  worker tick or a scheduler promise throws mid-session, does the metronome die
  silently with no user-visible signal, or is there a floor under it?
- **Wake lock `pending` guard.** `CLAUDE.md` calls out that `wakeLock.ts`'s
  `pending` flag prevents overlapping `request()` calls. Confirm the flag is
  always cleared on every exit path (success, rejection, unsupported API,
  released-while-pending due to a visibility change) — a guard like this is
  exactly the shape of bug that causes a permanent "can't lock again" hang if
  one exit path forgets to reset it.

## 3. Platform release feasibility

- **PWA (GitHub Pages + Vercel).** Spot-check that `docs/architecture/platforms.md`'s
  claims about `base` path / `GITHUB_PAGES` env handling still match
  `vite.config.ts`, and that the new `nodeStyle` setting and any new assets from
  the beat-sphere-styles work haven't changed the PWA manifest/precache list in
  a way the docs don't reflect.
- **Android Play Store (TWA via Bubblewrap).** Re-verify against current Google
  Play policy: `targetSdk=36` requirement, the 12-testers/14-day closed-testing
  gate for personal accounts created after 2023-11-13 (already tracked as open
  in `FOLLOWUP.md` Task 9 — confirm it's still accounted for in whatever launch
  timeline exists, don't just re-flag it as new).
- **iOS — no native shell exists today.** The app currently reaches iOS only
  through Safari's "Add to Home Screen" PWA install, with the silent-looping-audio
  unlock workaround in `transport.ts` for the Ring/Silent switch. Have the
  reviewer explicitly check:
  1. Whether iOS Safari's home-screen PWA actually behaves acceptably standalone
     today (audio unlock, service worker offline behavior).
  2. Whether `wakeLock.ts` degrades gracefully on iOS Safari, which has limited/no
     Screen Wake Lock API support — confirm the app doesn't hang or throw when
     the API is simply absent.
  3. **If real App Store presence (not just PWA) is wanted**, that needs a native
     wrapper. The Android TWA-not-Capacitor decision in `platforms.md` was made
     for Android-specific reasons (asset-links hosting) that don't automatically
     apply to iOS. Treat "how to package for iOS App Store" as an **open
     architectural decision for the reviewer to lay out options for**, not
     something to assume is pre-approved or already decided.
- **Desktop (Tauri).** Confirm the "resource-light" claim holds — no
  Tauri-specific polling, `security.csp: null` is a deliberate choice worth a
  one-line justification (or a flagged finding if it isn't intentional). Note
  that only NSIS/Windows is currently targeted; mac/Linux desktop builds are
  unscoped unless the user asks for them.
- **Single-codebase guardrail.** The only platform branch in the whole codebase
  is the pre-existing `'__TAURI_INTERNALS__' in window` check in `main.ts`.
  Confirm the recent beat-sphere-styles/polyrhythm work didn't quietly introduce
  a second one (e.g. a `navigator.userAgent` sniff, an Android-only code path)
  that isn't documented the same way.

## 4. What the reviewer should hand back

Findings as: file, line, concrete failure scenario (input/state → wrong
behavior), severity, and whether it's new or an already-known/tracked item
(cross-reference section 0's "already-known" list and `FOLLOWUP.md`'s deferred
list). For the iOS App Store question specifically, ask for options + a
recommendation rather than a unilateral implementation — it's a real
architectural decision, not a bug.
