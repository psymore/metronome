import { describe, expect, it, type Mock, vi } from 'vitest';
import { type ImportDeps, importSoundFile } from '../../src/sounds/importSound';
import type { PcmData } from '../../src/sounds/pcm';

function fakeFile(name: string, size = 1000, type = 'audio/wav') {
  const data = new ArrayBuffer(size);
  return { name, size, type, arrayBuffer: async () => data };
}

const pcmOf = (seconds: number, sampleRate = 1000): PcmData => ({
  sampleRate,
  channels: [new Float32Array(Math.round(seconds * sampleRate)).fill(0.5)],
});

function makeDeps(overrides: Partial<ImportDeps> = {}) {
  const deps = {
    // Mimic decodeAudioData: it detaches (transfers) the buffer it is given.
    decode: vi.fn(async (bytes: ArrayBuffer) => {
      structuredClone(bytes, { transfer: [bytes] });
      return pcmOf(0.2);
    }),
    save: vi.fn(async (name: string, _bytes: ArrayBuffer) => ({ id: 'user:1', name })),
    ...overrides,
  };
  // The spread of `overrides` (typed as plain ImportDeps functions) widens decode/save to a
  // union that drops the vi.fn() mock properties; assert the actual runtime shape back.
  return deps as typeof deps & { decode: Mock; save: Mock };
}

describe('importSoundFile', () => {
  it('stores a valid sound under its file name without the extension', async () => {
    const deps = makeDeps();
    expect(await importSoundFile(fakeFile('Kick 01.wav'), deps)).toEqual({
      ok: true,
      id: 'user:1',
      name: 'Kick 01',
    });
  });

  it('saves intact bytes even though decoding detaches its input', async () => {
    const deps = makeDeps();
    await importSoundFile(fakeFile('a.wav', 1234), deps);
    expect(deps.save.mock.calls[0]?.[1].byteLength).toBe(1234);
  });

  it('rejects non-audio files before reading them', async () => {
    const deps = makeDeps();
    const r = await importSoundFile(fakeFile('notes.txt', 10, 'text/plain'), deps);
    expect(r.ok).toBe(false);
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('rejects files over 2 MB', async () => {
    const r = await importSoundFile(fakeFile('big.wav', 3 * 1024 * 1024), makeDeps());
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/larger than 2 MB/) });
  });

  it('explains files that cannot be decoded and stores nothing', async () => {
    const deps = makeDeps({
      decode: vi.fn(async () => Promise.reject(new Error('EncodingError'))),
    });
    const r = await importSoundFile(fakeFile('broken.mp3'), deps);
    expect(r).toEqual({
      ok: false,
      reason: '"broken.mp3" could not be decoded. Try WAV, MP3, OGG or FLAC.',
    });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('rejects sounds longer than 2 seconds', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => pcmOf(2.5)) });
    const r = await importSoundFile(fakeFile('pad.wav'), deps);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/2\.5 s long/) });
  });

  it('rejects files that decode to no audio', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => pcmOf(0)) });
    const r = await importSoundFile(fakeFile('empty.wav'), deps);
    expect(r).toEqual({ ok: false, reason: '"empty.wav" contains no audio.' });
  });

  it('reports storage failures', async () => {
    const deps = makeDeps({ save: vi.fn(async () => Promise.reject(new Error('QuotaExceeded'))) });
    const r = await importSoundFile(fakeFile('a.wav'), deps);
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Could not save the sound/),
    });
  });

  it('shortens long names to 40 characters', async () => {
    const r = await importSoundFile(fakeFile(`${'x'.repeat(60)}.mp3`), makeDeps());
    expect(r.ok && r.name.length).toBe(40);
  });
});
