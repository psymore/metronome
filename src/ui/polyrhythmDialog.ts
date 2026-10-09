import { clampPolyCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';
import { mountHoldRepeat } from './holdRepeat';
import { mountIntegerInput } from './numericInput';

export interface PolyrhythmControlsDeps {
  store: Store<Settings>;
}

/** Lives inside the existing #signatureDialog sheet (see signatureDialog.ts) — a separate
 *  module purely to keep each file focused on one concern within the shared dialog. The layer
 *  sounds are picked in the Sound dialog (see soundDialog.ts), like every other sound. */
export function mountPolyrhythmControls({ store }: PolyrhythmControlsDeps): void {
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#signatureDialog [data-sig-mode]'),
  );
  const standardBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('#signatureDialog [data-standard-block]'),
  );
  const polyBlock = byId('polyBlock');
  const aValue = byId<HTMLInputElement>('polyAValue');
  const bValue = byId<HTMLInputElement>('polyBValue');

  const setMode = (enabled: boolean) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, enabled } });
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.sigMode === 'polyrhythm'));
  }

  const setA = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, a: clampPolyCount(n) } });
  const setB = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, b: clampPolyCount(n) } });
  mountHoldRepeat(byId('polyADown'), () => setA(store.get().polyrhythm.a - 1));
  mountHoldRepeat(byId('polyAUp'), () => setA(store.get().polyrhythm.a + 1));
  mountHoldRepeat(byId('polyBDown'), () => setB(store.get().polyrhythm.b - 1));
  mountHoldRepeat(byId('polyBUp'), () => setB(store.get().polyrhythm.b + 1));
  mountIntegerInput(aValue, setA);
  mountIntegerInput(bValue, setB);

  const render = (s: Settings) => {
    const enabled = s.polyrhythm.enabled;
    for (const button of modeButtons) {
      const isPoly = button.dataset.sigMode === 'polyrhythm';
      button.setAttribute('aria-checked', String(isPoly === enabled));
    }
    polyBlock.hidden = !enabled;
    for (const block of standardBlocks) block.hidden = enabled;
    aValue.value = String(s.polyrhythm.a);
    bValue.value = String(s.polyrhythm.b);
  };

  render(store.get());
  store.subscribe(render);
}
