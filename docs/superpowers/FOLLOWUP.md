# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30)

`master` = `c6ec1b1`, unchanged this session. This session's work lives on local branch
`settings-to-header` (12 commits ahead of `master`, **not merged, not pushed**). No worktree is
open.

### Done this session

Implemented `docs/superpowers/plans/2026-09-30-settings-to-header.md` in full (the plan was
extended mid-flight — see its own "Status of earlier tasks" section), using the `executing-plans`
skill (inline, no worktree, per this repo's standing instructions below), on branch
`settings-to-header`:

- **Tasks 1-2** (earlier in the session, before the plan was extended): dimmed Signature/Sound's
  resting glow, kept Tap's fuller glow, moved Settings into the header as a gear icon (later
  superseded by Task 5).
- **Task 3** (`f43c724`, `aa043c1`): committed the pending `.title` font-size shrink
  (21px → 14.7px, user-approved on their phone earlier). Regrouped the panel into two balanced
  columns — **left = Timer + Tap**, **right = Signature + Sound** — and gave the practice timer
  its own `#practiceTimerDialog` / `src/ui/practiceTimerDialog.ts`, split out of the old
  `settingsDialog.ts`.
- **Task 4** (`91f4a8e`): moved Beats into the Signature dialog (`data-standard-block`, hides in
  Polyrhythm) and Volume + Vibrate into the Sound dialog (Volume as its first field, Vibrate above
  the drop zone).
- **Task 5** (`6d38011`): dissolved the Settings dialog entirely into a **☰ side menu**
  (`src/ui/menuDrawer.ts`, a `<dialog class="drawer">`) opened from a single `#menuBtn` in the
  header — the gear and the language globe both left the header. Fixed a bug Task 2 had introduced
  (`.icon-btn` collision between the header buttons and every dialog's ✕ close button) by renaming
  the header's rule to `.header-btn`.
- **Task 6**: verified with Playwright at 320/360/390/412px in English and Turkish, and the full
  acceptance walkthrough at 390px and 1024px desktop — drawer open/close (✕, backdrop, Esc,
  field-padding clicks don't close it, dragging the sync-offset slider doesn't close it), language
  switch, theme/beat-sphere/2.5D/sync-offset live-apply, two-tap Reset, panel row alignment
  (Timer/Signature and Tap/Sound line up at both 64px and 52px button sizes), Tap's stronger
  resting glow, Timer dialog start flow (0:30 practice timer, two-tap Start, ⏸⏹✕ appear top-left
  without covering the Timer button), Signature dialog's Beats field (visible in Standard, hidden
  in Polyrhythm), Sound dialog's Volume/Vibrate placement, every dialog's ✕ back to its
  pre-`8127427` look (34px, no pink tint), Circle/Line switch. **Left-swipe-to-close was initially
  checked with a mouse only** (Playwright's default input), which doesn't exercise touch-action or
  gesture handling at all — the final review (below) caught that this understated what was
  actually verified, and found a real bug underneath it.
- **Final review** (`314a448`): a fresh subagent (opus) reviewed the whole branch. Verdict "Ready
  to merge: with fixes" — 0 Critical, 1 Important, 6 Minor. Fixed the Important finding: swipe-to-
  close didn't work on touch devices because `touch-action: pan-y` sat on `.drawer`, but
  `.drawer-body` (the scrollable element) is the nearest scroll-container ancestor for any touch
  inside the drawer, so `.drawer`'s `touch-action` was never consulted — the browser claimed the
  gesture as its own scroll before `menuDrawer.ts`'s swipe handler could see it. Moved the
  declaration onto `.drawer-body`; verified under Playwright CDP touch emulation that swipe-close
  now works and the sync-offset slider still drags correctly without closing the drawer. Six Minor
  findings were deferred (dead `aria-expanded` CSS rule, `closeOnBackdropClick` also closing on a
  sheet's own padding — pre-existing on every `.sheet`, not just the drawer — untested Tauri
  `target="_blank"` behavior for the privacy link, missing `lang` attributes on the language chips,
  a duplicated "Practice timer" label, a stale code comment). Full findings and rulings in the
  ledger.
- **One finding, not fixed (reported here per the plan's own instruction rather than shrinking
  things further)**: at exactly **320px width**, the header's Circle/Line `.seg` pill (fixed
  168px) overflows past the intended right margin by ~32px (`segRight` 336 vs a 304px limit) —
  same in English and Turkish, so it's not a translation-length issue. `bar.scrollWidth >
  bar.clientWidth` reads `false` because the overflow is visual (flex children pushed past the
  container), not a scrollable overflow, so it wouldn't show up as a scrollbar — the "Line" label
  just gets visually clipped at the viewport edge. 360/390/412px all pass cleanly. This is a
  narrow-width tightness in `.seg`'s fixed width, not something this branch's changes made worse
  (the header actually has *less* content now: one ☰ button instead of gear+globe, and a smaller
  title). Left for the user to decide whether 320px (the narrowest Android/iPhone SE-class width)
  needs a fix, and if so whether `.seg` should shrink or the header should wrap.
- Where each old Settings-dialog control now lives: Theme/Beat sphere/2.5D knob/Visual sync
  offset/Reset → the ☰ drawer (`src/ui/menuDrawer.ts`). Language → the ☰ drawer (was the header
  globe + `src/ui/languageSwitch.ts`, now deleted). Beats → Signature dialog
  (`src/ui/signatureDialog.ts`). Volume + Vibrate → Sound dialog (`src/ui/soundDialog.ts`).
  Practice timer → its own Timer dialog (`src/ui/practiceTimerDialog.ts`), opened from the panel's
  new Timer button. The Settings dialog and its `#settingsBtn`/`settingsDialog.title` i18n keys no
  longer exist.
- A bottom tab bar is not planned — the ☰ drawer is the app's only "everything else" surface.
- Full decision ledger is at `.superpowers/sdd/2026-09-30-settings-to-header/progress.md`; delete
  that workspace once the branch is merged.

### Standing instructions from previous sessions (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory. (The `executing-plans`/`subagent-driven-development` skills default to worktrees —
  skip that step and just `git checkout -b` instead.)
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time.
- The 11 commits from an earlier worktree session (`65a8edb..339b714`, now part of `master`'s
  history) still carry `Co-Authored-By: Claude Sonnet 5` trailers — the user said they'll clean
  those up themselves later. Don't rewrite them unasked.
- The user tests live on a physical Android phone (Chrome) against the dev server's Network URL
  (`http://<LAN-IP>:5173/`) while iterating — expect mid-turn follow-up requests referencing
  screenshots from that phone. If the phone shows a broken/unstyled page, check the Playwright
  console for a Vite "504 Outdated Optimize Dep" error first (stale dep-cache after repeated
  dev-server restarts) — fix is `rm -rf node_modules/.vite` and a clean restart, not a code change.
- The Playwright MCP browser profile is shared across sessions and sometimes reports "Browser is
  already in use" — when that happens, ask the user to check on their phone via the dev server's
  Network URL instead of force-closing another session's browser.

### Still open from the 2026-09-29 performance/errors/platforms review (low priority, not scheduled)

Wireframe blur batching (one path instead of ~21 blurred ops per glowing node), merged-node mute
glow zeroed while split nodes damp to 25%, the drawer's node-style previews repaint on every store
change even while closed (same pre-existing pattern as the old Settings dialog), `render()` still
unguarded on the constructor/ResizeObserver path, Tauri `security.csp: null` undocumented,
English-only upload error strings (`validate.ts`/`importSound.ts`), transient IDB failure
permanently overwriting the saved sound choice (`main.ts` `applySound` fallback `store.set`),
Frosted paintMute flash ring drawn at the unswollen radius.

Still-deferred Phase A items: sprite-cache growth across window resizes, sub-pixel sprite blit
softening, `AudioEngine.preview()` leaving the context running until the next stop/start.

## Android / Play Store (plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`)

Check the plan's own checkboxes rather than trusting this summary.

- Tasks 1-8 and 10 done. Task 8 Step 4 (real-device soak test) passed on 2026-09-29 on the
  user's Xiaomi Redmi Note 10 Pro with a sideloaded release-signed APK
  (`android/app-release-signed.apk`, gitignored). **No signed AAB exists yet** — build
  `bundleRelease` + jarsigner per `docs/architecture/platforms.md` before uploading. Build the AAB
  from `master` after `settings-to-header` (and any other pending branches) are merged.
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
  `vercel` CLI login exists), `/.well-known/assetlinks.json`, `/privacy-policy.html`.

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

1. **User reviews `settings-to-header` on their phone** (Network URL): confirm swipe-to-close and
   the Back gesture both close the drawer (the swipe fix above was only verified with CDP touch
   emulation, not a real device), and decide whether the 320px `.seg` overflow (see "One finding,
   not fixed" above) needs a fix before merge.
2. Once satisfied, merge `settings-to-header` to `master` via
   `superpowers:finishing-a-development-branch` (or the user's own preferred flow) and delete
   `.superpowers/sdd/2026-09-30-settings-to-header/`.
3. Once merged and the Play Console account exists: build the unsigned AAB
   (`gradlew bundleRelease`), the user signs it with jarsigner in their own terminal, then uploads
   it to closed testing.
4. After upload: Play App Signing fingerprint → `assetlinks.json`.
5. Help the user line up 12+ testers for the 14-day closed test.
6. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason. Per-level beat volume: three
independent 0-100% sliders with no ordering constraint, Medium keeps borrowing the Accent sound
buffer (no third sound slot), sliders live in the Sound dialog next to the sound picker each level
uses. Control hierarchy: BPM knob/Tap are primary, Signature/Sound secondary, everything else
(Theme/Beat sphere/2.5D/sync offset/Reset/Language) lives behind the ☰ side menu — no bottom tab
bar, no Settings dialog.
