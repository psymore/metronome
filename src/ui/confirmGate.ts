/**
 * "Tap again to confirm" gate, shared by the reset, practice-timer and song-length Apply
 * buttons: the first tap arms a timed window (armed text + a green→red countdown border), a
 * second tap inside it confirms, letting it expire disarms silently.
 */
export function createConfirmGate(
  button: HTMLButtonElement,
  opts: { idleText: () => string; armedText: () => string; windowMs?: number },
): { tap: () => boolean; disarm: () => void } {
  const windowMs = opts.windowMs ?? 3000;
  let armed: ReturnType<typeof setTimeout> | undefined;

  const disarm = (): void => {
    clearTimeout(armed);
    armed = undefined;
    button.textContent = opts.idleText();
    button.classList.remove('confirm-armed');
  };

  /** Call from the button's click handler. Returns true when this tap confirms. */
  const tap = (): boolean => {
    if (armed === undefined) {
      button.textContent = opts.armedText();
      button.classList.add('confirm-armed');
      armed = setTimeout(disarm, windowMs);
      return false;
    }
    disarm();
    return true;
  };

  return { tap, disarm };
}
