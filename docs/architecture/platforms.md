# Platforms

Metronome ships from one codebase to four targets: the dev server, a GitHub
Pages PWA, a Tauri Windows app, and an Android app (a Trusted Web Activity
wrapping the Vercel-hosted PWA). This is a runbook for each — build, deploy,
release — not a design document.

## The four targets

| Target | How it's built | Where it lives |
|---|---|---|
| Dev server | `npm run dev` | `http://localhost:5173` |
| GitHub Pages PWA | `GITHUB_PAGES=true npm run build` → `dist/` | `https://<user>.github.io/metronome/` |
| Tauri Windows app | `npm run tauri build` | NSIS installer in `src-tauri/target/release/bundle/nsis/` |
| Android TWA | Vercel hosts the PWA; Bubblewrap wraps it | Google Play, package `com.psymore.metronome` |

The GitHub Pages build sets `base: '/metronome/'` (`vite.config.ts`) because it
shares the `*.github.io` origin's root with other content. The Vercel build
must **never** set `GITHUB_PAGES=true` — that env var is reserved for the
GitHub Pages deploy, and a `/metronome/` base at the Vercel domain root would
break every asset path, which both the TWA and `/.well-known/assetlinks.json`
depend on being served from the true root.

## Why a TWA on Vercel, not Capacitor

The original plan chose Capacitor because a Trusted Web Activity needs
`/.well-known/assetlinks.json` served from the origin's own root, and the PWA
lived on `*.github.io` — a shared origin whose root isn't ours to serve from.
A Vercel project gets its own dedicated `<project>.vercel.app` origin (unlike
a GitHub Pages user/org site, nothing else is hosted at that origin's root),
so `assetlinks.json` is just a static file in `public/.well-known/`. That
removed the blocker, and a TWA is smaller and updates instantly via a normal
Vercel deploy — no new AAB, no Play review — for anything that isn't a
native-shell change (icon, package id, signing). The trade-off: Play's
"minimum functionality" review gives wrapped-website apps extra scrutiny, and
the TWA depends on Vercel staying up (mitigated by the PWA's existing offline
service worker, which works identically for the TWA since it's genuinely
Chrome loading the live site).

## No native-shell code for Android

`main.ts` and `platform.ts` are untouched by the Android work — a TWA needs no
JavaScript changes at all. Chrome is simply pointed at the real, deployed
site; service-worker registration behaves exactly as it does for any browser
visitor. The only platform guard in the codebase is the pre-existing Tauri
check, `'__TAURI_INTERNALS__' in window` (`src/main.ts`), which is unaffected.

Because of this, **content updates ship by deploying to Vercel** — a normal
`vercel --prod` deploy (or, with the GitHub integration, a push to `master`).
Only a *native-shell* change (icon, package id, signing key, `targetSdk`)
needs a new AAB built and uploaded to Play.

## Android release checklist

In order, for a native-shell change (a content-only change needs only the
first step):

1. Deploy content changes first, if any (push to `master`; Vercel's GitHub
   integration auto-deploys to production).
2. Confirm `https://metronome-delta-gold.vercel.app/.well-known/assetlinks.json`
   still resolves and validates:
   ```bash
   curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://metronome-delta-gold.vercel.app&relation=delegate_permission/common.handle_all_urls"
   ```
   An empty `{}` means the fingerprint, package name, or URL has drifted.
3. Build:
   ```bash
   cd android
   ./gradlew.bat assembleRelease   # APK, for local install/testing
   ./gradlew.bat bundleRelease     # AAB, for Play upload
   ```
   (`npx @bubblewrap/cli build` wraps the same two Gradle tasks plus signing,
   but see the note below on why this repo drives Gradle directly.)
4. Zipalign and sign the APK:
   ```bash
   "$ANDROID_HOME/build-tools/36.1.0/zipalign.exe" -v -p 4 \
     app/build/outputs/apk/release/app-release-unsigned.apk app-release-unsigned-aligned.apk
   "$ANDROID_HOME/build-tools/36.1.0/apksigner.bat" sign \
     --ks <keystore path> --ks-key-alias metronome \
     --ks-pass "pass:<password>" --key-pass "pass:<password>" \
     --out app-release-signed.apk app-release-unsigned-aligned.apk
   ```
5. Sign the AAB:
   ```bash
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
     -keystore <keystore path> app/build/outputs/bundle/release/app-release.aab metronome \
     -storepass <password> -keypass <password> -signedjar app-release-bundle.aab
   ```
6. Verify: `jarsigner -verify -verbose -certs app-release-bundle.aab` must print
   `jar verified.` and show the real signing certificate, not a debug one.
7. Test the release APK unplugged on a real device — install, run at a high
   BPM/beat-count for several minutes, and confirm the phone doesn't get hot
   (this is the actual test of the Phase A performance work). Confirm the
   wake lock holds past the display timeout, that backgrounding leaves the
   click still sounding (confirmed, intended behavior — nothing stops audio
   on `visibilitychange`; only the visualiser's render loop pauses), and that
   the app still loads and plays in airplane mode (the offline service
   worker).
8. Upload `app-release-bundle.aab` to the Play Console only if this is a
   native-shell change.

### A note on Bubblewrap's `build`/`init` commands in this environment

`npx @bubblewrap/cli build` failed in this repo's Windows dev environment: its
`JdkHelper.getEnv()` hardcodes the Windows PATH key as `'Path'`, but this
shell's inherited environment only carried `'PATH'` — the mismatch corrupts
the child process's PATH enough that even `cwd`-relative `gradlew.bat` becomes
invisible to `cmd.exe`. `npx @bubblewrap/cli init`'s wizard also uses
arrow-key list prompts that don't work reliably over non-interactive/piped
stdin. Both were worked around by driving the underlying tools directly —
`@bubblewrap/core`'s library functions for `init` (`TwaManifest.fromWebManifest`,
`TwaGenerator.createTwaProject`), and `gradlew`/`zipalign`/`apksigner`/`jarsigner`
directly for `build` (the exact sequence above, matching what Bubblewrap's own
source runs internally). If a future environment doesn't hit this PATH bug,
the plain `npx @bubblewrap/cli@1.25.0 build` / `init` commands should work as
documented upstream.

## The keystore

The signing keystore lives outside this repository, at a location the
developer chose and is responsible for backing up
(`C:\Users\4D\Keystores\metronome\release.keystore` on the machine this was
set up on — not portable to another machine without copying it there).
`.gitignore` excludes `android/*.keystore`, `android/keystore.properties`, and
`*.jks` so a keystore can never be accidentally committed even if generated
inside `android/`. It's a PKCS12 keystore (the modern `keytool` default),
which means the store password and key password are the same value — keytool
silently ignores a distinct key password if one is given.

**Losing this file, or its password, permanently ends the ability to publish
updates to the existing Play listing** under the same package identity;
Google cannot recover or reset it.

## Version floors

- Bubblewrap 1.25.0, requiring `build-tools;36.1.0` specifically (not just
  `36.0.0`).
- `compileSdkVersion` / `targetSdkVersion` must both be `36` — Google Play has
  required `targetSdk = 36` for new apps and updates since 2026-08-31.
- `com.psymore.metronome` is the application/package id on every platform
  (matches the existing Tauri identifier).

## The 12-testers/14-days rule

A **personal** Play Console account created **after 2023-11-13** must run a
closed test with at least 12 testers opted in continuously for 14 days, with
Google confirming those testers actually used the app, before production
access is granted. An **organisation** account, or a personal account created
**on or before 2023-11-13**, is exempt and can go straight to production.
Check which applies before promising a launch date.

## Performance invariants from Phase A

These must not be undone by future changes, Android or otherwise:

- The visualiser's `requestAnimationFrame` loop must stay gated on
  `document.hidden` (`src/viz/renderPolicy.ts`, wired into
  `src/viz/vizController.ts`) and must resume on `visibilitychange`.
- Idle beat nodes are drawn from cached sprites (`src/viz/nodeSprite.ts`), not
  painted live every frame. The cache must be invalidated whenever theme or
  device pixel ratio changes, or nodes keep the old look.
- `AudioEngine.stop()` must keep suspending the `AudioContext`
  (`src/engine/audioEngine.ts`) — a running context drains battery even in
  silence.
- The screen wake lock (`src/ui/wakeLock.ts`) guards against overlapping
  `request()` calls with a `pending` flag. Removing that guard reintroduces a
  lock leak that keeps the screen on after the metronome stops.
- `setTimeout`/`setInterval`/`requestAnimationFrame` never decide *when* a
  click sounds — only `AudioContext.currentTime` + `source.start(time)` via
  the scheduler does. Nothing about Android packaging changes this: the TWA
  runs the same Chromium/Blink/V8 engine as any other Chrome tab.
