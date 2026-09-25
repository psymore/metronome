import { createTopLayerHost } from './topLayerHost';

export type InfoPopup = (message: string) => void;

/** A centered, boldly-bordered popup for info-button explanations — distinct from the
 *  bottom toast used for status messages. Dismisses on its own timeout, an early tap, or a
 *  click anywhere outside it (the info button's own click stops propagation so the same tap
 *  that opens it doesn't immediately close it again). */
export function createInfoPopup(el: HTMLElement, durationMs = 5000): InfoPopup {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reparent = createTopLayerHost(el);

  const hide = (): void => {
    el.hidden = true;
  };
  el.addEventListener('click', hide);
  document.addEventListener('click', (e) => {
    if (!el.hidden && !el.contains(e.target as Node)) hide();
  });

  return (message) => {
    reparent();
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, durationMs);
  };
}
