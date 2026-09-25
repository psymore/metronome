/**
 * Keeps `el` visible above a modal <dialog>. A modal dialog is promoted to the browser's top
 * layer, so a plain position:fixed sibling paints underneath its backdrop regardless of
 * z-index. The fix is to move `el` into the open dialog so it shares that top layer, and back
 * to its normal spot once nothing is open. Returns a function to call right before `el` is shown.
 */
export function createTopLayerHost(el: HTMLElement): () => void {
  const home = el.parentElement;
  const homeAnchor = el.nextSibling;
  return () => {
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog) {
      if (el.parentElement !== openDialog) openDialog.append(el);
    } else if (el.parentElement !== home) {
      home?.insertBefore(el, homeAnchor);
    }
  };
}
