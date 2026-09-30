import {
  isBeatUnit,
  isCompoundMeter,
  isSubdivision,
  patternFromSettings,
  type Settings,
  withSignature,
  withSubdivision,
} from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';

export function mountSignatureDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('signatureDialog');
  const beatsValue = byId<HTMLInputElement>('beatsValue');
  const beatsClickableToggle = byId<HTMLButtonElement>('beatsClickableToggle');
  const beatRow = byId('beatRow');
  const unitButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-unit]'));
  const subdivisionButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-subdivision]'),
  );
  const presetButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-preset]'));
  const compoundHint = byId('subdivisionCompoundHint');
  const subHint = byId('subHint');
  const sigResultTop = byId('sigResultTop');
  const sigResultBottom = byId('sigResultBottom');
  const presetsStrip = byId('presetsStrip');

  const updatePresetsFade = () => {
    const atEnd =
      presetsStrip.scrollLeft + presetsStrip.clientWidth >= presetsStrip.scrollWidth - 1;
    presetsStrip.classList.toggle('has-more', !atEnd);
  };
  presetsStrip.addEventListener('scroll', updatePresetsFade);

  byId('signatureBtn').addEventListener('click', () => {
    dialog.showModal();
    updatePresetsFade();
  });
  closeOnBackdropClick(dialog);

  beatsClickableToggle.addEventListener('click', () => {
    store.set({ beatsClickable: !store.get().beatsClickable });
  });

  const setBeats = (n: number) => store.set(withSignature(n, store.get().beatUnit));
  mountHoldRepeat(byId('beatsDown'), () => setBeats(store.get().beatsPerBar - 1));
  mountHoldRepeat(byId('beatsUp'), () => setBeats(store.get().beatsPerBar + 1));
  beatsValue.addEventListener('input', () => {
    if (beatsValue.value !== '') setBeats(Number(beatsValue.value));
  });

  for (const button of unitButtons) {
    button.addEventListener('click', () => {
      const unit = Number(button.dataset.unit);
      if (isBeatUnit(unit)) store.set(withSignature(store.get().beatsPerBar, unit));
    });
  }

  for (const button of subdivisionButtons) {
    button.addEventListener('click', () => {
      const subdivision = Number(button.dataset.subdivision);
      if (isSubdivision(subdivision)) store.set(withSubdivision(subdivision));
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
    beatsValue.value = String(s.beatsPerBar);
    sigResultTop.textContent = String(s.beatsPerBar);
    sigResultBottom.textContent = String(s.beatUnit);
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
    compoundHint.hidden = !compound || s.polyrhythm.enabled;
    subHint.hidden = patternFromSettings(s).subdivision <= 1;
    const current = `${s.beatsPerBar}/${s.beatUnit}`;
    for (const button of presetButtons) {
      button.setAttribute('aria-checked', String(button.dataset.preset === current));
    }
    beatsClickableToggle.setAttribute('aria-checked', String(s.beatsClickable));
    beatRow.classList.toggle('dim', !s.beatsClickable);
  };
  render(store.get());
  store.subscribe(render);
}
