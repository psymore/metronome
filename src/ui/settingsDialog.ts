import { format, t } from '../i18n/i18n';
import { defaultSettings, isThemeName, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { createConfirmGate } from './confirmGate';
import { byId, closeOnBackdropClick } from './dom';

export interface SettingsDialogDeps {
  store: Store<Settings>;
  /** Called after the user confirms starting a practice session from the dialog. */
  onStartPractice: () => void;
}

export function mountSettingsDialog({ store, onStartPractice }: SettingsDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId('volumeValue');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceMinutesValue = byId('practiceMinutesValue');
  const practiceTimerApply = byId<HTMLButtonElement>('practiceTimerApply');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );

  const practiceConfirm = createConfirmGate(practiceTimerApply, {
    idleText: () => t('practiceTimer.apply'),
    armedText: () => format('practiceTimer.confirm', { n: store.get().practiceMinutes }),
  });

  byId('settingsBtn').addEventListener('click', () => {
    practiceConfirm.disarm();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
  });
  practiceMinutesInput.addEventListener('input', () => {
    store.set({ practiceMinutes: Number(practiceMinutesInput.value) });
    practiceConfirm.disarm();
  });
  practiceTimerApply.addEventListener('click', () => {
    if (store.get().practiceMinutes <= 0) return;
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
    practiceMinutesInput.value = String(s.practiceMinutes);
    practiceMinutesValue.textContent =
      s.practiceMinutes > 0
        ? format('practiceTimer.minutes', { n: s.practiceMinutes })
        : t('practiceTimer.off');
    practiceTimerApply.disabled = s.practiceMinutes <= 0;
    offsetInput.value = String(s.syncOffsetMs);
    offsetValue.textContent = `${s.syncOffsetMs > 0 ? '+' : ''}${s.syncOffsetMs} ms`;
    for (const button of themeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === s.theme));
    }
    beatsClickableToggle.setAttribute('aria-checked', String(s.beatsClickable));
    beatRow.classList.toggle('dim', !s.beatsClickable);
    hapticsToggle.setAttribute('aria-checked', String(s.haptics));
  };
  render(store.get());
  store.subscribe(render);
}
