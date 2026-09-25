import type { InfoPopup } from './infoPopup';

/**
 * Info buttons carry their explanation as a `title` tooltip, which only shows on hover — never
 * on tap. This gives touch users a way to see it too, via the centered info popup.
 */
export function mountInfoButtons(showInfo: InfoPopup, root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('.info-btn')) {
    button.addEventListener('click', (e) => {
      // The popup closes on any outside click; without this, the same tap that opens it
      // would bubble to that document-level listener and close it right back again.
      e.stopPropagation();
      const message = button.title || button.getAttribute('aria-label');
      if (message) showInfo(message);
    });
  }
}
