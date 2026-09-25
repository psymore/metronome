import type { Toast } from './toast';

/**
 * Info buttons carry their explanation as a `title` tooltip, which only shows on hover — never
 * on tap. This gives touch users a way to see it too, via the toast.
 */
export function mountInfoButtons(toast: Toast, root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('.info-btn')) {
    button.addEventListener('click', () => {
      const message = button.title || button.getAttribute('aria-label');
      if (message) toast(message);
    });
  }
}
