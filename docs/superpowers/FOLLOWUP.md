# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30)

`master` = `origin/master` (`92407b5`), pushed; Vercel auto-deploys `master` to production. No
worktree is open.

### Done this session

- Plan `docs/superpowers/plans/2026-09-29-meter-engine-and-ui-polish.md`, all 12 tasks (Task 12,
  the themed sound picker, was added this session — see its own section in the plan file).
  Tasks 1-11 were implemented in an earlier session inside a git worktree; that worktree and its
  branch were deleted this session per the standing instructions below, after preserving its 11
  commits by branching `feat/meter-engine-and-ui-polish` from the worktree branch's tip before
  deleting it. Task 12 was implemented directly on that branch, no worktree. A fresh-context
  review (Opus subagent, isolated worktree) found 1 Critical + 2 Important; all three fixed and
  verified (`b97b3c6`). 9 Minor findings deferred: polyrhythm trigger label can go stale on a
  decode-failure fallback, sound-picker a11y polish (accessible name, arrow-key nav, focus-on-open),
  signature card column width off by a few px at 320px, merged-vs-split polyrhythm node color for
  `medium`, a legacy-data `levels` fallback edge case, re-selecting the active signature resets
  custom accents, bar-counter lower-half double border in some themes, an undisconnected
  MutationObserver in `soundPicker.ts` (harmless at today's 4-call-sites scale).
- After that merge, a second round of live phone-testing feedback (Chrome on Android, against the
  dev server) produced three more commits, all pushed:
  - `2bfd48e` — Beats/Layer A/Layer B/Song length pickers become real
    `<input type="number" inputmode="numeric">` (tap opens the device numeric keyboard) flanked by
    −/+ buttons in one row (new `.num-picker--row`), instead of a plain `<output>` only movable by
    the buttons. The Beats+Note-value card drops from 3 grid columns to 2 (Note value now stacks
    below Beats in the same column). Also lengthened the BPM knob's rotating indicator tick ~1.5x.
  - `5ccf381` — Volume and Visual-sync-offset sliders get a real left-filled/right-empty progress
    track in Chrome/WebKit (via a JS-set `--range-fill` custom property feeding a
    `::-webkit-slider-runnable-track` gradient — Firefox already had this via
    `::-moz-range-progress`). Their "80%"/"0 ms" readouts become small tappable number inputs too
    (new `.field-value`/`.field-value-input`). Note-value chips go back to one row instead of a 2x2
    grid. Layer A/B's sound-trigger row gets a top margin so it doesn't look glued to the count
    stepper. The language-switch button's idle state gets a subtle border like the panel buttons,
    no box-shadow until pressed.
  - `92407b5` — **Not implemented**, just a plan document:
    `docs/superpowers/plans/2026-09-30-per-level-beat-volume.md`. Written after a brainstorm with
    the user about giving Accent/Medium/Normal beat levels their own adjustable volume (medium's
    gain is currently a hardcoded `0.6` in `audioEngine.ts`'s `playBeat`). Settled: three fully
    independent 0–100% sliders (no ordering constraint — user explicitly declined a
    accent≥medium≥normal clamp), no new sound slots (medium keeps borrowing the accent buffer),
    defaults matching today's hardcoded mix exactly so nothing changes until a user touches a
    slider. Polyrhythm is out of scope (no beat-level concept there). **Open question the plan
    itself flags**: whether the 3 sliders live in the Sounds dialog or the Settings dialog's beat
    row — not decided, note the choice in the plan's ledger when it's picked up.
- Net effect of the whole session: BPM now means the felt beat in compound meters (6/8/9/8/12/8
  pulse at BPM/3 per eighth), a `medium` accent level with automatic grouping (H-L-L-M-L-L for
  6/8, etc.), a themed popover replaces all 4 native `<select>` sound pickers, one font (Inter)
  everywhere, every dialog's numeric picker is now directly typeable, both sliders in Settings show
  a real fill, and a batch of smaller CSS/UX polish.

### Standing instructions from this session (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory. (The `executing-plans`/`subagent-driven-development` skills default to worktrees —
  skip that step and just `git checkout -b` instead.)
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time.
- The 11 commits from the earlier worktree session (`65a8edb..339b714`, now part of `master`'s
  history) still carry `Co-Authored-By: Claude Sonnet 5` trailers — the user said they'll clean
  those up themselves later. Don't rewrite them unasked.
- The user tests live on a physical Android phone (Chrome) against the dev server's Network URL
  (`http://<LAN-IP>:5173/`) while iterating — expect mid-turn follow-up requests referencing
  screenshots from that phone. If the phone shows a broken/unstyled page, check the Playwright
  console for a Vite "504 Outdated Optimize Dep" error first (stale dep-cache after repeated
  dev-server restarts) — fix is `rm -rf node_modules/.vite` and a clean restart, not a code change.

### Still open from the 2026-09-29 performance/errors/platforms review (low priority, not scheduled)

Wireframe blur batching (one path instead of ~21 blurred ops per glowing node), merged-node mute
glow zeroed while split nodes damp to 25%, Settings node-style previews repaint on every store
change even while closed, `render()` still unguarded on the constructor/ResizeObserver path,
Tauri `security.csp: null` undocumented, English-only upload error strings
(`validate.ts`/`importSound.ts`), transient IDB failure permanently overwriting the saved sound
choice (`main.ts` `applySound` fallback `store.set`), Frosted paintMute flash ring drawn at the
unswollen radius.

Still-deferred Phase A items: sprite-cache growth across window resizes, sub-pixel sprite blit
softening, `AudioEngine.preview()` leaving the context running until the next stop/start.

## Android / Play Store (plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`)

Check the plan's own checkboxes rather than trusting this summary.

- Tasks 1-8 and 10 done. Task 8 Step 4 (real-device soak test) passed on 2026-09-29 on the
  user's Xiaomi Redmi Note 10 Pro with a sideloaded release-signed APK
  (`android/app-release-signed.apk`, gitignored). **No signed AAB exists yet** — build
  `bundleRelease` + jarsigner per `docs/architecture/platforms.md` before uploading. That AAB
  should be built from current `master` (already includes this session's whole batch, pushed).
- Notifications are off (2026-09-29): `enableNotifications: false` in `twa-manifest.json` and
  `app/build.gradle`, `POST_NOTIFICATIONS` + `NotificationPermissionRequestActivity` removed from
  `AndroidManifest.xml` — matches the privacy policy's "no runtime permissions". The sideloaded
  test APK predates this; the AAB built next will include it. Web-side feature fixes don't need a
  new AAB (the TWA loads live content from Vercel); only native-shell changes do.
- Play Console account: the user is opening a **personal** account around 2026-10-01/02, so the
  12-testers × 14-days closed-test rule applies. Testers are recruited by the user (Play doesn't
  supply them).
- Task 9: Step 2 (privacy policy) done; Steps 1, 3-7 open (account type, listing copy +
  screenshots, create app, upload AAB, closed testing, production). All Play Console UI —
  the agent has no access.
- After the first upload: add the **Play App Signing** SHA-256 (*App integrity → App signing key
  certificate*) as a second entry in `public/.well-known/assetlinks.json`, deploy, verify.
  Documented in `platforms.md`. Without it the Play-installed app shows Chrome's URL bar.

### Live

- `https://metronome-delta-gold.vercel.app/` (Vercel GitHub integration from `master`; no local
  `vercel` CLI login exists), `/.well-known/assetlinks.json`, `/privacy-policy.html`. Now serving
  this session's whole batch once Vercel's build finishes.

### Keystore — read before touching anything Android

`C:\Users\4D\Keystores\metronome\release.keystore`, alias `metronome`, PKCS12 (store password =
key password). Upload-key SHA-256 `6F:13:77:4F:…:46:E6` (full value in `assetlinks.json`). The
plaintext password backup file has been deleted by the user; the user signs builds themselves in
their own terminal (`! apksigner …` / `! jarsigner …`) so the agent never sees the password.
`android.keystore`
in the same folder is dead (password lost) — ignore. Losing `release.keystore` or its password
ends the ability to update the Play listing.

### Bubblewrap CLI is broken in this environment

`init` (arrow-key prompts) and `build` (Windows `Path` env bug) both fail here; drive Gradle /
zipalign / apksigner / jarsigner directly per `platforms.md`. Machine-local setup:
`~/.bubblewrap/config.json` → JDK 17.0.1 + `D:\Android\Sdk`, `build-tools;36.1.0` installed,
`D:\Android\Sdk\bin` junction to `cmdline-tools\latest\bin`.

## iOS

No native shell exists; iOS is reachable only as a Safari "Add to Home Screen" PWA, untested on
a real device. App Store presence is an **open architectural decision** (options laid out in the
2026-09-29 review: PWA only / Capacitor with bundled assets (recommended) / Tauri 2 iOS / remote
WKWebView wrapper). Hard prerequisites the user doesn't have yet: a Mac with Xcode (or a cloud
macOS build service), Apple Developer Program membership.

## Next step

1. Pick up `docs/superpowers/plans/2026-09-30-per-level-beat-volume.md` in a fresh Sonnet session
   (the user's plan for this handoff) — resolve its one open question (Sounds dialog vs. Settings
   dialog placement) before or during Task 3, then execute per the plan's own task breakdown.
2. Once the Play Console account exists: build the unsigned AAB (`gradlew bundleRelease`), the
   user signs it with jarsigner in their own terminal, then uploads it to closed testing.
3. After upload: Play App Signing fingerprint → `assetlinks.json`.
4. Help the user line up 12+ testers for the 14-day closed test.
5. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason.
