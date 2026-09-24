export interface WakeLock {
  /** Request the screen stay awake (true) or let it sleep again (false). */
  setActive(active: boolean): void;
}

/**
 * Keeps the screen on while the metronome is playing. Every call is best-effort: the API is
 * missing on some browsers, and the lock is revoked whenever the page is hidden, so it is
 * re-acquired on the way back. It is never load-bearing for audio.
 */
export function createWakeLock(): WakeLock {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  const acquire = (): void => {
    if (!wanted || sentinel || document.hidden) return;
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (!wanted) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          sentinel = null;
        });
      })
      .catch(() => {
        // Denied, unsupported, or the document lost focus. The metronome still works.
      });
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) acquire();
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
