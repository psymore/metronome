import { describe, expect, it, vi } from 'vitest';
import { mountErrorFloor } from '../../src/ui/errorFloor';

function makeDeps(overrides: Partial<Parameters<typeof mountErrorFloor>[0]> = {}) {
  let now = 0;
  const errorListeners: ((reason: unknown) => void)[] = [];
  const rejectionListeners: ((reason: unknown) => void)[] = [];
  const logError = vi.fn();
  const showToast = vi.fn();
  const deps = {
    onError: (listener: (reason: unknown) => void) => errorListeners.push(listener),
    onUnhandledRejection: (listener: (reason: unknown) => void) =>
      rejectionListeners.push(listener),
    now: () => now,
    logError,
    showToast,
    getMessage: () => 'Something went wrong.',
    throttleMs: 10_000,
    ...overrides,
  };
  return {
    deps,
    logError,
    showToast,
    fireError: (reason: unknown) => {
      for (const listener of errorListeners) listener(reason);
    },
    fireRejection: (reason: unknown) => {
      for (const listener of rejectionListeners) listener(reason);
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('mountErrorFloor', () => {
  it('logs and toasts on a window error', () => {
    const { deps, logError, showToast, fireError } = makeDeps();
    mountErrorFloor(deps);

    fireError(new Error('boom'));

    expect(logError).toHaveBeenCalledWith(expect.any(Error));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Something went wrong.');
  });

  it('logs and toasts on an unhandled rejection', () => {
    const { deps, logError, showToast, fireRejection } = makeDeps();
    mountErrorFloor(deps);

    fireRejection('rejected');

    expect(logError).toHaveBeenCalledWith('rejected');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('logs every occurrence but only toasts once per throttle window', () => {
    const { deps, logError, showToast, fireError, advance } = makeDeps();
    mountErrorFloor(deps);

    fireError('a');
    fireError('b');
    advance(5_000);
    fireError('c');

    expect(logError).toHaveBeenCalledTimes(3);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('toasts again once the throttle window has passed', () => {
    const { deps, showToast, fireError, advance } = makeDeps();
    mountErrorFloor(deps);

    fireError('a');
    advance(10_000);
    fireError('b');

    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('ignores the benign ResizeObserver loop window error entirely', () => {
    const { deps, logError, showToast, fireError } = makeDeps();
    mountErrorFloor(deps);

    fireError('ResizeObserver loop completed with undelivered notifications.');

    expect(logError).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('logs but does not toast before boot finishes, and does not use up the throttle', () => {
    let booted = false;
    const { deps, logError, showToast, fireError } = makeDeps({ isBooted: () => booted });
    mountErrorFloor(deps);

    fireError(new Error('boot failed'));
    expect(logError).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();

    booted = true;
    fireError(new Error('later'));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('exposes report() so a caller with its own try/catch can go through the same pipeline', () => {
    const { deps, logError, showToast } = makeDeps();
    const floor = mountErrorFloor(deps);

    floor.report(new Error('caught elsewhere'));

    expect(logError).toHaveBeenCalledWith(expect.any(Error));
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
