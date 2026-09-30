# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30)

`master` unchanged this session. Branch `bar-counter-polish` (plain local branch, no worktree,
per standing instructions) has this session's work, **not merged and not pushed**:
`git log --oneline master..bar-counter-polish` — 6 commits, implementing
`docs/superpowers/plans/2026-09-30-bar-counter-polish.md` in full (all 6 tasks), split between
Haiku (Tasks 1, 2, 5, 6) and this session (review + Tasks 3, 4).

### Done this session

- **Part A review**: verified Haiku's 4 commits (Tasks 1, 2, 5, 6) against the plan — i18n keys
  correct in both `en`/`tr`, `confirmGate`/`songLength.confirm` fully removed, info popup markup
  and close button match the plan. Independently re-downloaded `@fontsource/eb-garamond` and
  byte-diffed (md5) the two committed woff2 files against the freshly-packed originals — exact
  match, confirming they really are EB Garamond 600 italic (latin + latin-ext), not a mislabeled
  substitute. `npm test`/`lint`/`build` all passed as committed; `dist/` contains both woff2
  files. **Nothing needed fixing** — no Part A fix commit was made.
- **Task 3** (bar counter in polyrhythm): `VizController`'s poly render branch now fires
  `onBeatStart(level, beatA.cycleIndex)` on the rising edge of `frame.glowA`, mirroring how the
  non-poly branch uses `frame.glow`/`lastGlow`. One counter bar = one full A:B cycle. Verified
  `lastGlow` has no other reader that needed `glowB` folded in (it's reset every render, purely
  edge-detection). No new test — user said not to write tests this session; existing 248-test
  suite stayed green.
- **Task 4** (practice timer in polyrhythm, verify-only): confirmed by reading code, not fixed —
  nothing needed fixing. `AudioEngine.switchMode()` (`src/engine/audioEngine.ts`) swaps schedulers
  live while `this.running` stays `true`, and is never routed through `transport.toggle()`; it
  only fires from the `polyrhythm.enabled` store subscription in `main.ts`. The practice timer
  (`pausePracticeTimer`/`resumePracticeTimer`/etc.) is driven entirely from `onToggle` inside
  `mountTransport`, which has no `polyrhythm.enabled` check anywhere. So toggling polyrhythm
  mid-play never pauses or stops the timer — **the practice timer already works correctly in
  polyrhythm**, exactly as the plan predicted.

### Commits this session (on top of Haiku's 4)

1. `Count bars (one A:B cycle each) in polyrhythm mode` — Task 3.
2. `Update FOLLOWUP.md` — this file (Task 4's last step).

### Not independently verified in a live browser/device this session

Per the plan's own instruction ("No browser or Playwright checks: the user tests on their
phone") and this session's explicit rules, nothing here was exercised live. **Phone checklist for
the user, covering all six tasks**:

- Song length dialog: the new hint text reads clearly; Apply closes the dialog immediately (no
  3s confirm wait) and the bar counter glows briefly.
- While stopped, the counter shows `Bar −/N` (and `Loop −/M` or `Loop ∞` when a loop count is
  set) instead of a bare `Bar −`.
- Setting Song length to 0 and Apply turns the target off, closes the dialog, shows plain `Bar −`.
- Applying a new length **while playing** doesn't restart or reset the current run — the counter
  just picks up the new total on the next bar.
- **The bar counter counts and stops correctly in polyrhythm** — one tick per full A:B cycle, not
  twice per cycle and not stuck. This is the main new-code path from this session; confirm it on
  a real phone.
- **The practice timer runs, pauses and resumes correctly in polyrhythm**, exactly like normal
  mode (reasoned through the code this session, not device-tested).
- The "i" info buttons and the tempo marking (e.g. "Moderato") now use an italic serif
  (EB Garamond), not the default sans font.
- Tapping an info "i" button opens a popup that **stays open** until: tapping its ✕, tapping
  outside it, or pressing Escape. Tapping the popup's own text no longer closes it (so it can be
  read/selected calmly).

### Standing instructions from previous sessions (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory.
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time.
- The user tests live on a physical Android phone (Chrome) against the dev server's Network URL
  (`http://<LAN-IP>:5173/`) while iterating.
- The 11 commits from an earlier worktree session (now part of `master`'s history) still carry
  `Co-Authored-By: Claude Sonnet 5` trailers — the user said they'll clean those up themselves
  later. Don't rewrite them unasked.

### Still open from earlier sessions (low priority, not scheduled)

- Wireframe blur batching, merged-node mute glow zeroed while split nodes damp to 25%, drawer
  node-style previews repaint while closed, `render()` unguarded on the constructor/ResizeObserver
  path, Tauri `security.csp: null` undocumented, English-only upload error strings, transient IDB
  failure permanently overwriting saved sound choice, Frosted paintMute flash ring drawn at the
  unswollen radius.
- Sprite-cache growth across window resizes, sub-pixel sprite blit softening,
  `AudioEngine.preview()` leaving the context running until next stop/start.
- At exactly 320px width, the header's Circle/Line `.seg` pill overflows past the intended right
  margin by ~32px in both languages.
- Subdivision-patterns session's 6 deferred minors (fan survives poly on/off round-trip, dialog
  toggle hit area 26px vs plan's "≥28px" text, etc.) — see that session's branch/history if still
  relevant; its own workspace file may already be gone.

## Android / Play Store (plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`)

Check the plan's own checkboxes rather than trusting this summary. Unchanged this session.

- Tasks 1-8 and 10 done. Task 8 Step 4 (real-device soak test) passed on 2026-09-29 on the
  user's Xiaomi Redmi Note 10 Pro with a sideloaded release-signed APK
  (`android/app-release-signed.apk`, gitignored). **No signed AAB exists yet** — build
  `bundleRelease` + jarsigner per `docs/architecture/platforms.md` before uploading. Build the AAB
  from `master`.
- Notifications are off (2026-09-29): `enableNotifications: false` in `twa-manifest.json` and
  `app/build.gradle`, `POST_NOTIFICATIONS` + `NotificationPermissionRequestActivity` removed from
  `AndroidManifest.xml` — matches the privacy policy's "no runtime permissions". The sideloaded
  test APK predates this; the AAB built next will include it.
- Play Console account: the user is opening a **personal** account around 2026-10-01/02, so the
  12-testers × 14-days closed-test rule applies. Testers are recruited by the user.
- Task 9: Step 2 (privacy policy) done; Steps 1, 3-7 open (account type, listing copy +
  screenshots, create app, upload AAB, closed testing, production). All Play Console UI — the
  agent has no access.
- After the first upload: add the **Play App Signing** SHA-256 as a second entry in
  `public/.well-known/assetlinks.json`, deploy, verify. Documented in `platforms.md`. Without it
  the Play-installed app shows Chrome's URL bar.

### Live

- `https://metronome-delta-gold.vercel.app/` (Vercel GitHub integration from `master`),
  `/.well-known/assetlinks.json`, `/privacy-policy.html`.

### Keystore — read before touching anything Android

`C:\Users\4D\Keystores\metronome\release.keystore`, alias `metronome`, PKCS12 (store password =
key password). Upload-key SHA-256 `6F:13:77:4F:…:46:E6` (full value in `assetlinks.json`). The
plaintext password backup file has been deleted by the user; the user signs builds themselves.
`android.keystore` in the same folder is dead (password lost) — ignore.

### Bubblewrap CLI is broken in this environment

`init` and `build` both fail here; drive Gradle / zipalign / apksigner / jarsigner directly per
`platforms.md`. Machine-local setup: `~/.bubblewrap/config.json` → JDK 17.0.1 +
`D:\Android\Sdk`, `build-tools;36.1.0` installed, `D:\Android\Sdk\bin` junction to
`cmdline-tools\latest\bin`.

## iOS

No native shell exists; iOS is reachable only as a Safari "Add to Home Screen" PWA, untested on
a real device. App Store presence is an **open architectural decision** (PWA only / Capacitor
with bundled assets (recommended) / Tauri 2 iOS / remote WKWebView wrapper). Hard prerequisites
the user doesn't have yet: a Mac with Xcode (or a cloud macOS build service), Apple Developer
Program membership.

## Next step

1. **This session's branch (`bar-counter-polish`) is unmerged.** User reviews/tests it on a real
   phone using the checklist above, then decides how to integrate (see
   `superpowers:finishing-a-development-branch` if asked).
2. Play Console (user, account opening ~2026-10-01/02): identity verification, store listing
   (512px icon, 1024×500 feature graphic, ≥2 phone screenshots, TR/EN short+long description),
   Data safety ("no data collected"), content rating, target audience 13+, no ads, no login.
3. Once the account exists: build the unsigned AAB (`gradlew bundleRelease`) from `master`, the
   user signs it with jarsigner, then uploads it to closed testing.
4. Right after the first upload, before inviting testers: Play App Signing fingerprint →
   `assetlinks.json`. The user must uninstall the sideloaded APK before installing from Play.
5. Help the user line up 12+ testers for the 14-day closed test.
6. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason. Per-level beat volume: three
independent 0-100% sliders with no ordering constraint, Medium keeps borrowing the Accent sound
buffer (no third sound slot), sliders live in the Sound dialog next to the sound picker each level
uses. Control hierarchy: BPM knob/Tap are primary, Signature/Sound secondary, everything else
(Theme/Beat sphere/2.5D/sync offset/Reset/Language) lives behind the ☰ side menu — no bottom tab
bar, no Settings dialog. Subdivision on/off pattern: on/off only (no levels), resets on any
signature/subdivision/reset-all change, edited from both the Signature dialog and the
visualiser, circle-view fan opens outward (not inward). Song length: Apply is instant (no confirm
gate), 0 = off; in polyrhythm one counter bar = one full A:B cycle.
