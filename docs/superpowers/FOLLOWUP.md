# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-30, later same day as the previous entry)

`master` = `origin/master` (`92407b5`), unchanged this session. This session's work lives on local
branch `per-level-beat-volume` (4 commits ahead of `master`, **not merged, not pushed**). No
worktree is open.

### Done this session

Implemented `docs/superpowers/plans/2026-09-30-per-level-beat-volume.md` in full, using the
`executing-plans` skill (inline, no worktree — see standing instructions below), on branch
`per-level-beat-volume`:

- **Task 1** (`eb554d6`): `accentGain`/`mediumGain`/`normalGain` added to `Settings`
  (`src/state/settings.ts`), defaults 1/0.6/1 (matches the old hardcoded mix exactly), clamped in
  `sanitizeSettings` the same way `volume` is.
- **Task 2** (`a8b5bf6`): `AudioEngine.playBeat` (`src/engine/audioEngine.ts`) now routes accent
  and normal beats through a `GainNode` too (previously a direct source→master connect), all three
  levels read their gain from new `setAccentGain`/`setMediumGain`/`setNormalGain` instance setters
  (mirrors the existing `setVolume` pattern). `main.ts` pushes settings changes into the engine the
  same way it already does for `volume`. `playPolyBeat` untouched (out of scope per the plan).
- **Task 3, reworked mid-review**: originally built as three sliders in the Settings dialog
  (`b2b7edf`), per an executor ruling that picked one of the plan's two open-question options. The
  user then asked (outside the plan, after seeing that layout) to move them into the **Sound**
  dialog instead, next to the sound each level uses. Confirmed via `AskUserQuestion` where Medium's
  slider should go (no sound picker of its own — it borrows the Accent buffer): user chose "own
  separate row" over "grouped under Accent's slider". Final layout (`eb7f4d7`): Accent's slider
  under the Accent sound picker, Normal's under the Other-beats picker, Medium as its own labelled
  row ("Uses the Accent sound") between them. `updateRangeFill` moved from `settingsDialog.ts` to
  the shared `ui/dom.ts` so both dialogs use it; `soundDialog.ts`'s render is split into
  `renderGains()`/`render()` so a slider drag doesn't rebuild the sound `<select>`s on every tick.
  Settings dialog no longer has these sliders at all.
- **Final review**: dispatched a fresh `general-purpose` subagent (model: opus) against the
  pre-rework diff. Verdict "Ready to merge: with fixes" — 0 Critical, 1 Important, 7 Minor. Fixed:
  strengthened `settings.ts`'s "keeps valid values" test with distinct non-default gains (the old
  test couldn't have caught a copy-paste mistake between the three `clampNumber` calls); added
  `aria-label`s to the new range inputs. Ruled as out-of-scope-for-this-plan and left as-is:
  `playSubdivision`'s fixed `0.4` gain ignoring `normalGain` (only `playBeat` was in scope), no
  polyrhythm-mode hint on the sliders (polyrhythm is explicitly out of scope), the
  `store.set({[key]: ...})` cast pattern (matches existing `soundDialog.ts` precedent). Deferred as
  minor: "Medium volume" label wording, `#volumeInput`/`#offsetInput` still lacking `aria-label`
  (pre-existing, untouched), doc staleness (this file, now refreshed).
- **Outstanding before merge — the plan's own Final Check step, not yet done**: nobody has actually
  *listened* to the change. `npx tsc --noEmit`, `npx vitest run` (218/218), `npm run lint`, and
  `npm run build` all pass, and a Playwright session confirmed the UI/store/persistence behave
  correctly (defaults, moving sliders, a deliberately "backwards" Normal-louder-than-Accent mix
  without the UI fighting it) — but this agent has no audio output. **The user needs to, on a
  cleared-`localStorage` install: confirm it sounds identical to before this branch, then confirm
  Accent/Medium/Normal are each audibly distinct and independently adjustable.**
- Mid-session correction, worth flagging: this agent added `Co-Authored-By` trailers to the first
  4 commits despite this repo's own standing no-attribution instruction (below, and in this agent's
  memory) — caught before anything was pushed and fixed via `git filter-branch` (all 4 commits were
  local-only, safe to rewrite; new SHAs are the ones listed above). If a fresh session finds itself
  about to commit here, double-check CLAUDE.md/this file's standing instructions against whatever
  the harness's own attribution reminder says — the repo's own instruction wins.
- Full decision ledger (including all rulings and their reasoning) is at
  `.superpowers/sdd/2026-09-30-per-level-beat-volume/progress.md`; delete that workspace once the
  branch is merged.

### Standing instructions from previous sessions (apply going forward)

- **Never work in a git worktree for this project.** Use plain local branches in the main working
  directory. (The `executing-plans`/`subagent-driven-development` skills default to worktrees —
  skip that step and just `git checkout -b` instead.)
- **Never add `Co-Authored-By` or any attribution line to any commit in this repo**, overriding
  the harness's default attribution reminder. This is standing, not one-time. (See the correction
  noted above — this was nearly violated this session.)
- The 11 commits from an earlier worktree session (`65a8edb..339b714`, now part of `master`'s
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
  `bundleRelease` + jarsigner per `docs/architecture/platforms.md` before uploading. Build the AAB
  from `master` after this session's branch is merged (not yet, as of this entry).
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

1. **User does the audible Final Check** on branch `per-level-beat-volume` (see "Outstanding
   before merge" above), then this branch merges to `master` via
   `superpowers:finishing-a-development-branch` (or the user's own preferred flow) and
   `.superpowers/sdd/2026-09-30-per-level-beat-volume/` gets deleted.
2. Once merged and the Play Console account exists: build the unsigned AAB
   (`gradlew bundleRelease`), the user signs it with jarsigner in their own terminal, then uploads
   it to closed testing.
3. After upload: Play App Signing fingerprint → `assetlinks.json`.
4. Help the user line up 12+ testers for the 14-day closed test.
5. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason. Per-level beat volume: three
independent 0-100% sliders with no ordering constraint, Medium keeps borrowing the Accent sound
buffer (no third sound slot), sliders live in the Sound dialog next to the sound picker each level
uses (not Settings) — see this entry's "Done this session" for the exact layout.
