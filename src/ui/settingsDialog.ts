import { defaultSettings, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountSettingsDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('settingsDialog');
  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId('volumeValue');
  const offsetInput = byId<HTMLInputElement>('offsetInput');
  const offsetValue = byId('offsetValue');
  const resetBtn = byId<HTMLButtonElement>('resetBtn');

  byId('settingsBtn').addEventListener('click', () => dialog.showModal());

  volumeInput.addEventListener('input', () => {
    store.set({ volume: Number(volumeInput.value) / 100 });
  });
  offsetInput.addEventListener('input', () => {
    store.set({ syncOffsetMs: Number(offsetInput.value) });
  });

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
  };
  render(store.get());
  store.subscribe(render);
}
