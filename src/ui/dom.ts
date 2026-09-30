export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/**
 * A click lands on the <dialog> element itself only when it hits the
 * ::backdrop (a click inside the dialog's own box always hits a child).
 */
export function closeOnBackdropClick(dialog: HTMLDialogElement): void {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

/** Reflects a range input's value as a left-filled/right-empty track (Chrome/WebKit have no
 *  native ::-webkit-slider-progress, unlike Firefox's ::-moz-range-progress already used in
 *  styles.css — this custom property drives the same gradient there). */
export function updateRangeFill(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const percent = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--range-fill', `${percent}%`);
}
