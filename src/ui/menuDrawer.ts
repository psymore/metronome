import { t } from '../i18n/i18n';
import {
  type BeatLevel,
  defaultSettings,
  isLanguage,
  isNodeStyleName,
  isThemeName,
  type Settings,
  SYNC_OFFSET_LIMIT_MS,
} from '../state/settings';
import type { Store } from '../state/store';
import { drawNode } from '../viz/drawNode';
import { glowIntensity } from '../viz/geometry';
import { readTheme } from '../viz/vizController';
import { createConfirmGate } from './confirmGate';
import { byId, updateRangeFill } from './dom';

export function mountMenuDrawer({ store }: { store: Store<Settings> }): void {
  const drawer = byId<HTMLDialogElement>('menuDrawer');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId<HTMLInputElement>('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const depth25dToggle = byId<HTMLButtonElement>('depth25dToggle');
  const themeButtons = Array.from(
    drawer.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );
  const nodeStyleButtons = Array.from(
    drawer.querySelectorAll<HTMLButtonElement>('[data-node-style-option]'),
  );
  const nodeStylePreviews = Array.from(
    drawer.querySelectorAll<HTMLCanvasElement>('[data-node-style-preview]'),
  );
  const languageButtons = Array.from(drawer.querySelectorAll<HTMLButtonElement>('[data-lang]'));

  // Two-step confirm instead of window.confirm (not reliable inside the Tauri webview).
  const resetConfirm = createConfirmGate(resetBtn, {
    idleText: () => t('reset.button'),
    armedText: () => t('reset.confirm'),
  });

  // opening/closing/snapOpen all attach an animationend listener for their own CSS animation on
  // this same element — checking animationName (not just target) matters because more than one
  // of those listeners can be alive at once (e.g. a drag's snap-back racing a stray close), and
  // without it one animation finishing would fire another's callback too.
  function afterAnimation(name: string, then: () => void): void {
    const onEnd = (event: AnimationEvent): void => {
      // animationend bubbles, and buttons inside the drawer (theme swatches, language, reset...)
      // all run their own 260ms btn-flash animation on tap (see clickFx.ts) — ignore anything
      // that isn't this element's own `name` animation finishing.
      if (event.target !== drawer || event.animationName !== name) return;
      drawer.removeEventListener('animationend', onEnd);
      then();
    };
    drawer.addEventListener('animationend', onEnd);
  }

  const prefersReducedMotion = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Plays the drawer-out/backdrop-fade CSS transition (styles.css) before the dialog actually
  // closes — dialog.close() alone would yank it out of the top layer with no exit animation.
  // Every close path (backdrop click, Esc/Android Back via 'cancel', swipe) routes through this
  // instead of calling drawer.close() directly.
  function closeAnimated(): void {
    if (drawer.classList.contains('closing')) return;
    // The global `* { animation: none !important }` reduced-motion override means drawer-out
    // never fires animationend, so afterAnimation's callback would never run — close synchronously
    // instead of waiting on an animation that isn't going to happen.
    if (prefersReducedMotion()) {
      drawer.classList.remove('opening', 'closing');
      drawer.style.transform = '';
      drawer.close();
      return;
    }
    // In case the user closes it again fast enough to catch the entrance animation mid-flight —
    // 'closing' (added right below) already outranks 'opening' by source order in styles.css, so
    // this isn't required for drawer-out to win, just to stop drawer-in's own listener from
    // firing later on a class that's no longer doing anything.
    drawer.classList.remove('opening');
    drawer.classList.add('closing');
    afterAnimation('drawer-out', () => {
      drawer.classList.remove('closing');
      // Clears any inline transform left by a mid-drag close (see finishDragClose below) so the
      // next open starts from drawer-in's own clean state instead of the drag's last position.
      drawer.style.transform = '';
      drawer.close();
    });
  }

  byId('menuBtn').addEventListener('click', () => {
    resetConfirm.disarm();
    drawer.classList.remove('closing');
    drawer.classList.add('opening');
    drawer.showModal();
    afterAnimation('drawer-in', () => drawer.classList.remove('opening'));
  });
  // A drag that ends in setPointerCapture (see below) retargets the click event synthesized right
  // after pointerup to the capturing element itself — drawer — which reads identically to a
  // genuine backdrop click. suppressNextClick, set by the drag's own pointerup handler, tells this
  // listener to ignore that one synthetic click instead of closing the drawer out from under a
  // swipe that was supposed to snap back open.
  let suppressNextClick = false;
  drawer.addEventListener('click', (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (event.target === drawer) closeAnimated();
  });
  drawer.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAnimated();
  });

  // Swipe left on the open drawer drags it 1:1 with the finger (the drawer slides in from the
  // left), then on release either finishes closing or springs back open, whichever side of the
  // 50% mark it's past — the standard drawer/sheet commit threshold. Ignored when the gesture
  // starts on a range input, so dragging the sync-offset slider left still moves the slider.
  // Opening stays button-only — see the .drawer note in styles.css.
  const DRAG_LOCK_PX = 8;
  let swipeStart: { x: number; y: number } | null = null;
  let dragging = false;
  let drawerWidth = 0;

  // Finishes the animated close from wherever the drag left off, instead of closeAnimated()'s
  // fixed drawer-in-reverse start point — the drawer-out keyframe only defines its `to` state, so
  // an omitted `from` picks up the element's current (inline, mid-drag) transform automatically.
  function finishDragClose(): void {
    // Leaves the inline transform in place — closeAnimated's drawer-out animation has no `from`
    // keyframe of its own, so it picks up the drag's last position as its starting point and
    // clears the inline style itself once the animation completes.
    drawer.classList.remove('dragging');
    closeAnimated();
  }

  // Springs back open from wherever the drag left off, for the same reason: drawer-snap-open's
  // omitted `from` keyframe picks up the current inline transform.
  function snapOpen(): void {
    drawer.classList.remove('dragging');
    // Same reduced-motion problem as closeAnimated: drawer-snap-open never fires animationend, so
    // just clear the drag's inline transform immediately instead of leaving it stuck mid-screen.
    if (prefersReducedMotion()) {
      drawer.style.transform = '';
      return;
    }
    drawer.classList.add('snapping-open');
    afterAnimation('drawer-snap-open', () => {
      drawer.classList.remove('snapping-open');
      drawer.style.transform = '';
    });
  }

  let pointerId: number | null = null;
  drawer.addEventListener('pointerdown', (e) => {
    // A drag that ends past the slop threshold usually produces no click at all on touch, so a
    // stale true here (left over from a previous drag) would swallow the next genuine tap instead
    // of just the synthetic click it was meant for.
    suppressNextClick = false;
    const onSlider = (e.target as HTMLElement).closest('input[type="range"]');
    swipeStart = onSlider ? null : { x: e.clientX, y: e.clientY };
    dragging = false;
    pointerId = e.pointerId;
  });
  drawer.addEventListener('pointermove', (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    if (!dragging) {
      // Undecided until the gesture clearly reads as a leftward horizontal drag — the same
      // horizontal/vertical ratio the old release-time check used. A rightward or vertical-
      // leaning start isn't a close gesture; bail so vertical scrolling stays untouched.
      if (Math.abs(dx) < DRAG_LOCK_PX) return;
      if (dx > 0 || Math.abs(dx) <= Math.abs(dy) * 1.5) {
        swipeStart = null;
        return;
      }
      dragging = true;
      drawerWidth = drawer.getBoundingClientRect().width || 1;
      drawer.classList.add('dragging');
      // Once a leftward drag is confirmed, the drawer's own translateX can carry it (and the
      // pointer, if the finger keeps tracking it 1:1) past the left edge of the viewport before
      // the drag finishes — a swipe that starts anywhere left of drawerWidth*0.5 will do this by
      // the time it crosses the close threshold. Past x=0 there's nothing left to hit-test, so
      // without capture the browser simply stops delivering pointermove/pointerup and the drag
      // gets stuck mid-swipe, 'dragging' class and all. Capture pins every further event from
      // this pointer to drawer regardless of where it physically is.
      if (pointerId !== null) drawer.setPointerCapture(pointerId);
    }
    const clampedDx = Math.min(0, Math.max(-drawerWidth, dx));
    drawer.style.transform = `translateX(${clampedDx}px)`;
  });
  drawer.addEventListener('pointerup', (e) => {
    if (!swipeStart) return;
    const wasDragging = dragging;
    const dx = e.clientX - swipeStart.x;
    swipeStart = null;
    dragging = false;
    if (wasDragging && pointerId !== null && drawer.hasPointerCapture(pointerId)) {
      drawer.releasePointerCapture(pointerId);
      // The synthetic click that follows targets the capturing element (drawer) no matter where
      // the pointer physically ended up — see suppressNextClick's own comment above.
      suppressNextClick = true;
    }
    if (!wasDragging) return;
    if (Math.abs(dx) > drawerWidth * 0.5) finishDragClose();
    else snapOpen();
  });
  drawer.addEventListener('pointercancel', () => {
    if (dragging) snapOpen();
    swipeStart = null;
    dragging = false;
  });

  for (const button of languageButtons) {
    button.addEventListener('click', () => {
      const language = button.dataset.lang;
      if (isLanguage(language)) store.set({ language });
    });
  }

  offsetInput.addEventListener('input', () => {
    store.set({ syncOffsetMs: Number(offsetInput.value) });
    updateRangeFill(offsetInput);
  });
  offsetValue.addEventListener('input', () => {
    if (offsetValue.value === '') return;
    const ms = Math.min(
      SYNC_OFFSET_LIMIT_MS,
      Math.max(-SYNC_OFFSET_LIMIT_MS, Number(offsetValue.value)),
    );
    store.set({ syncOffsetMs: ms });
  });
  for (const button of themeButtons) {
    button.addEventListener('click', () => {
      const theme = button.dataset.themeOption;
      if (isThemeName(theme)) store.set({ theme });
    });
  }
  for (const button of nodeStyleButtons) {
    button.addEventListener('click', () => {
      const nodeStyle = button.dataset.nodeStyleOption;
      if (isNodeStyleName(nodeStyle)) store.set({ nodeStyle });
    });
  }
  depth25dToggle.addEventListener('click', () => {
    store.set({ depth25d: !store.get().depth25d });
  });

  resetBtn.addEventListener('click', () => {
    if (resetConfirm.tap()) store.set(defaultSettings());
  });

  /** Paints one Beat style button's canvas with three actual `drawNode` calls — mute, normal,
   *  accent, left to right in the same order the app now cycles a tapped beat through — so all
   *  three phases are visible and comparable at a glance, not just the "normal" one. */
  const NODE_STYLE_PREVIEW_LEVELS: BeatLevel[] = ['mute', 'normal', 'accent'];
  const NODE_STYLE_PREVIEW_CELL = 32;
  const paintNodeStylePreview = (canvas: HTMLCanvasElement, glow: number): void => {
    const style = canvas.dataset.nodeStylePreview;
    if (!isNodeStyleName(style)) return;
    const theme = readTheme(drawer);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = NODE_STYLE_PREVIEW_CELL;
    const width = cell * NODE_STYLE_PREVIEW_LEVELS.length;
    const height = cell;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const [i, level] of NODE_STYLE_PREVIEW_LEVELS.entries()) {
      const cx = cell * i + cell / 2;
      const nodeGlow = level === 'mute' ? 0 : glow;
      drawNode(ctx, cx, height / 2, cell * 0.38, level, nodeGlow, theme, style);
    }
  };
  const paintNodeStylePreviews = (): void => {
    for (const canvas of nodeStylePreviews) paintNodeStylePreview(canvas, 0);
  };

  /** Tapping a preview plays the same hit-glow the real visualiser uses, so it's an interactive
   *  sample of the style (not just a picture) — you can feel how "hit" reads before picking it. */
  const flashNodeStylePreview = (canvas: HTMLCanvasElement): void => {
    const start = performance.now();
    const tick = (now: number): void => {
      const glow = glowIntensity((now - start) / 1000);
      paintNodeStylePreview(canvas, glow);
      if (glow > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  for (const canvas of nodeStylePreviews) {
    canvas.addEventListener('click', () => flashNodeStylePreview(canvas));
  }

  const render = (s: Settings) => {
    offsetInput.value = String(s.syncOffsetMs);
    offsetValue.value = String(s.syncOffsetMs);
    updateRangeFill(offsetInput);
    for (const button of nodeStyleButtons) {
      button.setAttribute('aria-checked', String(button.dataset.nodeStyleOption === s.nodeStyle));
    }
    for (const button of themeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === s.theme));
    }
    paintNodeStylePreviews();
    depth25dToggle.setAttribute('aria-checked', String(s.depth25d));
    for (const button of languageButtons) {
      button.setAttribute('aria-checked', String(button.dataset.lang === s.language));
    }
  };
  render(store.get());
  store.subscribe(render);
}
