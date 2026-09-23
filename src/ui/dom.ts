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
