import { t } from '../i18n/i18n';
import { formatTimeLeft } from '../state/practiceTimer';
import { clampPracticeSeconds, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';
import { mountIntegerInput } from './numericInput';

export interface PracticeTimerDialogDeps {
  store: Store<Settings>;
  /** Called after the user confirms starting a practice session from the dialog. */
  onStartPractice: () => void;
}

/** Seconds a single tap (or hold-repeat tick) of the practice timer's +/- buttons moves by. */
const PRACTICE_STEP_SECONDS = 15;

export function mountPracticeTimerDialog({
  store,
  onStartPractice,
}: PracticeTimerDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('practiceTimerDialog');
  const practiceMinutesInput = byId<HTMLInputElement>('practiceMinutesInput');
  const practiceSecondsInput = byId<HTMLInputElement>('practiceSecondsInput');
  const practiceTimeValue = byId('practiceTimeValue');
  const practiceTimeDown = byId<HTMLButtonElement>('practiceTimeDown');
  const practiceTimeUp = byId<HTMLButtonElement>('practiceTimeUp');
  const practiceTimerApply = byId<HTMLButtonElement>('practiceTimerApply');

  let confirmState: 'idle' | 'confirming' = 'idle';
  let confirmTimeout: ReturnType<typeof setTimeout> | undefined;

  const resetConfirm = (): void => {
    clearTimeout(confirmTimeout);
    confirmTimeout = undefined;
    confirmState = 'idle';
    practiceTimerApply.innerHTML = '';
    practiceTimerApply.textContent = t('practiceTimer.apply');
    practiceTimerApply.classList.remove('is-confirming');
  };

  byId('timerBtn').addEventListener('click', () => {
    resetConfirm();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  const setPracticeSeconds = (seconds: number): void => {
    store.set({ practiceSeconds: clampPracticeSeconds(seconds) });
    resetConfirm();
  };
  mountIntegerInput(practiceMinutesInput, (minutes) => {
    const ss = store.get().practiceSeconds % 60;
    setPracticeSeconds(minutes * 60 + ss);
  });
  mountIntegerInput(practiceSecondsInput, (seconds) => {
    const mm = Math.floor(store.get().practiceSeconds / 60);
    setPracticeSeconds(mm * 60 + seconds);
  });
  mountHoldRepeat(practiceTimeDown, () =>
    setPracticeSeconds(store.get().practiceSeconds - PRACTICE_STEP_SECONDS),
  );
  mountHoldRepeat(practiceTimeUp, () =>
    setPracticeSeconds(store.get().practiceSeconds + PRACTICE_STEP_SECONDS),
  );
  practiceTimerApply.addEventListener('click', () => {
    if (store.get().practiceSeconds <= 0) return;

    if (confirmState === 'idle') {
      confirmState = 'confirming';
      practiceTimerApply.classList.add('is-confirming');

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'confirm-cancel-btn';
      cancelBtn.textContent = '✕';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetConfirm();
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'confirm-confirm-btn';
      confirmBtn.textContent = '✓';
      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dialog.close();
        onStartPractice();
        resetConfirm();
      });

      practiceTimerApply.innerHTML = '';
      practiceTimerApply.appendChild(cancelBtn);
      practiceTimerApply.appendChild(confirmBtn);

      confirmTimeout = setTimeout(resetConfirm, 3000);
    }
  });

  const render = (s: Settings) => {
    practiceMinutesInput.value = String(Math.floor(s.practiceSeconds / 60));
    practiceSecondsInput.value = String(s.practiceSeconds % 60);
    practiceTimeValue.textContent =
      s.practiceSeconds > 0 ? formatTimeLeft(0, s.practiceSeconds) : t('practiceTimer.off');
    practiceTimerApply.disabled = s.practiceSeconds <= 0;
  };
  render(store.get());
  store.subscribe(render);
}
