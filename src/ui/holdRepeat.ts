/**
 * Wires a stepper button so a tap fires `step` once and holding it down repeats `step` on an
 * accelerating interval — starts at a comfortable 300ms, tightens to 120ms after a few ticks
 * and 60ms after that — until the pointer is released, instead of one step per manual click.
 */
export function mountHoldRepeat(button: HTMLElement, step: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticks = 0;

  const intervalFor = (n: number): number => (n > 10 ? 60 : n > 4 ? 120 : 300);

  function tick(): void {
    step();
    ticks++;
    timer = setTimeout(tick, intervalFor(ticks));
  }

  function start(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;
    ticks = 0;
    step();
    timer = setTimeout(tick, 400);
  }

  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  // detail === 0 means the click was synthesized by the keyboard or assistive tech (no
  // pointerdown preceded it, so `start` above never fired for it) rather than a real pointer
  // click, which `start` already handled.
  function click(e: MouseEvent): void {
    if (e.detail === 0) step();
  }

  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointerleave', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('click', click);
}
