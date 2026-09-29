# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-29)

`master` = `origin/master`, everything pushed; Vercel auto-deploys `master` to production. The
UI/UX redesign branch (`feat/ui-ux-redesign`) is merged into `master` — that thread is closed.

### Done this session

- A focused review (performance / error handling / platforms) —
  brief: `docs/superpowers/review-brief-2026-09-29-performance-errors-platforms.md`,
  fixes: `docs/superpowers/plans/2026-09-29-review-fixes.md` (all 8 tasks done, `4702ef9..1fa7e83`),
  plus a follow-up commit (`1db59e5`): `SPRITE_PAD` 8 → 12, error floor ignores Chrome's benign
  "ResizeObserver loop" error and doesn't toast before boot finishes.
- Net effect: polyrhythm nodes come from the sprite cache, a boot-failure screen + runtime error
  toast exist, PWA updates no longer reload mid-session, `createConicGradient` has a fallback
  (nodeStyleKit + knob), volume survives `recoverContext()`, fonts are self-hosted (privacy
  policy's "no third-party services / fully offline" claim is now true).

### Still open from that review (low priority, not scheduled)

Wireframe blur batching (one path instead of ~21 blurred ops per glowing node), merged-node mute
glow zeroed while split nodes damp to 25%, Settings node-style previews repaint on every store
change even while closed, `render()` still unguarded on the constructor/ResizeObserver path,
Tauri `security.csp: null` undocumented, English-only upload error strings
(`validate.ts`/`importSound.ts`), transient IDB failure permanently overwriting the saved sound
choice (`main.ts` `applySound` fallback `store.set`), Frosted paintMute flash ring drawn at the
unswollen radius, help text still says accent → normal → mute although `nextLevel` now cycles
mute → normal → accent.

Still-deferred Phase A items: sprite-cache growth across window resizes, sub-pixel sprite blit
softening, `AudioEngine.preview()` leaving the context running until the next stop/start.
(`SPRITE_PAD` tightness is fixed.)

## Android / Play Store (plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`)

Check the plan's own checkboxes rather than trusting this summary.

- Tasks 1-8 and 10 done. Task 8 Step 4 (real-device soak test) passed on 2026-09-29 on the
  user's Xiaomi Redmi Note 10 Pro with a sideloaded release-signed APK
  (`android/app-release-signed.apk`, gitignored). **No signed AAB exists yet** — build
  `bundleRelease` + jarsigner per `docs/architecture/platforms.md` before uploading.
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

1. Feature batch planned in `docs/superpowers/plans/2026-09-29-meter-engine-and-ui-polish.md`
   (11 tasks: compound-meter pulse, `medium` accent level + profiles, dialog/UI polish, one
   font). The user runs it with Sonnet; review the resulting commit range afterwards.
2. Once the Play Console account exists: build the unsigned AAB (`gradlew bundleRelease`), the
   user signs it with jarsigner in their own terminal, then uploads it to closed testing.
3. After upload: Play App Signing fingerprint → `assetlinks.json`.
4. Help the user line up 12+ testers for the 14-day closed test.
5. iOS: wait for the user's decision; don't start a wrapper unilaterally.

## Design decisions already settled — do not re-open

Foreground-only playback, TWA on Vercel (not Capacitor) for Android, Bubblewrap (not Tauri
Android), no new runtime dependencies without a strong reason.
