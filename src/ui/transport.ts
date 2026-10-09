import type { AudioEngine } from '../engine/audioEngine';
import { t } from '../i18n/i18n';

export interface Transport {
  toggle(): Promise<void>;
}

declare global {
  interface Window {
    /** index.html's reload screen (the same one a failed boot shows). */
    showReloadScreen?: (message: string, buttonLabel: string) => void;
  }
}

export function mountTransport(deps: { engine: AudioEngine; onToggle: () => void }): Transport {
  let busy = false;

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (deps.engine.running) deps.engine.stop();
      else await deps.engine.start();
    } catch {
      // start() already retried on a fresh AudioContext (see AudioEngine.ensureRunning), so the
      // audio stack is stuck for this page: a reload is the one thing that reliably fixes it.
      window.showReloadScreen?.(t('reload.audioFailed'), t('reload.button'));
    } finally {
      busy = false;
      deps.onToggle();
    }
  }

  return { toggle };
}
