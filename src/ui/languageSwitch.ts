import { isLanguage, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export function mountLanguageSwitch({ store }: { store: Store<Settings> }): void {
  const btn = byId<HTMLButtonElement>('langBtn');
  const menu = byId('langMenu');
  const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('.lang-option'));

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== btn) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });

  for (const option of options) {
    option.addEventListener('click', () => {
      const lang = option.dataset.lang;
      if (isLanguage(lang)) store.set({ language: lang });
      close();
    });
  }

  const render = (s: Settings) => {
    for (const option of options) {
      option.setAttribute('aria-checked', String(option.dataset.lang === s.language));
    }
  };
  render(store.get());
  store.subscribe(render);
}
