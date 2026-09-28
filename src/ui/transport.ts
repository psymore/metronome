import type { AudioEngine } from '../engine/audioEngine';
import { format } from '../i18n/i18n';
import type { Toast } from './toast';

export interface Transport {
  toggle(): Promise<void>;
}

// AudioContext.resume() (called from engine.start()) can hang instead of ever resolving or
// rejecting — a real device quirk, not a hypothetical: mobile OSes sometimes suspend audio
// under memory pressure ("overloaded") in a way that leaves the resume promise pending
// forever. Without this race, toggle()'s `busy` flag would never reset, and every future tap
// would silently no-op — the button "not working" with no error, no way to recover short of
// reloading the page.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function mountTransport(deps: {
  engine: AudioEngine;
  toast: Toast;
  onToggle: () => void;
  onBusyChange?: (busy: boolean) => void;
}): Transport {
  let busy = false;

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    // Starting can take a moment (or, on a stuck AudioContext, the full 5s timeout below) —
    // signal it right away so the tap doesn't look ignored while resume() is pending.
    if (!deps.engine.running) deps.onBusyChange?.(true);
    try {
      if (deps.engine.running) deps.engine.stop();
      else await withTimeout(deps.engine.start(), 5000, 'Audio failed to start (timed out)');
    } catch (e) {
      // A failed start may have left the AudioContext's resume() permanently stuck (see
      // recoverContext's doc comment) — without this, every later tap would time out the same
      // way forever. Rebuilding it here gives the next tap a real chance.
      deps.engine.recoverContext();
      deps.toast(
        format('toast.audioStartError', { error: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      busy = false;
      deps.onBusyChange?.(false);
      deps.onToggle();
    }
  }

  return { toggle };
}
