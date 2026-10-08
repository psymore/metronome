# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step"
immediately.

## Where things stand (2026-10-08, evening)

Everything is **committed** on `master`, nothing is pushed yet, and the working tree is clean:

- `472b10f` Icon: metal play triangle, black launcher backing, brighter launcher knob.
- `527298d` Sound previews and presets, boot-screen knob with a 142 BPM loop, metal LCD face
  (sound picker play buttons, six presets in `src/sounds/presets.ts`, the boot-screen loop
  `public/boot-loop.mp3`, dark brushed-metal LCD on the in-app knob). `npm run build` passed
  before the commit; the sound previews still await the user's phone review.

Cleanup on 2026-10-08: removed root-level screenshots, `.playwright-mcp/`, the 2026-09-29 release
APKs in `android/` (outputs of the documented release steps), `cloud-patches/` (every patch was
already in history) and `.superpowers/`. Kept `.env.local`, `.vercel/` and build outputs.

### App icon: what shipped in the commit

- `public/icon.svg`: knob with gear teeth, dark metallic LCD, and only a play glyph in the centre
  (no BPM digits). The glyph keeps its `M238 224V288L292 256Z` geometry but is a green metal
  gradient lit from the top right. Never change the in-app knob (`src/ui/knob.ts`) for icon work.
- Android launcher icon is a real adaptive icon: `@color/iconBackground` (`#000000`) + knob
  foreground inside the 66dp safe zone. Launcher icons only (adaptive foreground + legacy
  `ic_launcher.png`) get a stronger mint halo (0.7/0.3) and lifted colours
  (`modulate({ brightness: 1.22, saturation: 1.15, lightness: 4 })`) so they read on dark home
  screens. Splash, Play `store_icon.png`, PWA and Tauri icons keep the original tones. The unused
  `ic_maskable` mipmaps are gone.
- Regenerate all icons after editing `public/icon.svg`: `npm run generate-pwa-assets`,
  `npx tauri icon public/icon.svg`, `node scripts/android-icons.cjs`. The script reproduces the
  installed build's 18 Android/Play/splash files byte-for-byte. Bubblewrap project regeneration
  would overwrite `ic_launcher.xml` and the icons: re-run the script afterwards.
- Debug builds install next to the Play app as `com.psymore.metronome.test` ("Metronome Test",
  `android/app/build.gradle`). The current debug build (19:51) is on the test phone.

### App icon: what we learned on the test phone

Test phone: Redmi Note 10 Pro (M2101K6G), MIUI 14 `V14.0.2.0.TKFTRXM`, Android 13, launcher
`com.miui.home` 4.39.7.

- Android paints adaptive layers over **black** (`AdaptiveIconDrawable.draw()`), so a transparent
  background shows black on every launcher; the background layer must be opaque.
- The launcher, not the app, picks the icon shape. MIUI 14's default theme masks layered icons
  with a squircle. The phone's earlier 2022 theme had no layered-icon support: it flattened every
  app it had no hand-drawn PNG for onto a small square tile, and its hand-drawn round Instagram PNG
  was why Instagram looked round. The user switched to the default theme at 17:57.
- `roundIcon` is ignored on this phone (`config_useRoundIcon = false`); MIUI uses the anydpi-v26
  adaptive XML, not the legacy PNG.
- The phone also has a Chrome-installed PWA called "Metronome" (WebAPK, 2026-10-01) with the old
  icon. It refreshes only after the new web icons are deployed and Chrome updates it.
- Review page with before/after renders: https://claude.ai/artifact/SF4kWPfvwVYkQzDkzUEiLM

### Earlier follow-ups still open

- **Phone check of the light theme beats** (ink ladder, hit lift).
- **Phone checks:** +/- long-press, signature wheel scrolling, Save/Cancel; 320/360px widths.
- **Timer/loop overlap** on narrow phones: ask whether both may be active.
- **Stale tests and lint:** five failures in `tests/state/barCounter.test.ts` and
  `tests/i18n/i18n.test.ts`, plus lint errors in `index.html`, `public/icon.svg`,
  `tests/viz/polyrhythm.test.ts`. CI is red; Pages deployment only builds.
- **Android Play Store:** Play Console setup, AAB build/signing, closed testing, production per
  `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`. The new icon needs a
  new Play release; signing needs the user's permission to read the keystore password file.

### Standing instructions

- **Never work in a git worktree.** Committing and pushing straight to `master` is fine.
- No `Co-Authored-By` lines in commits.
- Ask before every build, install, and commit.
- The user tests on a physical Android phone (Chrome) against the dev server Network URL, and
  over adb (`D:\Android\Sdk\platform-tools\adb`) when the phone is plugged in. Do not screenshot
  the phone unless the launcher is in front (check `dumpsys window`).
- Keep turns economical; no tests unless asked; no reflexive build/test runs for tiny changes.

## Next step

1. Push when the user asks (build first, per their rule).
2. Sound-preview phone review; fix whatever the user reports.
3. Remaining open items above as directed.
