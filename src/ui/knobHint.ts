const STORAGE_KEY = 'knobHintShown';

function hasShown(storage: Storage | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markShown(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private window or storage disabled — the hint just replays next launch instead.
  }
}

/** Plays the knob's one-time "this turns" cue (see .knob-hint in styles.css) on first launch
 *  only, then removes the element so it never costs anything again. */
export function mountKnobHint(el: HTMLElement, storage: Storage | undefined): void {
  if (hasShown(storage)) {
    el.remove();
    return;
  }
  markShown(storage);
  el.classList.add('show');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
