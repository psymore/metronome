/**
 * Shrinks a .col label's font only when its natural width would overflow the column — no
 * per-word or per-language hardcoding. Re-run after any text change (language switch).
 */
export function fitColumnLabels(root: ParentNode = document): void {
  for (const label of root.querySelectorAll<HTMLElement>('.col .label')) {
    label.classList.remove('label-sm');
    const col = label.closest<HTMLElement>('.col');
    if (col && label.scrollWidth > col.clientWidth) {
      label.classList.add('label-sm');
    }
  }
}
