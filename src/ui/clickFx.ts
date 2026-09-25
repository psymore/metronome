/**
 * Border feedback on every button press. The border itself is plain CSS (`button:active::after`)
 * so it stays solid for exactly as long as the button is held, however long that is — no JS timer
 * to outrun a long press. On release, this fades that same border out over 260ms instead of it
 * just vanishing with :active.
 */
export function mountClickFx(): void {
  document.addEventListener('pointerup', onRelease, { passive: true });
  document.addEventListener('pointercancel', onRelease, { passive: true });
}

function onRelease(e: PointerEvent): void {
  const button = (e.target as HTMLElement).closest('button');
  if (!button || button.disabled) return;
  button.classList.remove('btn-flash');
  void button.offsetWidth; // restart the animation even if it's already mid-flash
  button.classList.add('btn-flash');
  setTimeout(() => button.classList.remove('btn-flash'), 260);
}
