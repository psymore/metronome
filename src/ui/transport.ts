import type { AudioEngine } from '../engine/audioEngine';
import { byId } from './dom';
import type { Toast } from './toast';

export interface Transport {
  toggle(): Promise<void>;
}

export function mountTransport(deps: {
  engine: AudioEngine;
  toast: Toast;
  onToggle: () => void;
}): Transport {
  const button = byId<HTMLButtonElement>('playBtn');
  let busy = false;

  const render = () => {
    const on = deps.engine.running;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Stop' : 'Start');
  };

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (deps.engine.running) deps.engine.stop();
      else await deps.engine.start();
    } catch (e) {
      deps.toast(`Audio could not start: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
      render();
      deps.onToggle();
    }
  }

  button.addEventListener('click', () => {
    void toggle();
  });
  render();
  return { toggle };
}
