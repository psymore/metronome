const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_STROKE = 3;
const RING_RADIUS = 12;

interface ConfirmRing {
  label: HTMLSpanElement;
  rect: SVGRectElement;
}

/** Wraps the button's text in its own span (so the ring's SVG can live alongside it without
 *  being wiped out by `textContent =`), and creates that ring SVG, once per button. Moves any
 *  data-i18n from the button onto the label span, otherwise the next applyTranslations() call
 *  (main.ts runs it right after mounting) would set the *button's* textContent directly and
 *  wipe out both the span and the ring. */
function ensureConfirmRing(button: HTMLButtonElement): ConfirmRing {
  let label = button.querySelector<HTMLSpanElement>('.confirm-gate-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'confirm-gate-label';
    label.textContent = button.textContent;
    if (button.dataset.i18n) {
      label.dataset.i18n = button.dataset.i18n;
      delete button.dataset.i18n;
    }
    button.replaceChildren(label);
  }
  let rect = button.querySelector<SVGRectElement>('.confirm-ring-rect');
  if (!rect) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'confirm-ring');
    svg.setAttribute('aria-hidden', 'true');
    rect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    rect.setAttribute('class', 'confirm-ring-rect');
    svg.append(rect);
    button.append(svg);
  }
  return { label, rect };
}

/** Sizes the ring to the button's current dimensions and starts its sweep from fully hidden. */
function armRing(button: HTMLButtonElement, rect: SVGRectElement): void {
  const w = Math.max(0, button.clientWidth - RING_STROKE);
  const h = Math.max(0, button.clientHeight - RING_STROKE);
  rect.setAttribute('x', String(RING_STROKE / 2));
  rect.setAttribute('y', String(RING_STROKE / 2));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  rect.setAttribute('rx', String(Math.max(0, Math.min(RING_RADIUS, w / 2, h / 2))));
  const length = rect.getTotalLength();
  rect.style.strokeDasharray = String(length);
  rect.style.strokeDashoffset = String(length);
  rect.classList.add('confirm-armed');
}

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
  const { label, rect } = ensureConfirmRing(button);
  let armed: ReturnType<typeof setTimeout> | undefined;

  const disarm = (): void => {
    clearTimeout(armed);
    armed = undefined;
    label.textContent = opts.idleText();
    rect.classList.remove('confirm-armed');
  };

  /** Call from the button's click handler. Returns true when this tap confirms. */
  const tap = (): boolean => {
    if (armed === undefined) {
      label.textContent = opts.armedText();
      armRing(button, rect);
      armed = setTimeout(disarm, windowMs);
      return false;
    }
    disarm();
    return true;
  };

  return { tap, disarm };
}
