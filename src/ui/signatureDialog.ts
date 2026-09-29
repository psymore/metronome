import {
  isBeatUnit,
  isCompoundMeter,
  isSubdivision,
  type Settings,
  withSignature,
} from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';

export function mountSignatureDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('signatureDialog');
  const beatsValue = byId('beatsValue');
  const unitButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-unit]'));
  const subdivisionButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-subdivision]'),
  );
  const presetButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-preset]'));
  const compoundHint = byId('subdivisionCompoundHint');

  byId('signatureBtn').addEventListener('click', () => dialog.showModal());
  closeOnBackdropClick(dialog);

  const setBeats = (n: number) => store.set(withSignature(n, store.get().beatUnit));
  mountHoldRepeat(byId('beatsDown'), () => setBeats(store.get().beatsPerBar - 1));
  mountHoldRepeat(byId('beatsUp'), () => setBeats(store.get().beatsPerBar + 1));

  for (const button of unitButtons) {
    button.addEventListener('click', () => {
      const unit = Number(button.dataset.unit);
      if (isBeatUnit(unit)) store.set(withSignature(store.get().beatsPerBar, unit));
    });
  }

  for (const button of subdivisionButtons) {
    button.addEventListener('click', () => {
      const subdivision = Number(button.dataset.subdivision);
      if (isSubdivision(subdivision)) store.set({ subdivision });
    });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const [top, bottom] = (button.dataset.preset ?? '').split('/').map(Number);
      if (!top || !isBeatUnit(bottom)) return;
      store.set(withSignature(top, bottom));
    });
  }

  const render = (s: Settings) => {
    beatsValue.textContent = String(s.beatsPerBar);
    for (const button of unitButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.unit) === s.beatUnit));
    }
    const compound = isCompoundMeter(s.beatsPerBar, s.beatUnit);
    for (const button of subdivisionButtons) {
      button.setAttribute(
        'aria-checked',
        String(Number(button.dataset.subdivision) === s.subdivision),
      );
      button.disabled = compound;
    }
    compoundHint.hidden = !compound;
    const current = `${s.beatsPerBar}/${s.beatUnit}`;
    for (const button of presetButtons) {
      button.setAttribute('aria-checked', String(button.dataset.preset === current));
    }
  };
  render(store.get());
  store.subscribe(render);
}
