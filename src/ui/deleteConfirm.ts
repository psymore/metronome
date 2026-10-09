// Delete button: inline confirm pattern — first click splits to [ ✕ | ✓ ],
// ✓ runs onConfirm, ✕ or timeout resets button. Shared by the practice timer's trash button, the
// smaller one beside the loop pill, and saved sound presets.
export function mountDeleteConfirm(deleteBtn: HTMLButtonElement, onConfirm: () => void): void {
  let deleteState: 'idle' | 'confirming' | 'closing' = 'idle';
  let deleteTimeout: ReturnType<typeof setTimeout> | undefined;
  // The trash icon as first rendered, so idle always restores that exact markup.
  const trashIconHtml = deleteBtn.innerHTML;
  const CLOSE_MS = 180; // matches capsuleCollapse in styles.css

  /** Plays the capsule's collapse, then swaps the trash icon back in. */
  const resetDeleteBtn = (): void => {
    if (deleteState !== 'confirming') return;
    clearTimeout(deleteTimeout);
    deleteState = 'closing';
    deleteBtn.classList.add('is-closing');
    deleteTimeout = setTimeout(() => {
      deleteTimeout = undefined;
      deleteState = 'idle';
      deleteBtn.innerHTML = trashIconHtml;
      deleteBtn.classList.remove('is-confirming', 'is-closing');
    }, CLOSE_MS);
  };

  deleteBtn.addEventListener('click', () => {
    if (deleteState === 'idle') {
      deleteState = 'confirming';
      deleteBtn.classList.add('is-confirming');

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'confirm-cancel-btn';
      cancelBtn.textContent = '✕';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetDeleteBtn();
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'confirm-confirm-btn';
      confirmBtn.textContent = '✓';
      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onConfirm();
        resetDeleteBtn();
      });

      deleteBtn.innerHTML = '';
      deleteBtn.appendChild(cancelBtn);
      deleteBtn.appendChild(confirmBtn);

      deleteTimeout = setTimeout(resetDeleteBtn, 3000);
    }
  });
}
