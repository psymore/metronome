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
import { byId, closeOnBackdropClick, updateRangeFill } from './dom';

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

  byId('menuBtn').addEventListener('click', () => {
    resetConfirm.disarm();
    drawer.showModal();
  });
  closeOnBackdropClick(drawer);

  // Swipe left on the open drawer closes it (the drawer slides in from the left). Ignored when
  // the gesture starts on a range input, so dragging the sync-offset slider left still moves the
  // slider. Opening stays button-only — see the .drawer note in styles.css.
  const SWIPE_CLOSE_PX = 60;
  let swipeStart: { x: number; y: number } | null = null;
  drawer.addEventListener('pointerdown', (e) => {
    const onSlider = (e.target as HTMLElement).closest('input[type="range"]');
    swipeStart = onSlider ? null : { x: e.clientX, y: e.clientY };
  });
  drawer.addEventListener('pointerup', (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    swipeStart = null;
    if (dx < -SWIPE_CLOSE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) drawer.close();
  });
  drawer.addEventListener('pointercancel', () => {
    swipeStart = null;
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
