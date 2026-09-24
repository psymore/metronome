# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-24)

The v1 metronome and its v2 additions are **built and committed**. A later session audited the app for battery/CPU cost, wrote a performance-and-release plan, **implemented and shipped Phase A of it**, then revised Phase B's packaging approach before executing it. Recent history:

- `535c766` docs: retire the Capacitor plan, add v2 with a Vercel + TWA Phase B
- `866e3ae` fix: prevent overlapping wake-lock requests from leaking a lock (final-review fix)
- `dae3d93` feat: keep the screen awake while the metronome plays
- `e184bdb` perf: suspend the AudioContext while the metronome is stopped
- `54766c3` perf: blit idle beat nodes from cached sprites
- `e928731` perf: stop the visualiser render loop while the page is hidden
- `f1d9837` docs: add mobile performance and Play Store release plan
- `df5c49d` fix: UI/UX improvements and practice timer redesign (last v2 commit before this work)

**Active plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`.** The original plan at the same date without `-v2` is **retired** — its header says so and points here; don't execute Phase B from it.

- **Phase A (Tasks 1-4, performance) is done, reviewed, and pushed to `master`.** Nothing left to do there except the deferred minors listed below.
- **Phase B (Tasks 5-10, Android release) has not been executed at all.** It was rewritten from Capacitor to **Vercel + Trusted Web Activity (Bubblewrap)** before any of it ran — see "Packaging decision" below for why. The v2 plan's Phase B section is the *only* version of Phase B that has ever run or should ever run.
- The original v1 plan (`docs/superpowers/plans/2026-09-23-metronome.md`) is done except its final docs task, which the v2 plan's Task 10 absorbs — it writes `docs/architecture/platforms.md`, which `CLAUDE.md` already links to but which does not exist yet.

### What the audit found (Phase A motivation)

1. **`drawNode` ran a `shadowBlur` pass for every beat node on every frame** — fixed by Task 2's sprite cache (`src/viz/nodeSprite.ts`); idle nodes now blit from a pre-rendered canvas, only the currently-glowing node still draws live.
2. **The rAF loop never checked visibility** — fixed by Task 1 (`src/viz/renderPolicy.ts`, `shouldAnimate()`).
3. **`AudioEngine.stop()` left the `AudioContext` running forever** — fixed by Task 3 (`ctx.suspend()` in `stop()`).

RAM was fine before and after: `BeatTimeline` is capped at 64 entries, source nodes disconnect in `onended`, only two decoded buffers are ever held.

### Packaging decision — read this before touching Phase B

The plan originally chose **Capacitor** because the PWA lives on `*.github.io` (a shared origin whose root can't serve `/.well-known/assetlinks.json`, which a Trusted Web Activity requires) and there was no custom domain. Mid-session the user asked to compare Vercel + TWA against Capacitor. Key fact that changed the decision: **a Vercel project gets its own dedicated `<project>.vercel.app` origin** — unlike a GitHub Pages user/org site, nothing else is hosted at that origin's root, so `assetlinks.json` just works there without buying a domain. The user confirmed switching to **Vercel + TWA** via an explicit choice (not assumed).

Consequences worth knowing before executing:
- **No app code changes are needed for Android at all.** A TWA is Chrome genuinely loading the live Vercel-hosted site — no `platform.ts`/`isNativeShell()` guard, no `main.ts` changes, service-worker registration behaves exactly as it does for any browser visitor.
- **Smaller APK, instant content updates** (a normal `vercel --prod` deploy, no new AAB/Play review) for anything that isn't a native-shell change (icon, package id, signing).
- **Trade-off accepted:** Play's "minimum functionality" policy scrutinizes wrapped-website apps more than a Capacitor app; the TWA also depends on Vercel staying up (mitigated by the existing offline service worker).
- Runtime/perf note from earlier discussion: TWA and Capacitor render through the **same** Chromium/Blink/V8 engine on-device, so there is no steady-state performance difference between them — the choice is about install size, update cadence, and hosting, not battery or FPS.

## Design decisions already settled — do not re-open

Recorded with reasoning in the v2 plan's "Design Decisions" section:

- **Foreground-only playback.** The click is *not* required to keep sounding with the screen off or the app backgrounded. Screen wake lock (Task 4, done) covers the real need.
- **Trusted Web Activity on Vercel, not Capacitor.** See "Packaging decision" above.
- **Bubblewrap, not Tauri 2 Android.** Tauri's Android target needs the Rust + NDK toolchain and has no documented Play signing path. Windows keeps shipping through Tauri, unchanged.
- **No new runtime dependency at all for Phase B.** `@bubblewrap/cli` is a dev-time generator, not a `package.json` dependency.

## Next step

Execute Phase B of `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md` (Tasks 5-10) in order, using `superpowers:executing-plans` (inline) or `superpowers:subagent-driven-development`. Tick each `- [ ]` as steps complete — Phase A's boxes in that same document are already checked, for reference only; do not redo them.

Task 5 (Vercel deploy) must complete before Task 6 (Bubblewrap init) can run — Bubblewrap reads the deployed manifest.

## Things that need the user

- **Vercel account + CLI login** before Task 5: `npm install -g vercel`, `vercel login`.
- **Android toolchain** before Task 6: JDK 17+, Android Studio **Otter 2025.2.1+**, SDK Platform 36, `ANDROID_HOME` set. Verify with `java -version` and `adb --version`.
- **Keystore generation (Task 6, Step 1): stop and ask first.** The user picks the passwords and storage location, and must back the file up — losing it ends the ability to update the app's native shell forever. Never commit the keystore or `keystore.properties`.
- **Play Console account type (Task 9, Step 1)**: ask whether it is personal or organisation, and when created. A personal account created after 2023-11-13 needs **12 testers opted in continuously for 14 days** before production access — sets the earliest possible launch date.
- **Publishing anything to Play (Task 9, Steps 4, 5, 7): confirm before each.** Irreversible and public.
- **Pushing to GitHub / deploying to Vercel production**: ask first, same as any push.
- Manual verification in Tasks 5-8 needs someone to hold a phone. Task 8, Step 4 in particular — 10 minutes of unplugged playback, then feel the back of the phone.

## Deferred from Phase A's final review — not fixed, not forgotten

Four Minor findings from the whole-branch review were deliberately left unfixed (Critical/Important got fixed in that same session; see ledger discipline in `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`'s Task 4 post-implementation note for the one Important fix that *did* land — the wake-lock race):

1. `src/viz/nodeSprite.ts` — sprite cache is unbounded across window resizes in linear mode (fractional radius per distinct width, never evicted). Bytes-scale, not a crash.
2. `src/viz/circular.ts:80`, `src/viz/linear.ts:76` — blitting sprites at fractional CSS positions/DPR can soften idle-node edges slightly vs. the old live-drawn pixels.
3. `src/viz/nodeSprite.ts:3` — `SPRITE_PAD = 8` is marginally less than the idle shadow's ~9px reach at DPR 1; likely invisible.
4. `src/engine/audioEngine.ts:97-99` — `preview()` while stopped leaves the `AudioContext` running until the next real stop/start cycle.

Also still open from Phase A: the plan's manual/visual verification steps (theme-switch sprite parity, DevTools frame-cost comparison) were never run against a real browser/device in-session — someone should do this before calling Phase A fully closed, though the logic is unit-tested and the final review read the code and found it correct.

## Open questions

- The user has the Play Console account and the icon plus store graphics, but the **privacy policy URL** is not published yet (Task 9, Step 2 writes `docs/privacy-policy.md`; publish it via the same Vercel deploy or GitHub Pages, confirm the exact URL with the user).
- Whether the app ships free or paid is not decided (Task 9, Step 4).
- The Vercel project name / final production URL is not chosen yet — Task 5 picks it.
