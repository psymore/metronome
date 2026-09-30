import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountVizSwitch({ store }: { store: Store<Settings> }): void {
  const stage = byId('stage');
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.seg-btn[data-viz]'));
  // The whole pill acts as a single toggle: tapping either side flips the visualizer, even
  // tapping the side that's already active — no need to aim for the exact other label.
  const toggle = () =>
    store.set({ visualizer: store.get().visualizer === 'linear' ? 'circular' : 'linear' });
  for (const button of buttons) {
    button.addEventListener('click', toggle);
  }
  const render = (s: Settings) => {
    // Polyrhythm only has a circular view, so the switch is locked to Circle while it's on. The
    // saved choice is left alone, so turning polyrhythm off brings Line back if it was picked.
    const poly = s.polyrhythm.enabled;
    const shown = poly ? 'circular' : s.visualizer;
    stage.dataset.viz = shown;
    for (const button of buttons) {
      button.setAttribute('aria-checked', String(button.dataset.viz === shown));
      button.disabled = poly;
    }
  };
  render(store.get());
  store.subscribe(render);
}
