# Beat sphere design styles

Date: 2026-09-29
Status: Approved, ready for implementation planning

## Context

Request: add a selectable visual style for beat nodes ("beat spheres"), configurable from the
Settings modal, applied consistently across both standard visualizers (circular, linear) and the
polyrhythm visualizer. Follows on from the polyrhythm accent/mute rendering fixes earlier in this
session, which exposed that beat-node painting is currently duplicated between `drawNode.ts`
(standard modes) and bespoke painters inside `polyrhythm.ts`.

Decisions made during brainstorming:
- Applies **everywhere** — standard and polyrhythm modes render one shared chosen style, not two
  independently configurable looks.
- Three styles ship in this pass: **Classic** (today's look, unchanged), **Flat**, **Outline**.
- Lives in the Settings modal as a new field, chip-row style, mirroring the existing `Theme` field.

## Non-goals

- No per-visualizer-mode style override (e.g. "Flat in circular, Classic in polyrhythm") — one
  setting governs all three renderers.
- No new dependency, no SVG/image assets — every style is drawn with the existing Canvas 2D APIs.
- No change to the polyrhythm hub/close-button chrome (`drawPairHub`'s warm gradient disc) — that
  is UI chrome, not a beat node, and stays as implemented.
- No change to sprite caching architecture beyond adding one more key component — the existing
  "idle nodes are cached, the active/glowing one is painted live" strategy is unchanged.
- Polyrhythm does not gain sprite caching in this pass — it already paints live every frame with
  no cache (confirmed: `drawPolyrhythm`'s `sprites` parameter is currently unused), and adding
  that optimization is out of scope here.

## Architecture overview

- **State**: `src/state/settings.ts` gains a `nodeStyle: NodeStyleName` field (new
  `NODE_STYLES = ['classic', 'flat', 'outline']` const array + type), defaulted and sanitized the
  same way `theme`/`ThemeName` already are.
- **Rendering**: new `src/viz/nodeStyleKit.ts` centralizes the three styles' paint logic behind
  one small interface. `src/viz/drawNode.ts` becomes a thin dispatcher onto the selected kit.
  `src/viz/polyrhythm.ts`'s per-half and accent painters call the same kit instead of their own
  hardcoded canvas code, so standard and polyrhythm modes can never visually diverge for a given
  style.
- **Caching**: `src/viz/nodeSprite.ts`'s `spriteKey`/`NodeSpriteCache.setContext` gain a `style`
  component, so switching styles invalidates cached idle sprites exactly like a theme change does
  today.
- **UI**: `src/ui/settingsDialog.ts` + `index.html` gain a "Beat sphere" field (chip row), wired
  identically to the existing Theme chips. New `i18n/translations.ts` strings for both locales.

## 1. Data model

`src/state/settings.ts`:

```ts
export const NODE_STYLES = ['classic', 'flat', 'outline'] as const;
export type NodeStyleName = (typeof NODE_STYLES)[number];
```

`Settings.nodeStyle: NodeStyleName`, default `'classic'`.

`isNodeStyleName(v: unknown): v is NodeStyleName` guard, mirroring `isThemeName`.

`sanitizeSettings`: `nodeStyle: isNodeStyleName(r.nodeStyle) ? r.nodeStyle : d.nodeStyle` — same
one-line pattern as the existing `theme` sanitize, so old saved settings (no `nodeStyle` key)
silently default to `'classic'` with no migration step needed.

## 2. The style kit

`src/viz/nodeStyleKit.ts` exports:

```ts
export interface NodeStyleKit {
  /** Ring-only, no fill — used for a muted beat. */
  paintMute(ctx, x, y, radius, color, glow): void;
  /** The node's normal, at-rest look. */
  paintNormal(ctx, x, y, radius, color, glow): void;
  /** The emphasized/accent look — must read as distinct from normal even with glow === 0. */
  paintAccent(ctx, x, y, radius, color, glow): void;
}

export function getNodeStyleKit(style: NodeStyleName): NodeStyleKit;
```

Each function paints into an already-`ctx.save()`d state and does not restore — callers wrap the
call in their own `save()`/`restore()`, matching the existing `drawNode`/`drawAccentNode` pattern.

Three concrete kits, ported from today's `drawNode.ts` logic for Classic and newly written for the
other two:

- **Classic** (moved verbatim from current `drawNode.ts`): glossy radial-gradient-shined fill,
  shadow-blur glow that swells on `glow > 0`; mute = thin ring outline that only fills in
  (partially) while glowing.
- **Flat**: solid flat fill (no shine gradient), a fixed thin shadow (no blur swell — or a much
  smaller one, to keep some active-beat feedback without the glossy bloom); mute = thin flat ring,
  no shadow; accent = same flat fill plus a crisp 2px brighter ring border around the disc (the
  distinguishing mark, instead of a bigger bloom).
- **Outline**: every level is ring-first so the three states differ at rest, not just while
  glowing — mute = thin dim ring, normal = a thicker/brighter ring (still hollow), accent = the
  same ring but filled solid. Glow still adds a shadow-blur pulse on top of whichever ring/fill is
  current.

`polyrhythm.ts`'s per-layer color override (`layerColor` swapped in for `theme.node`/`accent`) is
preserved: the kit's paint functions take an explicit `color` parameter rather than reading it off
`VizTheme` internally, so the same kit serves both a themed standard node and a layer-colored
polyrhythm node without any polyrhythm-specific branching inside the kit itself.

## 3. `drawNode.ts` and `polyrhythm.ts` become dispatchers

`drawNode(ctx, x, y, radius, level, glow, theme, style)` gains the `style` parameter, resolves
`getNodeStyleKit(style)`, and calls `paintMute`/`paintNormal`/`paintAccent` based on `level` —
replacing today's inline canvas code. Existing callers (`circular.ts`, `linear.ts`) thread
`store.get().nodeStyle` through the same way they already thread `theme`.

`polyrhythm.ts` changes:
- The normal/mute branch inside `drawLayer` already calls `drawNode` — it gains the `style` arg,
  no other change.
- `drawAccentNode` (today: bespoke "uniform brighter wash" canvas code) is replaced by a call to
  `getNodeStyleKit(style).paintAccent(...)` with the layer's color — the exact wash/ring/fill
  behavior now comes from the kit, consistently with standard-mode accent nodes.
- `drawCombinedHalf` (the still-merged conjunction node's per-half painter) dispatches to the same
  three kit functions based on that half's level, instead of its own mute/normal/accent
  canvas branches — this is the piece that guarantees a style change is visible on collapsed
  conjunction nodes too, not just split ones.
- `drawPairHub`'s warm close-button disc is untouched (non-goal, see above).

`drawPolyrhythm`'s signature gains a `style: NodeStyleName` parameter, threaded from
`VizController` the same way `theme` already is.

## 4. Sprite cache

`src/viz/nodeSprite.ts`:
- `spriteKey(themeName, level, label, radius, dpr)` gains a `style` parameter, folded into the key
  string: `${themeName}|${style}|${level}|${label}|${radius}|${dpr}`.
- `NodeSpriteCache.setContext(themeName, dpr)` gains a `style` parameter; the cache clears when
  *either* `themeName`, `dpr`, or `style` changes from the last call — same early-return-if-nothing-
  changed structure as today, just one more field compared.
- `SpriteRenderer` (the function passed into `NodeSpriteCache`'s constructor, defined in
  `circular.ts`/`linear.ts`'s call sites) is updated to read `store.get().nodeStyle` when painting
  a sprite, so a cached sprite is always baked with the style that was active when it was painted.

Polyrhythm's `drawPolyrhythm` keeps ignoring the `sprites` parameter (non-goal) — it will simply
receive and pass along the `style` value like it does `theme`, with no caching involved.

## 5. Settings UI

`index.html`: a new `.field` block right after the existing Theme field, same markup shape:

```html
<div class="field">
  <span data-i18n="nodeStyle.label">Beat sphere</span>
  <div class="unit-row" role="radiogroup" aria-label="Beat sphere style">
    <button type="button" role="radio" class="chip" data-node-style-option="classic" aria-checked="false" data-i18n="nodeStyle.classic">Classic</button>
    <button type="button" role="radio" class="chip" data-node-style-option="flat" aria-checked="false" data-i18n="nodeStyle.flat">Flat</button>
    <button type="button" role="radio" class="chip" data-node-style-option="outline" aria-checked="false" data-i18n="nodeStyle.outline">Outline</button>
  </div>
</div>
```

`src/ui/settingsDialog.ts`: a `nodeStyleButtons` query + click handler + `aria-checked` sync block,
each mirroring the existing `themeButtons` block line-for-line (using `isNodeStyleName` in place of
`isThemeName`).

`src/i18n/translations.ts`: `nodeStyle.label`/`nodeStyle.classic`/`nodeStyle.flat`/
`nodeStyle.outline` added for both `en` and `tr`.

## 6. Testing

- Unit tests (`tests/state/settings.test.ts` or wherever the existing theme sanitize test lives):
  `nodeStyle` defaults to `'classic'` on empty/malformed input, round-trips through
  `sanitizeSettings` when valid, and falls back to default on an invalid string — mirroring the
  existing theme test shape.
- Unit test for `spriteKey`: two calls differing only in `style` produce different keys.
- No new unit tests for the canvas painters themselves (consistent with `drawNode.ts` having none
  today) — verified manually in the dev server: all 3 styles × all 3 levels (mute/normal/accent),
  in circular, linear, and polyrhythm (both collapsed-conjunction and split-node cases), with and
  without the active glow.

## 7. Error handling

- Unknown/corrupted `nodeStyle` in `localStorage` → `sanitizeSettings` falls back to `'classic'`,
  same pattern as every other enum-like field. No user-facing error.
- No other new failure modes — this feature adds no I/O, no async work, no new permissions.
