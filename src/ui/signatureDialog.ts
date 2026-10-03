import {
  BEAT_UNITS,
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
import { mountIntegerInput } from './numericInput';

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

  // Tapping the resulting signature opens a small dialog with two drum pickers (native
  // scroll-snap columns) for beats / note value. Nothing is applied while scrolling: Save commits
  // both wheels at once, Cancel (or a backdrop tap) leaves the signature as it was. Wheels can
  // only be positioned while their dialog is open (no layout when closed), so they are synced to
  // the current signature right after showModal.
  const beatValues = Array.from({ length: 16 }, (_, i) => i + 1);
  const mountWheel = (el: HTMLElement, values: readonly number[]) => {
    el.replaceChildren(
      ...values.map((v) => {
        const item = document.createElement('div');
        item.textContent = String(v);
        return item;
      }),
    );
    // Scroll distance between neighbouring values, taken from the scroll range itself: unlike
    // getBoundingClientRect it isn't skewed by the dialog's opening transform, and unlike
    // offsetHeight it doesn't round (the error would add up over 16 items).
    const itemHeight = () => (el.scrollHeight - el.clientHeight) / (values.length - 1);
    const index = () => Math.round(el.scrollTop / (itemHeight() || 1));
    /** Highlights whichever value currently sits between the two guide lines. */
    const markPicked = () => {
      const picked = index();
      Array.from(el.children).forEach((child, i) => {
        child.classList.toggle('is-picked', i === picked);
      });
    };
    el.addEventListener('scroll', markPicked);
    return {
      /** The value currently resting between the guide lines. */
      value: () => values[index()],
      set: (value: number) => {
        const target = values.indexOf(value);
        if (target >= 0) el.scrollTop = target * itemHeight();
        markPicked();
      },
    };
  };
  const topWheel = mountWheel(byId('sigWheelTop'), beatValues);
  const bottomWheel = mountWheel(byId('sigWheelBottom'), BEAT_UNITS);

  const wheelDialog = byId<HTMLDialogElement>('sigWheelDialog');
  closeOnBackdropClick(wheelDialog);
  byId('sigWheelCancel').addEventListener('click', () => wheelDialog.close());
  byId('sigWheelSave').addEventListener('click', () => {
    const beats = topWheel.value();
    const unit = bottomWheel.value();
    if (beats !== undefined && isBeatUnit(unit)) store.set(withSignature(beats, unit));
    wheelDialog.close();
  });
  byId('sigResultBtn').addEventListener('click', () => {
    wheelDialog.showModal();
    topWheel.set(store.get().beatsPerBar);
    bottomWheel.set(store.get().beatUnit);
  });

  byId('signatureBtn').addEventListener('click', () => {
    dialog.showModal();
    updatePresetsFade();
  });
  closeOnBackdropClick(dialog);

  // Unlocking is instant; locking asks first, since a locked visualiser silently ignores taps.
  const lockDialog = byId<HTMLDialogElement>('beatsLockDialog');
  closeOnBackdropClick(lockDialog);
  byId('beatsLockCancel').addEventListener('click', () => lockDialog.close());
  byId('beatsLockConfirm').addEventListener('click', () => {
    store.set({ beatsClickable: false });
    lockDialog.close();
  });
  beatsClickableToggle.addEventListener('click', () => {
    if (store.get().beatsClickable) lockDialog.showModal();
    else store.set({ beatsClickable: true });
  });

  const setBeats = (n: number) => store.set(withSignature(n, store.get().beatUnit));
  mountHoldRepeat(byId('beatsDown'), () => setBeats(store.get().beatsPerBar - 1));
  mountHoldRepeat(byId('beatsUp'), () => setBeats(store.get().beatsPerBar + 1));
  mountIntegerInput(beatsValue, setBeats);

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
    // Outside poly mode the hint always keeps its line (just invisible when it doesn't apply), so
    // toggling a compound meter never shifts the rest of the sheet.
    compoundHint.hidden = s.polyrhythm.enabled;
    compoundHint.classList.toggle('is-idle', !compound);
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
