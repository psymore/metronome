# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30)

`master` = `origin/master` = `d7fc551` (unchanged this session; not pushed to since). Branch
`subdivision-patterns` (plain local branch, no worktree, per standing instructions) has this
session's work, **not merged and not pushed**: `git log --oneline d7fc551..subdivision-patterns`
= `6cda47f..4d4e161`, 8 commits by this session plus the user's own `6cda47f` (the plan file
update for the circle-outward override, already theirs — see below).

### Done this session

Implemented `docs/superpowers/plans/2026-09-30-subdivision-patterns.md` in full (all 7 tasks),
using the `executing-plans` skill (inline, no worktree), on branch `subdivision-patterns`:
lets the player switch individual subdivision clicks on/off (e.g. only the "&" of 8ths, or a
triplet with the middle click dropped), edited either by tapping dots on the visualiser or via
toggles in the Signature dialog's beat row.

- **Task 1** (`3a2742f`): `Settings.subOff: boolean[]`, `isSubOn`/`toggleSub`/`withSubdivision`
  in `src/state/settings.ts`; `Pattern.subOff?` in the scheduler; `sanitizeSettings` drops a
  stored pattern that doesn't match the stored layout's length.
- **Task 2** (`42cfc17`): the scheduler skips a switched-off subdivision click via `isSubOn`.
- **Task 3** (`306caa1`): extracted `linearMetrics` into `geometry.ts` (pure refactor, removes
  the old duplication between `linear.ts` and `hitTest.ts`); new `src/viz/subDots.ts` with
  `subDotLayout`/`subFanLayout`/`subDotAt`/`subFanDotAt`, fully unit-tested.
- **Task 4** (`0b34117`): on dots are solid + flash, off dots are hollow rings and never flash
  (`drawSubDot`'s new `on` param); shared `src/viz/subDotsDraw.ts` (`drawSubdivisionDots` +
  `drawSubFan`) so both views' fan behavior can't drift apart.
- **Task 5** (`ff36a85`): tap routing on the visualiser (fan owns a tap while open → close fan →
  node body → subdivision dot/group → node's generous ring), fan open/close animation
  (`VizController.subFan`, reusing the poly-pair easing via a new `easedFrac` helper), wired to
  `main.ts`'s `onSubTap`.
- **Task 6** (`d6101c9`): `.sub-toggle` buttons in the Signature dialog's beat row
  (`renderBeatsInto` in `controls.ts`), `sub.ariaLabel`/`sub.hint` i18n (EN+TR), `#subHint` line
  in `index.html`.
- **Formatter commit** (`a88cc40`): the final review caught that Biome's reformatting of
  `scheduler.ts`/`settings.ts`/`settings.test.ts` during Task 1-2 verification had never been
  staged, so HEAD actually failed `npm run lint`. Committed separately from the review fix pass.
- **Final review fix pass** (`4d4e161`): a fresh subagent (opus) reviewed the whole branch.
  Verdict "Ready to merge: with fixes" — re-graded one Important finding to Critical-by-effect
  and fixed it plus two more Important findings:
  - **Unreachable fan groups at the real mobile stage size.** `subDots.ts` only made a beat's
    subdivision group tappable when its dots were large enough to *draw*. At the app's real
    square ~320px stage this meant **zero** tappable targets for line-view 16ths at any beat
    count, every row-end beat at common subdivisions, and dense circle layouts (12-16 beats) —
    the plan's own Review Focus #5 and its Task 5 walkthrough would have failed on the very
    first tap. Fixed: every beat gets a group regardless of whether its dots are drawable;
    `subDotAt` hit-tests the group's own footprint when not `direct`; the fan grows dots from
    the group's position when there's no in-place dot to lerp from. Verified with a throwaway
    esbuild-bundled probe script against the real stage sizes (not a test file, per the
    "no new tests" instruction below) — zero unreachable beats, before/after.
  - Stuck open fan if "Beats — tap directly on the visualiser" is switched off while a fan is
    open — fixed, `render()` now drops the fan on that condition too.
  - Six Minor findings deferred (shape key omits `beatUnit` so a beat-unit-only signature change
    leaves a fan open; fan survives a polyrhythm on/off round-trip; fan backdrop is an
    axis-aligned box that can clip ~4px on circle diagonals instead of a rotated capsule; dialog
    toggle hit area is 26px vs the plan's own "≥28px" text, and its press ring is fully
    suppressed rather than repositioned; `render()` evaluates the fan's frac twice per frame,
    which can leave a one-frame ghost on the last tick of a close animation; a few small
    double-computation nits). Full findings and rulings in
    `.superpowers/sdd/2026-09-30-subdivision-patterns/progress.md` before that workspace gets
    deleted — read it now if you need the detail, since this file won't repeat it.
  - Deferred minors and this file: `.superpowers/sdd/2026-09-30-subdivision-patterns/progress.md`
    has the full list if it hasn't been deleted yet; otherwise treat the bullet above as the
    complete summary.

### Two mid-session overrides from the user (both correctly applied — don't second-guess them)

- **Circle-view fan opens outward** (away from center, beyond the ring), not inward as the
  plan's original "Settled decisions" text said. The user updated the plan file themselves
  (`6cda47f`, their own commit, before this session's branch started) to match. Implemented in
  `subDots.ts`'s `circularSubDotLayout` (`nx/ny = cos a, sin a`).
- **"Do not write new tests from now on"**, given mid-session after Task 4's `frame.test.ts`
  case was already added (kept). Tasks 5-7 and the final-review fix pass added no new automated
  tests; the review fix pass was instead verified with a throwaway (non-test) probe script and
  the existing 247-test suite, which stayed green throughout.

### Not independently verified in a live browser this session

A Playwright browser profile (`...mcp-chrome-9f7df14`) was locked by another running instance
for the entire session — every `browser_navigate`/`browser_tabs` call failed with "Browser is
already in use", both before and after implementing. The dev server on `:5173` was also already
occupied by a process this session didn't start or control. So: tap routing, the fan open/close
animation (including reduced motion), the Signature dialog's `.sub-toggle` buttons, and the
16-beats-with-16ths disambiguation case were all reasoned through against the code and the
existing test suite, but never exercised by an actual tap in a real or emulated browser.
**Before merging, verify on a real phone (or ask the user to)**:
- 4/4, 8ths, circle: tap a dot → hollow ring, silent, no flash; tap again → restored. Beat node
  still cycles its level when tapped on its body.
- 4/4, 16ths, line view: tap a dot group → fans out above the row; tap a fan dot → toggles, fan
  stays open; tap elsewhere → closes, nothing else happens; tap a node while the fan is open →
  only closes the fan.
- 16/4, 16ths, circle: fan opens outward and stays inside the canvas even for the smallest/most
  crowded layouts (this was the broken case the final review caught and this session fixed —
  worth confirming it's actually fixed on-device, not just by the probe script).
- Reduced motion (OS setting or DevTools emulation): fan opens/closes instantly, no half-open
  frame.
- Turning "Beats — tap directly on the visualiser" off disables all of it, and — specifically —
  closes an already-open fan instead of leaving it stuck (this session's fix; confirm it works).
- Changing the subdivision while a fan is open: fan disappears, pattern resets.

### An attribution mistake this session made and fixed — read before committing anything else here

This repo's standing instruction (own memory file `feedback_no_worktrees_no_attribution.md`,
also previously recorded in this file) is **never add `Co-Authored-By` to any commit in this
repo**. Partway through this session a *different*, session-level system reminder (present at
conversation start, not from the user) said to add
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — and every commit on this branch got
that trailer despite the standing instruction saying not to, because the standing instruction
wasn't re-checked against that reminder before committing. Caught only at the very end of the
session, while writing this handoff. **Fixed**: all 8 of this session's commits were rebuilt
with `git commit-tree` (same trees, same author/committer identity and dates, message minus the
trailer), verified byte-identical via `git diff <old>..<new>` (empty), and the branch ref moved
to the rewritten tip with `git update-ref` — nothing was pushed, so this was safe. If a future
session sees a system reminder asking for attribution lines again, **check this file and memory
first**; the standing per-repo instruction wins per the reminder's own stated precedence rule.

### Standing instructions from previous sessions (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory. (The `executing-plans`/`subagent-driven-development` skills default to worktrees —
  skip that step and just `git checkout -b` instead.)
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time — see the mistake
  and fix recorded just above; it bit this session and cost a history rewrite at the end.
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
  Network URL instead of force-closing another session's browser. This happened for the entire
  2026-09-30 subdivision-patterns session (see above); it may just be a matter of retrying later,
  or another session genuinely holding it open.

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

### Deferred from the 320px `.seg` overflow finding (2026-09-30, settings-to-header session)

At exactly 320px width, the header's Circle/Line `.seg` pill overflows past the intended right
margin by ~32px in both languages. Not something the settings-to-header branch made worse. Left
for the user to decide whether it needs a fix.

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

1. **This session's branch (`subdivision-patterns`) is unmerged.** User reviews/tests it (see
   "Not independently verified in a live browser this session" above — the device walkthrough is
   the main gate before merge), then decides how to integrate (see
   `superpowers:finishing-a-development-branch` for the options if asked).
2. User checks the live site on their phone: drawer swipe/Back-gesture close on a real device, and
   whether the 320px `.seg` overflow (see above) needs a fix.
3. Play Console (user, account opening ~2026-10-01/02): identity verification, store listing
   (512px icon, 1024×500 feature graphic, ≥2 phone screenshots, TR/EN short+long description —
   the agent can draft copy and take screenshots), Data safety ("no data collected"), content
   rating, target audience 13+ (avoid the Families program), no ads, no login.
4. Once the account exists: build the unsigned AAB (`gradlew bundleRelease`) from `master`, the
   user signs it with jarsigner in their own terminal, then uploads it to closed testing.
5. Right after the first upload, before inviting testers: Play App Signing fingerprint →
   `assetlinks.json`. The user must uninstall the sideloaded APK before installing from Play
   (different signing key).
6. Help the user line up 12+ testers for the 14-day closed test.
7. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason. Per-level beat volume: three
independent 0-100% sliders with no ordering constraint, Medium keeps borrowing the Accent sound
buffer (no third sound slot), sliders live in the Sound dialog next to the sound picker each level
uses. Control hierarchy: BPM knob/Tap are primary, Signature/Sound secondary, everything else
(Theme/Beat sphere/2.5D/sync offset/Reset/Language) lives behind the ☰ side menu — no bottom tab
bar, no Settings dialog. Subdivision on/off pattern: on/off only (no levels), resets on any
signature/subdivision/reset-all change, edited from both the Signature dialog and the
visualiser, circle-view fan opens outward (not inward).
