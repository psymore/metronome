import type { AudioEngine } from '../engine/audioEngine';
import { format } from '../i18n/i18n';
import type { SoundLibrary } from '../sounds/soundLibrary';
import { DEFAULT_SETTINGS } from '../state/settings';
import type { Toast } from './toast';

export type PreviewSound = (id: string) => Promise<void>;

/** Resolves a sound id (builtin or user-uploaded) and plays it once, sharing the load/decode
 *  path used by both the Sounds dialog and the polyrhythm layer pickers. */
export function createSoundPreview(
  engine: AudioEngine,
  library: SoundLibrary,
  toast: Toast,
): PreviewSound {
  return async (id: string) => {
    const result = await library.resolve(id, DEFAULT_SETTINGS.normalSoundId);
    if (result.error) toast(format('toast.playError', { error: result.error }));
    else await engine.preview(result.pcm);
  };
}
