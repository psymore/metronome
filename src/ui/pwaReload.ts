export interface PwaReloadDeps {
  isRunning(): boolean;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): void;
  reload(): void;
}

/**
 * Builds vite-plugin-pwa's `onNeedReload` callback: without it, a new service worker reloads the
 * page the instant it activates, which is typically fine at startup (today's default behavior)
 * but cuts off playback if a deploy lands mid-session. While the metronome is running, the reload
 * waits for the first `visibilitychange` where the page is both hidden and no longer playing —
 * covering both "already stopped, tab backgrounded" and "backgrounded, then stopped" the same
 * way, since either ends with that one combination on some future visibilitychange. Never reloads
 * while visible and in use.
 */
export function createPwaReloadHandler(deps: PwaReloadDeps): () => void {
  return function onNeedReload(): void {
    if (!deps.isRunning()) {
      deps.reload();
      return;
    }
    let reloaded = false;
    deps.onVisibilityChange(() => {
      if (reloaded || !deps.isHidden() || deps.isRunning()) return;
      reloaded = true;
      deps.reload();
    });
  };
}
