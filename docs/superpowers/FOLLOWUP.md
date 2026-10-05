# FOLLOWUP — session handoff

If you are a fresh session: read `CLAUDE.md` first, then this file, then act on "Next step"
immediately.

## Where things stand (2026-10-05)

Work is on the local branch `sounds-and-limiter`, 5 commits ahead of `master` (not pushed, not
merged): soft master limiter, grouped built-in sounds with 59 bundled WAVs fetched on first use,
the paper light theme (Prism hidden in light, falls back to Frosted), and the light-theme beat
fixes below. The untracked `sound-candidates/` folder (~9 MB of candidate WAVs + `SOURCES.md`, left
over from picking the bundled sounds) was deliberately left out of every commit; the user hasn't
said whether to keep, ignore or delete it.

### Latest: light-theme beat hierarchy (commit 3a5120b)

- In light, beat levels read as an ink ladder: faded mute → mid-teal normal (`--viz-node`
  `#4f8a7c`) → deeper medium → deepest accent (`#0a3d35`). Before, Classic's white accent wash and
  Metallic's lightening boost made accent/medium look lighter than normal on paper.
- `getNodeStyleKit(style, paper)` returns paper variants of Classic/Metallic/Frosted (Prism has
  none; it isn't offered in light). `drawNode` and the poly paths pass `theme.light`.
- Paper nodes cast a warm drop shadow (`paperShadow` in `nodeStyleKit.ts`) instead of the hued
  glow halo; the hit lifts the node. It replaces the halo's shadow pass, so no extra per-frame
  cost; idle sprites bake it in. Mute stays flat. Shadow values are scaled by the canvas transform
  since canvas shadows ignore it.
- Classic's mute label is inked in `--viz-label` on light. Label font/drawing are shared helpers
  (`setNodeLabelFont`, `drawNodeLabel` in `drawNode.ts`). Merged poly conjunctions follow the same
  light ladder (`levelColor` in `polyrhythm.ts`).
- Verified with headless screenshots (dev server, Playwright from the npx cache): dark themes
  render pixel-identical to before; lint, `tsc`, and `tests/viz` pass. Not yet checked on the
  phone or while playing (the hit-lift animation).

### Earlier follow-ups still open

- **Phone check of the light theme beats:** ask how the new ladder and the hit lift look on the
  physical Android phone.
- **App icon:** `public/icon.svg` is the BPM knob SVG. `public/favicon.ico`, `src-tauri/icons/`,
  and the Android launcher icon have not been regenerated. Android icon changes require a new Play
  release.
- **Phone checks:** app icon, +/- long-press, signature wheel finger scrolling, Save/Cancel on the
  physical phone; narrow 320/360px widths.
- **Timer/loop overlap:** both can be active; their button groups may crowd on narrow phones. Ask
  whether both should be allowed simultaneously.
- **Stale tests:** `npm test` had six known failures in `tests/state/barCounter.test.ts` and
  `tests/i18n/i18n.test.ts` (old "Bar" strings vs current Loop/Repeat wording).
- **Android Play Store:** Play Console setup (user side), AAB build/signing, closed testing, and
  production release remain open per
  `docs/superpowers/plans/2026-09-24-mobile-performance-and-play-store-v2.md`.

### Standing instructions

- **Never work in a git worktree for this project.** Use plain local branches in the main directory.
- No `Co-Authored-By` lines in commits.
- The user tests on a physical Android phone (Chrome) against the dev server Network URL
  (`http://<LAN-IP>:5173/`).
- Keep turns economical; do not add tests unless asked. Avoid reflexive build/test runs for tiny
  changes.

## Next step

1. Ask how the light-theme beats look on the phone (including the hit lift while playing).
2. Ask what to do with `sound-candidates/` (commit, `.gitignore`, or delete) and whether
   `sounds-and-limiter` is ready to merge into `master` and push.
3. Then the older items: app icon regeneration, timer/loop crowding, stale tests, Play Store.
