# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30)

`master` is merged with the meter-engine-and-ui-polish batch (fast-forward, `fd0bbf4..b97b3c6`)
but **not yet pushed** — `origin/master` is still at `fd0bbf4`. Vercel auto-deploys `master` on
push, so production still runs the pre-batch build until someone pushes. No worktree is open.

### Done this session

- Plan `docs/superpowers/plans/2026-09-29-meter-engine-and-ui-polish.md`, all 12 tasks (Task 12,
  the themed sound picker, was added this session — see its own section in the plan file).
  Tasks 1-11 were implemented in an earlier session inside a git worktree; that worktree and its
  branch were deleted this session per the user's standing instruction below, after preserving
  its 11 commits by branching `feat/meter-engine-and-ui-polish` from the worktree branch's tip
  before deleting it. Task 12 was implemented directly on that branch, no worktree. A fresh-context
  review (Opus subagent, isolated worktree) found 1 Critical + 2 Important; all three fixed and
  verified this session (`b97b3c6`). 9 Minor findings deferred — see the deleted plan workspace's
  ledger content, now folded into commit `b97b3c6`'s message and this file if you need the list
  again later; the short version: polyrhythm trigger label can go stale on a decode-failure
  fallback, sound-picker a11y polish (accessible name, arrow-key nav, focus-on-open), signature
  card column width off by a few px at 320px, merged-vs-split polyrhythm node color for `medium`,
  a legacy-data `levels` fallback edge case, re-selecting the active signature resets custom
  accents, bar-counter lower-half double border in some themes, and an undisconnected
  MutationObserver in `soundPicker.ts` (harmless at today's 4-call-sites scale).
- Net effect: BPM now means the felt beat in compound meters (6/8/9/8/12/8 pulse at BPM/3 per
  eighth, not once per bar-beat), a `medium` accent level with automatic grouping (H-L-L-M-L-L for
  6/8, etc.), a themed popover replaces all 4 native `<select>` sound pickers (no more OS-native
  white list on mobile), one font (Inter) everywhere, and a batch of dialog/CSS polish (subdivision
  badge, practice-timer-style +/- pickers everywhere, merged Beats+Note-value card, bar-counter
  panel-attachment, bigger BPM nudge LCD, no press-scale on Circle/Line tabs).

### Standing instructions from this session (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory. (The `executing-plans`/`subagent-driven-development` skills default to worktrees —
  skip that step and just `git checkout -b` instead.)
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time.
- The 11 commits from the earlier worktree session (`65a8edb..339b714`, now part of `master`'s
  history) still carry `Co-Authored-By: Claude Sonnet 5` trailers — the user said they'll clean
  those up themselves later. Don't rewrite them unasked.

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
  should be built from `master` *after* it's pushed and includes this session's batch.
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
  `vercel` CLI login exists), `/.well-known/assetlinks.json`, `/privacy-policy.html`. Still
  serving the pre-batch build until `master` is pushed.

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

1. Push `master` (`fd0bbf4..b97b3c6`) when the user is ready — ask first, it's a visible/shared
   action. Vercel will pick it up automatically.
2. Once the Play Console account exists: build the unsigned AAB (`gradlew bundleRelease`), the
   user signs it with jarsigner in their own terminal, then uploads it to closed testing.
3. After upload: Play App Signing fingerprint → `assetlinks.json`.
4. Help the user line up 12+ testers for the 14-day closed test.
5. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason.
