import { format, t } from '../i18n/i18n';
import { formatTimeLeft } from '../state/practiceTimer';
import {
  type BeatLevel,
  clampPracticeSeconds,
  defaultSettings,
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
import { mountHoldRepeat } from './holdRepeat';

export interface SettingsDialogDeps {
  store: Store<Settings>;
  /** Called after the user confirms starting a practice session from the dialog. */
  onStartPractice: () => void;
}

/** Seconds a single tap (or hold-repeat tick) of the practice timer's +/- buttons moves by. */
const PRACTICE_STEP_SECONDS = 15;

export function mountSettingsDialog({ store, onStartPractice }: SettingsDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId<HTMLInputElement>('volumeValue');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceSecondsInput = byId<HTMLInputElement>('practiceSecondsInput');
  const practiceTimeValue = byId('practiceTimeValue');
  const practiceTimeDown = byId<HTMLButtonElement>('practiceTimeDown');
  const practiceTimeUp = byId<HTMLButtonElement>('practiceTimeUp');
  const practiceTimerApply = byId<HTMLButtonElement>('practiceTimerApply');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId<HTMLInputElement>('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  const depth25dToggle = byId<HTMLButtonElement>('depth25dToggle');
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );
  const nodeStyleButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-node-style-option]'),
  );
  const nodeStylePreviews = Array.from(
    dialog.querySelectorAll<HTMLCanvasElement>('[data-node-style-preview]'),
  );

  const practiceConfirm = createConfirmGate(practiceTimerApply, {
    idleText: () => t('practiceTimer.apply'),
    armedText: () =>
      format('practiceTimer.confirm', { time: formatTimeLeft(0, store.get().practiceSeconds) }),
  });

  byId('settingsBtn').addEventListener('click', () => {
    practiceConfirm.disarm();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
    updateRangeFill(volumeInput);
  });
  volumeValue.addEventListener('input', () => {
    if (volumeValue.value === '') return;
    const percent = Math.min(100, Math.max(0, Number(volumeValue.value)));
    store.set({ volume: percent / 100 });
  });

  const setPracticeSeconds = (seconds: number): void => {
    store.set({ practiceSeconds: clampPracticeSeconds(seconds) });
    practiceConfirm.disarm();
  };
  practiceMinutesInput.addEventListener('input', () => {
    const ss = store.get().practiceSeconds % 60;
    setPracticeSeconds(Number(practiceMinutesInput.value) * 60 + ss);
  });
  practiceSecondsInput.addEventListener('input', () => {
    const mm = Math.floor(store.get().practiceSeconds / 60);
    setPracticeSeconds(mm * 60 + Number(practiceSecondsInput.value));
  });
  mountHoldRepeat(practiceTimeDown, () =>
    setPracticeSeconds(store.get().practiceSeconds - PRACTICE_STEP_SECONDS),
  );
  mountHoldRepeat(practiceTimeUp, () =>
    setPracticeSeconds(store.get().practiceSeconds + PRACTICE_STEP_SECONDS),
  );
  practiceTimerApply.addEventListener('click', () => {
    if (store.get().practiceSeconds <= 0) return;
    if (practiceConfirm.tap()) {
      dialog.close();
      onStartPractice();
    }
  });
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
  beatsClickableToggle.addEventListener('click', () => {
    store.set({ beatsClickable: !store.get().beatsClickable });
  });
  hapticsToggle.addEventListener('click', () => {
    store.set({ haptics: !store.get().haptics });
  });
  depth25dToggle.addEventListener('click', () => {
    store.set({ depth25d: !store.get().depth25d });
  });

  // Two-step confirm instead of window.confirm (not reliable inside the Tauri webview).
  const resetConfirm = createConfirmGate(resetBtn, {
    idleText: () => t('reset.button'),
    armedText: () => t('reset.confirm'),
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
    const theme = readTheme(dialog);
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
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    volumeValue.value = String(percent);
    updateRangeFill(volumeInput);
    practiceMinutesInput.value = String(Math.floor(s.practiceSeconds / 60));
    practiceSecondsInput.value = String(s.practiceSeconds % 60);
    practiceTimeValue.textContent =
      s.practiceSeconds > 0 ? formatTimeLeft(0, s.practiceSeconds) : t('practiceTimer.off');
    practiceTimerApply.disabled = s.practiceSeconds <= 0;
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
    beatsClickableToggle.setAttribute('aria-checked', String(s.beatsClickable));
    beatRow.classList.toggle('dim', !s.beatsClickable);
    hapticsToggle.setAttribute('aria-checked', String(s.haptics));
    depth25dToggle.setAttribute('aria-checked', String(s.depth25d));
  };
  render(store.get());
  store.subscribe(render);
}
