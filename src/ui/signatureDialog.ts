import { format, t } from '../i18n/i18n';
import {
  clampTargetBars,
  compoundAccentLevels,
  isBeatUnit,
  isCompoundMeter,
  isSubdivision,
  type Settings,
  withBeatsPerBar,
} from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';

export function mountSignatureDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('signatureDialog');
  const beatsValue = byId('beatsValue');
  const targetBarsValue = byId('targetBarsValue');
  const targetBarsApply = byId<HTMLButtonElement>('targetBarsApply');
  const unitButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-unit]'));
  const subdivisionButtons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-subdivision]'),
  );
  const presetButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-preset]'));

  byId('signatureBtn').addEventListener('click', () => {
    pendingTargetBars = store.get().targetBars;
    disarmApply();
    renderTargetBars();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  const setBeats = (n: number) => store.set(withBeatsPerBar(store.get(), n));
  byId('beatsDown').addEventListener('click', () => setBeats(store.get().beatsPerBar - 1));
  byId('beatsUp').addEventListener('click', () => setBeats(store.get().beatsPerBar + 1));

  // Song length needs an explicit Apply (+ a confirm tap for a nonzero target) before it commits:
  // the stepper only adjusts a local pending value until then.
  let pendingTargetBars = store.get().targetBars;
  let lastCommittedTargetBars = pendingTargetBars;
  let armed: ReturnType<typeof setTimeout> | undefined;

  const disarmApply = () => {
    clearTimeout(armed);
    armed = undefined;
    targetBarsApply.textContent = t('songLength.apply');
  };

  const renderTargetBars = () => {
    targetBarsValue.textContent =
      pendingTargetBars > 0 ? String(pendingTargetBars) : t('songLength.off');
  };

  const setPendingTargetBars = (n: number) => {
    pendingTargetBars = clampTargetBars(n);
    disarmApply();
    renderTargetBars();
  };
  byId('targetBarsDown').addEventListener('click', () =>
    setPendingTargetBars(pendingTargetBars - 1),
  );
  byId('targetBarsUp').addEventListener('click', () => setPendingTargetBars(pendingTargetBars + 1));

  targetBarsApply.addEventListener('click', () => {
    if (pendingTargetBars <= 0) {
      store.set({ targetBars: 0 });
      return;
    }
    if (armed === undefined) {
      targetBarsApply.textContent = format('songLength.confirm', { n: pendingTargetBars });
      armed = setTimeout(disarmApply, 3000);
      return;
    }
    disarmApply();
    store.set({ targetBars: pendingTargetBars });
  });

  for (const button of unitButtons) {
    button.addEventListener('click', () => {
      const unit = Number(button.dataset.unit);
      if (isBeatUnit(unit)) store.set({ beatUnit: unit });
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
      store.set({
        ...withBeatsPerBar(store.get(), top),
        beatUnit: bottom,
        ...(isCompoundMeter(top, bottom) ? { levels: compoundAccentLevels(top) } : {}),
      });
    });
  }

  const render = (s: Settings) => {
    beatsValue.textContent = String(s.beatsPerBar);
    if (s.targetBars !== lastCommittedTargetBars) {
      lastCommittedTargetBars = s.targetBars;
      pendingTargetBars = s.targetBars;
      disarmApply();
    }
    renderTargetBars();
    for (const button of unitButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.unit) === s.beatUnit));
    }
    for (const button of subdivisionButtons) {
      button.setAttribute(
        'aria-checked',
        String(Number(button.dataset.subdivision) === s.subdivision),
      );
    }
    const current = `${s.beatsPerBar}/${s.beatUnit}`;
    for (const button of presetButtons) {
      button.classList.toggle('active', button.dataset.preset === current);
    }
  };
  render(store.get());
  store.subscribe(render);
}
