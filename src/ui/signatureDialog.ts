import {
  compoundAccentLevels,
  isBeatUnit,
  isCompoundMeter,
  type Settings,
  withBeatsPerBar,
} from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';

export function mountSignatureDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('signatureDialog');
  const beatsValue = byId('beatsValue');
  const unitButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-unit]'));
  const presetButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-preset]'));

  byId('signatureBtn').addEventListener('click', () => dialog.showModal());
  closeOnBackdropClick(dialog);

  const setBeats = (n: number) => store.set(withBeatsPerBar(store.get(), n));
  byId('beatsDown').addEventListener('click', () => setBeats(store.get().beatsPerBar - 1));
  byId('beatsUp').addEventListener('click', () => setBeats(store.get().beatsPerBar + 1));

  for (const button of unitButtons) {
    button.addEventListener('click', () => {
      const unit = Number(button.dataset.unit);
      if (isBeatUnit(unit)) store.set({ beatUnit: unit });
    });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const [top, bottom] = (button.dataset.preset ?? '').split('/').map(Number);
      if (!top || !isBeatUnit(bottom)) return;
      store.set({
        ...withBeatsPerBar(store.get(), top),
        beatUnit: bottom,
        ...(isCompoundMeter(top, bottom) ? { levels: compoundAccentLevels(top) } : {}),
      });
    });
  }

  const render = (s: Settings) => {
    beatsValue.textContent = String(s.beatsPerBar);
    for (const button of unitButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.unit) === s.beatUnit));
    }
    const current = `${s.beatsPerBar}/${s.beatUnit}`;
    for (const button of presetButtons) {
      button.classList.toggle('active', button.dataset.preset === current);
    }
  };
  render(store.get());
  store.subscribe(render);
}
