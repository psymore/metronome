export type Toast = (message: string) => void;

export function createToast(el: HTMLElement, durationMs = 4500): Toast {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const home = el.parentElement;
  const homeAnchor = el.nextSibling;

  // A modal <dialog> is promoted to the browser's top layer, so a plain position:fixed toast
  // paints underneath its backdrop no matter its z-index. Move the toast into the open dialog
  // so it shares that top layer, and back to its normal spot once nothing is open.
  const reparent = (): void => {
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog) {
      if (el.parentElement !== openDialog) openDialog.append(el);
    } else if (el.parentElement !== home) {
      home?.insertBefore(el, homeAnchor);
    }
  };

  return (message) => {
    reparent();
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  };
}
