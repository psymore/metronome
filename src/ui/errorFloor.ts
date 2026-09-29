export interface ErrorFloorDeps {
  onError(listener: (reason: unknown) => void): void;
  onUnhandledRejection(listener: (reason: unknown) => void): void;
  now(): number;
  logError(reason: unknown): void;
  showToast(message: string): void;
  /** Resolved at throw time, not at mount time, so a language change afterward is reflected. */
  getMessage(): string;
  /** False until boot finishes. A throw before then is a failed boot, which index.html's own
   *  boot-failure screen already reports — a toast on top of it would just be a second message. */
  isBooted?(): boolean;
  throttleMs?: number;
}

const DEFAULT_THROTTLE_MS = 10_000;

/** Browser-generated window errors that don't mean anything is broken. Chrome reports "the
 *  ResizeObserver loop completed with undelivered notifications" as a window `error` (with no
 *  `error` object, only a message) when an observer callback's layout change needs another pass. */
export function isBenignWindowError(reason: unknown): boolean {
  return typeof reason === 'string' && reason.includes('ResizeObserver loop');
}

export interface ErrorFloor {
  /** Reports an error caught elsewhere (e.g. a render loop's own try/catch) through the same
   *  log+throttled-toast pipeline as an uncaught window error, instead of a separate one-off. */
  report(reason: unknown): void;
}

/**
 * A floor under runtime errors the rest of the app didn't already handle: every occurrence is
 * logged, but the user only sees a toast at most once per `throttleMs` — a metronome that throws
 * repeatedly (e.g. a broken render loop) shouldn't spam the UI with toasts on top of it.
 */
export function mountErrorFloor(deps: ErrorFloorDeps): ErrorFloor {
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  let lastShown = Number.NEGATIVE_INFINITY;

  const report = (reason: unknown): void => {
    deps.logError(reason);
    if (deps.isBooted && !deps.isBooted()) return;
    const now = deps.now();
    if (now - lastShown >= throttleMs) {
      lastShown = now;
      deps.showToast(deps.getMessage());
    }
  };

  deps.onError((reason) => {
    if (!isBenignWindowError(reason)) report(reason);
  });
  deps.onUnhandledRejection(report);

  return { report };
}
