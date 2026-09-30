import { createTopLayerHost } from './topLayerHost';

export type InfoPopup = (message: string) => void;

/** A centered, boldly-bordered popup for info-button explanations — distinct from the
 *  bottom toast used for status messages. Stays open until tapped outside, dismissed with
 *  the close button, or Escape is pressed. */
export function createInfoPopup(el: HTMLElement): InfoPopup {
  const reparent = createTopLayerHost(el);
  const text = el.querySelector<HTMLElement>('.info-popup-text') ?? el;
  const hide = (): void => {
    el.hidden = true;
  };
  el.querySelector('.info-popup-close')?.addEventListener('click', hide);
  document.addEventListener('click', (e) => {
    if (!el.hidden && !el.contains(e.target as Node)) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) hide();
  });
  return (message) => {
    reparent();
    text.textContent = message;
    el.hidden = false;
  };
}
