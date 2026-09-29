export interface ErrorFloorDeps {
  onError(listener: (reason: unknown) => void): void;
  onUnhandledRejection(listener: (reason: unknown) => void): void;
  now(): number;
  logError(reason: unknown): void;
  showToast(message: string): void;
  /** Resolved at throw time, not at mount time, so a language change afterward is reflected. */
  getMessage(): string;
  throttleMs?: number;
}

const DEFAULT_THROTTLE_MS = 10_000;

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
    const now = deps.now();
    if (now - lastShown >= throttleMs) {
      lastShown = now;
      deps.showToast(deps.getMessage());
    }
  };

  deps.onError(report);
  deps.onUnhandledRejection(report);

  return { report };
}
