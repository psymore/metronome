import { t } from '../i18n/i18n';
import { clampTargetBars, isLoopCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';
import type { Toast } from './toast';

export function mountBarCounterDialog({
  store,
  toast,
}: {
  store: Store<Settings>;
  toast: Toast;
}): void {
  const dialog = byId<HTMLDialogElement>('barCounterDialog');
  const targetBarsValue = byId<HTMLInputElement>('targetBarsValue');
  const targetBarsApply = byId<HTMLButtonElement>('targetBarsApply');
  const loopButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-loop]'));

  byId('barCounter').addEventListener('click', () => {
    pendingTargetBars = store.get().targetBars;
    renderTargetBars();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  // Song length needs an explicit Apply before it commits: the stepper only adjusts a local
  // pending value until then.
  let pendingTargetBars = store.get().targetBars;

  const renderTargetBars = () => {
    targetBarsValue.value = String(pendingTargetBars);
  };

  const setPendingTargetBars = (n: number) => {
    pendingTargetBars = clampTargetBars(n);
    renderTargetBars();
  };
  mountHoldRepeat(byId('targetBarsDown'), () => setPendingTargetBars(pendingTargetBars - 1));
  mountHoldRepeat(byId('targetBarsUp'), () => setPendingTargetBars(pendingTargetBars + 1));
  targetBarsValue.addEventListener('input', () => {
    if (targetBarsValue.value !== '') setPendingTargetBars(Number(targetBarsValue.value));
  });

  const barCounterBtn = byId('barCounter');
  const flashCounter = () => {
    barCounterBtn.classList.remove('just-set');
    void barCounterBtn.offsetWidth; // restart the animation if it's already running
    barCounterBtn.classList.add('just-set');
  };
  barCounterBtn.addEventListener('animationend', () => barCounterBtn.classList.remove('just-set'));

  targetBarsApply.addEventListener('click', () => {
    const current = store.get().targetBars;
    if (pendingTargetBars <= 0 && current <= 0) {
      toast(t('songLength.needsLength'));
      return;
    }
    store.set({ targetBars: Math.max(0, pendingTargetBars) });
    dialog.close();
    flashCounter();
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
      renderTargetBars();
    }
    for (const button of loopButtons) {
      button.setAttribute('aria-checked', String(Number(button.dataset.loop) === s.loopCount));
    }
  };
  render(store.get());
  store.subscribe(render);
}
