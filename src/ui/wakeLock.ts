export interface WakeLock {
  /** Request the screen stay awake (true) or let it sleep again (false). */
  setActive(active: boolean): void;
}

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
}

export interface WakeLockDeps {
  request(): Promise<WakeLockSentinelLike>;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): void;
}

const browserDeps: WakeLockDeps = {
  request: () => {
    if (!navigator.wakeLock) return Promise.reject(new Error('Screen Wake Lock unsupported'));
    return navigator.wakeLock.request('screen');
  },
  isHidden: () => document.hidden,
  onVisibilityChange: (listener) => document.addEventListener('visibilitychange', listener),
};

/**
 * Keeps the screen on while the metronome is playing. Every call is best-effort: the API is
 * missing on some browsers, and the lock is revoked whenever the page is hidden, so it is
 * re-acquired on the way back. It is never load-bearing for audio.
 */
export function createWakeLock(deps: WakeLockDeps = browserDeps): WakeLock {
  let sentinel: WakeLockSentinelLike | null = null;
  let pending = false;
  let wanted = false;

  const acquire = (): void => {
    if (!wanted || sentinel || pending || deps.isHidden()) return;
    pending = true;
    deps
      .request()
      .then((lock) => {
        pending = false;
        // Already unwanted, or a previous request already landed a lock: don't overwrite or
        // orphan an existing one — every lock this function creates must eventually be released.
        if (!wanted || sentinel) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener?.('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      })
      .catch(() => {
        pending = false;
        // Denied, unsupported, or the document lost focus. The metronome still works.
      });
  };

  deps.onVisibilityChange(() => {
    if (!deps.isHidden()) acquire();
  });

  return {
    setActive(active: boolean): void {
      wanted = active;
      if (active) {
        acquire();
        return;
      }
      const lock = sentinel;
      sentinel = null;
      lock?.release().catch(() => {
        // Already released.
      });
    },
  };
}
