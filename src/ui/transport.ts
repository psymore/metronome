import type { AudioEngine } from '../engine/audioEngine';
import { format, t } from '../i18n/i18n';
import { byId } from './dom';
import type { Toast } from './toast';

export interface Transport {
  toggle(): Promise<void>;
  refreshLabel(): void;
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
    button.setAttribute('aria-label', on ? t('play.stop') : t('play.start'));
  };

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
      render();
      deps.onToggle();
    }
  }

  button.addEventListener('click', () => {
    void toggle();
  });
  render();
  return { toggle, refreshLabel: render };
}
