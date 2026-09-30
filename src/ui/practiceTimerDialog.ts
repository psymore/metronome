import { format, t } from '../i18n/i18n';
import { formatTimeLeft } from '../state/practiceTimer';
import { clampPracticeSeconds, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { createConfirmGate } from './confirmGate';
import { byId, closeOnBackdropClick } from './dom';
import { mountHoldRepeat } from './holdRepeat';

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

  const practiceConfirm = createConfirmGate(practiceTimerApply, {
    idleText: () => t('practiceTimer.apply'),
    armedText: () =>
      format('practiceTimer.confirm', { time: formatTimeLeft(0, store.get().practiceSeconds) }),
  });

  byId('timerBtn').addEventListener('click', () => {
    practiceConfirm.disarm();
    dialog.showModal();
  });
  closeOnBackdropClick(dialog);

  const setPracticeSeconds = (seconds: number): void => {
    store.set({ practiceSeconds: clampPracticeSeconds(seconds) });
    practiceConfirm.disarm();
  };
  practiceMinutesInput.addEventListener('input', () => {
    const ss = store.get().practiceSeconds % 60;
    setPracticeSeconds(Number(practiceMinutesInput.value) * 60 + ss);
  });
  practiceSecondsInput.addEventListener('input', () => {
    const mm = Math.floor(store.get().practiceSeconds / 60);
    setPracticeSeconds(mm * 60 + Number(practiceSecondsInput.value));
  });
  mountHoldRepeat(practiceTimeDown, () =>
    setPracticeSeconds(store.get().practiceSeconds - PRACTICE_STEP_SECONDS),
  );
  mountHoldRepeat(practiceTimeUp, () =>
    setPracticeSeconds(store.get().practiceSeconds + PRACTICE_STEP_SECONDS),
  );
  practiceTimerApply.addEventListener('click', () => {
    if (store.get().practiceSeconds <= 0) return;
    if (practiceConfirm.tap()) {
      dialog.close();
      onStartPractice();
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
