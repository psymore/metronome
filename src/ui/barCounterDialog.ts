import { format, t } from '../i18n/i18n';
import { clampTargetBars, isLoopCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { createConfirmGate } from './confirmGate';
import { byId, closeOnBackdropClick } from './dom';

export function mountBarCounterDialog({ store }: { store: Store<Settings> }): void {
  const dialog = byId<HTMLDialogElement>('barCounterDialog');
  const targetBarsValue = byId('targetBarsValue');
  const targetBarsApply = byId<HTMLButtonElement>('targetBarsApply');
  const loopButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-loop]'));

  byId('barCounter').addEventListener('click', () => {
    pendingTargetBars = store.get().targetBars;
    confirmGate.disarm();
    renderTargetBars();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  // Song length needs an explicit Apply (+ a confirm tap for a nonzero target) before it commits:
  // the stepper only adjusts a local pending value until then.
  let pendingTargetBars = store.get().targetBars;
  const confirmGate = createConfirmGate(targetBarsApply, {
    idleText: () => t('songLength.apply'),
    armedText: () => format('songLength.confirm', { n: pendingTargetBars }),
  });

  const renderTargetBars = () => {
    targetBarsValue.textContent =
      pendingTargetBars > 0 ? String(pendingTargetBars) : t('songLength.off');
  };

  const setPendingTargetBars = (n: number) => {
    pendingTargetBars = clampTargetBars(n);
    confirmGate.disarm();
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
    if (confirmGate.tap()) store.set({ targetBars: pendingTargetBars });
  });

  for (const button of loopButtons) {
    button.addEventListener('click', () => {
      const loopCount = Number(button.dataset.loop);
      if (isLoopCount(loopCount)) store.set({ loopCount });
    });
  }

  const render = (s: Settings) => {
    if (!dialog.open) {
      pendingTargetBars = s.targetBars;
      confirmGate.disarm();
      renderTargetBars();
    }
    for (const button of loopButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.loop) === s.loopCount));
    }
  };
  render(store.get());
  store.subscribe(render);
}
