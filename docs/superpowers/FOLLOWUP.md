# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step" immediately.

## Where things stand (2026-09-25)

Phase A (performance) and most of Phase B (Android Play Store release) are done. Work happened in an isolated worktree (`worktree-phase-b-play-store`, at `.claude/worktrees/phase-b-play-store` under the main repo) with commits pushed straight to `master` mid-plan — the user explicitly asked for this (twice) so Vercel's GitHub-integration production deploys would pick up each change for live verification, rather than waiting for one big merge at the end.

**Active plan: `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`.** Its own checkboxes are ticked for everything done — check it directly rather than trusting a stale summary. As of this handoff:

- **Tasks 1-7 and 10: done, verified, committed, pushed to `master`.**
- **Task 8 (signed AAB): Steps 1-3 done** (AAB built, signed, `jarsigner -verify` confirms `jar verified.` with the real cert, SDK levels re-confirmed 36/36). **Step 4 (real-device unplugged 10-minute soak test) is NOT done** — the user chose to run this themselves later, on their own phone, rather than connect one to this session.
- **Task 9 (Play Console): Step 2 done** (privacy policy written and live). **Everything else is open**: Step 1 (personal-vs-org account type — user needs to check), Step 3 (draft store copy exists but hasn't been shown to the user for approval; screenshots not taken — need Task 8 Step 4's device), Steps 4-7 (create the app listing, upload the AAB, recruit testers, apply for production) are pure Play Console UI actions this agent has no access to (no browser tool was enabled this session) and cannot perform.

### What's live right now

- Production: `https://metronome-delta-gold.vercel.app/` (Vercel project `metronome`, team "psymore's projects", GitHub integration deploys from `master` automatically — **no CLI token/`vercel login` was ever set up**, so there is no local `vercel` CLI access; any future CLI use starts from scratch).
- `https://metronome-delta-gold.vercel.app/.well-known/assetlinks.json` — live, validated against Google's Digital Asset Links API.
- `https://metronome-delta-gold.vercel.app/privacy-policy.html` — live (source: `docs/privacy-policy.md`, published copy: `public/privacy-policy.html`).
- `android/app-release-bundle.aab` — signed, verified, **not committed** (gitignored build output, machine-local only — see below).

### The keystore — read this before touching anything Android

The signing keystore is **not inside the repo**, by the user's explicit choice: `C:\Users\4D\Keystores\metronome\release.keystore`, alias `metronome`. Its password lives in `C:\Users\4D\Keystores\metronome\PASSWORD-BACKUP-THEN-DELETE.txt` on the same machine — **the user has not yet moved it to a password manager and deleted that file; nudge them if it's still there.** PKCS12 keystore, so store password = key password (keytool enforces this, ignores a distinct key password silently). SHA-256 fingerprint: `6F:13:77:4F:F5:A0:15:F3:AA:4B:5A:75:6A:5F:BA:29:E4:09:9B:A4:73:C7:FA:C0:52:42:9B:70:1E:96:46:E6` (also in `public/.well-known/assetlinks.json`). Losing this file or its password permanently ends the ability to publish updates to the Play listing.

There is a second, **dead** keystore file at `C:\Users\4D\Keystores\metronome\android.keystore` — its own password was lost by an agent mistake before ever being recorded anywhere (generated it, then deleted the password file before saving the value elsewhere). It's inert, not referenced by anything, safe to ignore or delete whenever; the real keystore is `release.keystore`, not that one.

### Bubblewrap CLI doesn't work in this dev environment — read before running it

`npx @bubblewrap/cli@1.25.0 init` and `build` both fail here:
- `init`'s wizard uses arrow-key list prompts that don't work over non-interactive/piped stdin.
- `build` corrupts its own `Path` env var on Windows (`JdkHelper.getEnv()` hardcodes the key `'Path'`; this shell's env only carried `'PATH'`), which makes even `cwd`-relative `gradlew.bat` invisible to `cmd.exe`.

Both were worked around by driving the underlying tools directly instead — this is fully documented as the standing approach in `docs/architecture/platforms.md` ("A note on Bubblewrap's `build`/`init` commands in this environment"), with the exact command sequence for both the APK and AAB paths. Use that runbook, not the plan's literal `npx @bubblewrap/cli build` steps, when building a new release. If a future environment doesn't hit the `Path` bug, the plain CLI commands should work as documented upstream — worth a quick try before assuming the workaround is still needed.

Also: Bubblewrap's global config now points at the existing JDK 17.0.1 (`C:\Program Files\Java\jdk-17.0.1`) and Android SDK (`D:\Android\Sdk`) via `~/.bubblewrap/config.json`, and `D:\Android\Sdk\bin` is a directory junction to `cmdline-tools\latest\bin` (Bubblewrap's SDK-path check expects a legacy `tools/`or `bin/` folder that modern SDK installs don't have). `build-tools;36.1.0` is installed (Bubblewrap requires that exact version, not just `36.0.0`). All machine-local setup, nothing committed.

## Next step

1. **Nudge the user about the keystore password file** if you haven't heard it's been moved to a password manager yet (see above).
2. **Task 8 Step 4** — once the user has run the real-device soak test themselves, ask them how it went (any heat/battery issue is a regression in Phase A's work, worth investigating) and tick that checkbox.
3. **Task 9 Step 1** — ask again if the user has checked their Play Console account type/creation date; this sets the earliest possible production launch date.
4. **Task 9 Step 3** — once there's a real device to screenshot from, take screenshots of both visualisers and show the user the draft store copy (already written in the plan) for approval/edits.
5. **Task 9 Steps 4-7** are Play Console UI clicks the user has to do by hand (this agent has no browser/console access this session) — the AAB and privacy policy are both ready whenever they want to start.
6. Once Task 8 Step 4 and Task 9 are far enough along (or the user decides to stop waiting on them), run the plan's **Final Review** per `superpowers:executing-plans` — dispatch a fresh-context reviewer against the whole branch's diff before merging the worktree branch fully, then `superpowers:finishing-a-development-branch`. Note: most commits are *already* on `master` (pushed mid-plan per the user's request), so "finishing" here mostly means cleaning up the worktree and its SDD ledger (`.claude/worktrees/phase-b-play-store/.superpowers/sdd/2026-09-24-mobile-performance-and-play-store-v2/progress.md` — full task-by-task record with every ruling made, read it for detail beyond this summary) rather than a normal feature-branch merge.

## Design decisions already settled — do not re-open

Unchanged from before this session — see the plan's own "Design Decisions" section: foreground-only playback, TWA on Vercel not Capacitor, Bubblewrap not Tauri Android, no new runtime dependency for Phase B.

## Things that still need the user

- Move the keystore password out of the plaintext backup file (see above).
- Run Task 8 Step 4's real-device soak test.
- Check and report the Play Console account type/creation date (Task 9 Step 1).
- Approve/edit the draft store listing copy and supply screenshots (Task 9 Step 3).
- Everything in the Play Console itself: create the app listing, complete App content, upload the AAB, recruit closed-testing testers, apply for production (Task 9 Steps 4-7) — each needs explicit confirmation before it happens, per the plan.
- Decide whether/when to do the final whole-branch review and formally close out the plan.

## Deferred from Phase A's final review — still not fixed, still not forgotten

Unchanged from before this session (see the plan's Task 4 history for detail): sprite-cache growth across window resizes in linear mode, sub-pixel sprite blit softening, `SPRITE_PAD` marginally tight for the idle shadow at DPR 1, `AudioEngine.preview()` leaving the context running until the next stop/start. All Minor, all still just noted, not acted on.
