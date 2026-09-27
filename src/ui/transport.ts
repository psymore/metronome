import type { AudioEngine } from '../engine/audioEngine';
import { format } from '../i18n/i18n';
import type { Toast } from './toast';

export interface Transport {
  toggle(): Promise<void>;
}

export function mountTransport(deps: {
  engine: AudioEngine;
  toast: Toast;
  onToggle: () => void;
}): Transport {
  let busy = false;

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (deps.engine.running) deps.engine.stop();
      else await deps.engine.start();
    } catch (e) {
      deps.toast(
        format('toast.audioStartError', { error: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      busy = false;
      deps.onToggle();
    }
  }

  return { toggle };
}
