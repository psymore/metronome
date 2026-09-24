import { format, t } from '../i18n/i18n';
import { defaultSettings, isThemeName, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';

export function mountSettingsDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId('volumeValue');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceMinutesValue = byId('practiceMinutesValue');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );

  byId('settingsBtn').addEventListener('click', () => dialog.showModal());
  closeOnBackdropClick(dialog);

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
  });
  practiceMinutesInput.addEventListener('input', () => {
    store.set({ practiceMinutes: Number(practiceMinutesInput.value) });
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
  let armed: ReturnType<typeof setTimeout> | undefined;
  resetBtn.addEventListener('click', () => {
    if (armed === undefined) {
      resetBtn.textContent = t('reset.confirm');
      armed = setTimeout(() => {
        armed = undefined;
        resetBtn.textContent = t('reset.button');
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = undefined;
    resetBtn.textContent = t('reset.button');
    store.set(defaultSettings());
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
