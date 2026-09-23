export type Toast = (message: string) => void;

export function createToast(el: HTMLElement, durationMs = 4500): Toast {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (message) => {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  };
}
