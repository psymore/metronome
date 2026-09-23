export const MAX_SOUND_BYTES = 2 * 1024 * 1024;
export const MAX_SOUND_SECONDS = 2;
const EXTENSIONS = ['.wav', '.mp3', '.ogg', '.oga', '.flac', '.m4a', '.aac', '.webm', '.opus'];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateSoundFile(file: {
  name: string;
  size: number;
  type: string;
}): ValidationResult {
  const lower = file.name.toLowerCase();
  const isAudio = file.type.startsWith('audio/') || EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!isAudio) return { ok: false, reason: `"${file.name}" is not an audio file.` };
  if (file.size === 0) return { ok: false, reason: `"${file.name}" is empty.` };
  if (file.size > MAX_SOUND_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" is larger than 2 MB. Use a short click or hit sample.`,
    };
  }
  return { ok: true };
}

export function validateDecodedDuration(seconds: number, name: string): ValidationResult {
  if (seconds > MAX_SOUND_SECONDS) {
    return {
      ok: false,
      reason: `"${name}" is ${seconds.toFixed(1)} s long. Sounds must be ${MAX_SOUND_SECONDS} s or shorter.`,
    };
  }
  return { ok: true };
}
