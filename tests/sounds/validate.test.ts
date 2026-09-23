import { describe, expect, it } from 'vitest';
import {
  MAX_SOUND_BYTES,
  validateDecodedDuration,
  validateSoundFile,
} from '../../src/sounds/validate';

describe('validateSoundFile', () => {
  it('accepts audio by MIME type or by extension', () => {
    expect(validateSoundFile({ name: 'a.bin', size: 10, type: 'audio/wav' }).ok).toBe(true);
    expect(validateSoundFile({ name: 'Kick.FLAC', size: 10, type: '' }).ok).toBe(true);
  });

  it('rejects non-audio files', () => {
    const r = validateSoundFile({ name: 'notes.txt', size: 10, type: 'text/plain' });
    expect(r).toEqual({ ok: false, reason: '"notes.txt" is not an audio file.' });
  });

  it('rejects empty and oversized files', () => {
    expect(validateSoundFile({ name: 'a.wav', size: 0, type: 'audio/wav' }).ok).toBe(false);
    const big = validateSoundFile({ name: 'a.wav', size: MAX_SOUND_BYTES + 1, type: 'audio/wav' });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toMatch(/larger than 2 MB/);
  });
});

describe('validateDecodedDuration', () => {
  it('allows up to 2 seconds', () => {
    expect(validateDecodedDuration(2, 'a').ok).toBe(true);
    const r = validateDecodedDuration(2.54, 'long.wav');
    expect(r).toEqual({
      ok: false,
      reason: '"long.wav" is 2.5 s long. Sounds must be 2 s or shorter.',
    });
  });
});
