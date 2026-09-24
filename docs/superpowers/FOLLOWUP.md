# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-24)

The v1 metronome and its v2 additions are **built and committed**. Working tree was clean at `df5c49d` before this planning session. Recent history:

- `df5c49d` fix: UI/UX improvements and practice timer redesign
- `d9ae9c5` feat: practice timer, beat subdivisions, and English/Turkish i18n
- `e4616db` feat: v2 additions — tempo marking, accent-flash pulse, haptics, dial signature, bar counter

A planning session (Opus) then audited the app for battery/CPU cost and wrote a new plan covering mobile performance plus a Google Play release. **None of that plan is implemented yet.**

- **Plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store.md`** — 9 tasks, TDD, full code in every step. This is the active plan.
- The original v1 plan (`docs/superpowers/plans/2026-09-23-metronome.md`) is done except its final docs task, which the new plan's Task 9 absorbs — it writes `docs/architecture/platforms.md`, which `CLAUDE.md` already links to but which does not exist yet.

### What the audit found

Three things cost battery, in priority order:

1. **`drawNode` runs a `shadowBlur` pass for every beat node on every frame** (`src/viz/drawNode.ts`, called from `circular.ts:75` and `linear.ts:71`), plus a shadowed text label per node. At 16/4 that is ~1920 software blur passes per second. Only the glowing node actually changes between frames. → Plan Task 2.
2. **The rAF loop never checks visibility** (`src/viz/vizController.ts:79`) — it re-arms as long as `running()` is true. → Plan Task 1.
3. **`AudioEngine.stop()` leaves the `AudioContext` running forever** (`src/engine/audioEngine.ts:61`), holding the audio clock open in silence. → Plan Task 3.

RAM is fine: `BeatTimeline` is capped at 64 entries, source nodes disconnect in `onended`, and only two decoded buffers are ever held. No leak found.

## Design decisions already settled — do not re-open

These were decided with the user before the plan was written. They are recorded in the plan's "Design Decisions" section with reasoning.

- **Foreground-only playback.** The click is *not* required to keep sounding with the screen off or the app backgrounded. This is why there is no foreground service, no `MediaSession`, and no background permission. A screen wake lock (Task 4) covers the real need.
- **Capacitor 8, not a Trusted Web Activity.** A TWA needs `assetlinks.json` at the origin root; `*.github.io` is a shared origin and there is no custom domain. Capacitor bundles `dist/` into the APK.
- **Capacitor, not Tauri 2 Android.** Tauri's Android target needs the Rust + NDK toolchain and has no documented Play signing path. Windows keeps shipping through Tauri, unchanged.
- **`@capacitor/core` is an accepted exception** to the "no new runtime dependencies" rule in `CLAUDE.md`. No Capacitor *plugins* — the wake lock uses the standard `navigator.wakeLock` Web API.

## Next step

Execute `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store.md` from Task 1 in order, using `superpowers:subagent-driven-development` (or `superpowers:executing-plans` for inline execution). Tick each `- [ ]` as steps complete. Commit at the end of every task as the plan says.

Phase A (Tasks 1–4, performance) is self-contained and ships value on its own. Do not start Phase B until Phase A is verified on a device — the whole point is that the app is cool and efficient *before* a Play reviewer or a first user runs it.

## Things that need the user

- **Android toolchain** must be installed before Task 5: JDK 17+, Android Studio **Otter 2025.2.1+**, SDK Platform 36, `ANDROID_HOME` set. Verify with `java -version` and `adb --version`. Do not work around a missing SDK.
- **Keystore generation (Task 7, Step 1): stop and ask first.** The user picks the passwords and the storage location, and must back the file up — losing it ends the ability to update the Play listing forever. Never commit the keystore or `keystore.properties`.
- **Play Console account type (Task 8, Step 1)**: ask whether it is a personal or organisation account and when it was created. A personal account created after 2023-11-13 needs **12 testers opted in continuously for 14 days** before production access, which sets the earliest possible launch date.
- **Publishing anything to Play (Task 8, Steps 4, 5, 7): confirm before each.** These are irreversible and public.
- **Pushing to GitHub**: ask first.
- Manual verification in Tasks 1–7 needs someone to listen, watch, and hold the phone. Task 7 Step 8 in particular — 10 minutes of playback on a real unplugged device, then feel the back of the phone. Report what was actually observed, including the `?debug=1` `minLead`/`skipped` numbers.

## Open questions

- The user has the Play Console account and the icon plus store graphics, but the **privacy policy URL** is not published yet. Task 8 Step 2 writes `docs/privacy-policy.md`; where it gets published (GitHub Pages is the cheapest option) needs the user to confirm the exact URL.
- Whether the app ships free or paid is not decided (Task 8, Step 4).
