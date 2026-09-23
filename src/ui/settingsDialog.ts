import { defaultSettings, isThemeName, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';

export function mountSettingsDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId('volumeValue');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');
  const themeButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-theme-option]'),
  );

  byId('settingsBtn').addEventListener('click', () => dialog.showModal());
  closeOnBackdropClick(dialog);

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
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

  // Two-step confirm instead of window.confirm (not reliable inside the Tauri webview).
  let armed: ReturnType<typeof setTimeout> | undefined;
  resetBtn.addEventListener('click', () => {
    if (armed === undefined) {
      resetBtn.textContent = 'Click again to reset (your sounds are kept)';
      armed = setTimeout(() => {
        armed = undefined;
        resetBtn.textContent = 'Reset all settings';
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = undefined;
    resetBtn.textContent = 'Reset all settings';
    store.set(defaultSettings());
  });

  const render = (s: Settings) => {
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    offsetInput.value = String(s.syncOffsetMs);
    offsetValue.textContent = `${s.syncOffsetMs > 0 ? '+' : ''}${s.syncOffsetMs} ms`;
    for (const button of themeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === s.theme));
    }
  };
  render(store.get());
  store.subscribe(render);
}
