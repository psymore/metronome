import { createTopLayerHost } from './topLayerHost';

export type InfoPopup = (message: string) => void;

/** A centered, boldly-bordered popup for info-button explanations — distinct from the
 *  bottom toast used for status messages. Dismisses on its own timeout or an early tap. */
export function createInfoPopup(el: HTMLElement, durationMs = 5000): InfoPopup {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reparent = createTopLayerHost(el);

  const hide = (): void => {
    el.hidden = true;
  };
  el.addEventListener('click', hide);

  return (message) => {
    reparent();
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, durationMs);
  };
}
