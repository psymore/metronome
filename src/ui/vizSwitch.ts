import type { Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountVizSwitch({ store }: { store: Store<Settings> }): void {
  const stage = byId('stage');
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.seg-btn[data-viz]'));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      store.set({ visualizer: button.dataset.viz === 'linear' ? 'linear' : 'circular' });
    });
  }
  const render = (s: Settings) => {
    stage.dataset.viz = s.visualizer;
    for (const button of buttons) {
      button.setAttribute('aria-checked', String(button.dataset.viz === s.visualizer));
    }
  };
  render(store.get());
  store.subscribe(render);
}
