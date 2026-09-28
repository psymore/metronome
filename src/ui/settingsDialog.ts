import { format, t } from '../i18n/i18n';
import { formatTimeLeft } from '../state/practiceTimer';
import {
  clampPracticeSeconds,
  defaultSettings,
  isThemeName,
  type Settings,
} from '../state/settings';
import type { Store } from '../state/store';
import { createConfirmGate } from './confirmGate';
import { byId, closeOnBackdropClick } from './dom';
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
  const volumeValue = byId('volumeValue');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceSecondsInput = byId<HTMLInputElement>('practiceSecondsInput');
  const practiceTimeValue = byId('practiceTimeValue');
  const practiceTimeDown = byId<HTMLButtonElement>('practiceTimeDown');
  const practiceTimeUp = byId<HTMLButtonElement>('practiceTimeUp');
  const practiceTimerApply = byId<HTMLButtonElement>('practiceTimerApply');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  const depth25dToggle = byId<HTMLButtonElement>('depth25dToggle');
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
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
  });
  for (const button of themeButtons) {
    button.addEventListener('click', () => {
      const theme = button.dataset.themeOption;
      if (isThemeName(theme)) store.set({ theme });
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

  const render = (s: Settings) => {
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    practiceMinutesInput.value = String(Math.floor(s.practiceSeconds / 60));
    practiceSecondsInput.value = String(s.practiceSeconds % 60);
    practiceTimeValue.textContent =
      s.practiceSeconds > 0 ? formatTimeLeft(0, s.practiceSeconds) : t('practiceTimer.off');
    practiceTimerApply.disabled = s.practiceSeconds <= 0;
    offsetInput.value = String(s.syncOffsetMs);
    offsetValue.textContent = `${s.syncOffsetMs > 0 ? '+' : ''}${s.syncOffsetMs} ms`;
    for (const button of themeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === s.theme));
    }
    beatsClickableToggle.setAttribute('aria-checked', String(s.beatsClickable));
    beatRow.classList.toggle('dim', !s.beatsClickable);
    hapticsToggle.setAttribute('aria-checked', String(s.haptics));
    depth25dToggle.setAttribute('aria-checked', String(s.depth25d));
  };
  render(store.get());
  store.subscribe(render);
}
