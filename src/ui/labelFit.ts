/**
 * Shrinks every .col label's font together, as one all-or-nothing decision, whenever any single
 * one of them would overflow its column — no per-word or per-language hardcoding. Deciding this
 * per label independently (the previous behavior) let "Signature"/"Settings" land at a different
 * size than "Sound" depending on which ones happened to overflow, so labels never matched each
 * other. Re-run after any text change (language switch).
 */
export function fitColumnLabels(root: ParentNode = document): void {
  const labels = Array.from(root.querySelectorAll<HTMLElement>('.col .label'));
  for (const label of labels) label.classList.remove('label-sm');
  const anyOverflows = labels.some((label) => {
    const col = label.closest<HTMLElement>('.col');
    return col && label.scrollWidth > col.clientWidth;
  });
  if (anyOverflows) {
    for (const label of labels) label.classList.add('label-sm');
  }
}
