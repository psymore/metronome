import type { PcmData } from './pcm';
import { validateDecodedDuration, validateSoundFile } from './validate';

export interface ImportDeps {
  decode(bytes: ArrayBuffer): Promise<PcmData>;
  save(name: string, bytes: ArrayBuffer): Promise<{ id: string; name: string }>;
}

export type ImportResult = { ok: true; id: string; name: string } | { ok: false; reason: string };

export interface ImportableFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function displayName(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .trim()
      .slice(0, 40) || 'Untitled sound'
  );
}

export async function importSoundFile(
  file: ImportableFile,
  deps: ImportDeps,
): Promise<ImportResult> {
  const check = validateSoundFile(file);
  if (!check.ok) return check;

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, reason: `Could not read "${file.name}".` };
  }

  let pcm: PcmData;
  try {
    // decodeAudioData detaches the buffer it gets, so decode a copy and keep `bytes` for storage.
    pcm = await deps.decode(bytes.slice(0));
  } catch {
    return { ok: false, reason: `"${file.name}" could not be decoded. Try WAV, MP3, OGG or FLAC.` };
  }

  const seconds = (pcm.channels[0]?.length ?? 0) / pcm.sampleRate;
  if (seconds === 0) return { ok: false, reason: `"${file.name}" contains no audio.` };
  const duration = validateDecodedDuration(seconds, file.name);
  if (!duration.ok) return duration;

  try {
    const saved = await deps.save(displayName(file.name), bytes);
    return { ok: true, id: saved.id, name: saved.name };
  } catch {
    return {
      ok: false,
      reason: 'Could not save the sound. Browser storage may be full or disabled (private window).',
    };
  }
}
