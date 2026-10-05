import { describe, expect, it, vi } from 'vitest';
import { isSoundLoading } from '../../src/sounds/loadingStatus';
import { SoundLibrary, type SoundLibraryDeps } from '../../src/sounds/soundLibrary';

function makeLibrary(overrides: Partial<SoundLibraryDeps> = {}) {
  const deps = {
    sampleRate: 8000,
    // 10 silent samples, then sound. At 8 kHz the 1 ms pre-roll is 8 samples → trim 2.
    decode: vi.fn(async () => ({
      sampleRate: 8000,
      channels: [Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0.5])],
    })),
    loadBytes: vi.fn(async (_id: string): Promise<ArrayBuffer | undefined> => new ArrayBuffer(8)),
    loadAsset: vi.fn(async (_path: string) => new ArrayBuffer(8)),
    ...overrides,
  };
  return { library: new SoundLibrary(deps), deps };
}

describe('SoundLibrary', () => {
  it('renders built-ins at the engine sample rate without touching storage', async () => {
    const { library, deps } = makeLibrary();
    const r = await library.resolve('builtin:click', 'builtin:click');
    expect(r.usedId).toBe('builtin:click');
    expect(r.pcm.sampleRate).toBe(8000);
    expect(r.pcm.channels[0]?.length).toBe(480); // 60 ms at 8 kHz
    expect(deps.loadBytes).not.toHaveBeenCalled();
  });

  it('loads file-backed built-ins from public/sounds, decoded and trimmed', async () => {
    const { library, deps } = makeLibrary();
    const r = await library.resolve('builtin:vcsl_Clap_rr1', 'builtin:click');
    expect(r.usedId).toBe('builtin:vcsl_Clap_rr1');
    expect(deps.loadAsset).toHaveBeenCalledWith('sounds/vcsl_Clap_rr1.wav');
    expect(deps.loadBytes).not.toHaveBeenCalled();
    expect(r.pcm.channels[0]?.length).toBe(10); // 12 decoded, 2 leading silent samples trimmed
  });

  it('reports a file-backed sound as loading only while its fetch is in flight', async () => {
    let release!: (bytes: ArrayBuffer) => void;
    const gate = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    const { library } = makeLibrary({ loadAsset: vi.fn(() => gate) });
    const id = 'builtin:vcsl_Clap_rr1';
    const pending = library.load(id);
    expect(isSoundLoading(id)).toBe(true);
    release(new ArrayBuffer(8));
    await pending;
    expect(isSoundLoading(id)).toBe(false);
  });

  it('decodes, trims and caches user sounds', async () => {
    const { library, deps } = makeLibrary();
    const first = await library.resolve('user:a', 'builtin:click');
    await library.resolve('user:a', 'builtin:click');
    expect(first.usedId).toBe('user:a');
    expect(first.error).toBeUndefined();
    expect(first.pcm.channels[0]?.length).toBe(10);
    expect(deps.decode).toHaveBeenCalledTimes(1);
  });

  it('falls back when a user sound is missing', async () => {
    const { library } = makeLibrary({ loadBytes: vi.fn(async () => undefined) });
    const r = await library.resolve('user:gone', 'builtin:click');
    expect(r.usedId).toBe('builtin:click');
    expect(r.error).toBe('Sound not found');
  });

  it('falls back when decoding fails', async () => {
    const { library } = makeLibrary({
      decode: vi.fn(async () => Promise.reject(new Error('bad data'))),
    });
    const r = await library.resolve('user:x', 'builtin:click-high');
    expect(r.usedId).toBe('builtin:click-high');
    expect(r.error).toBe('bad data');
  });

  it('falls back when storage itself throws (IndexedDB blocked)', async () => {
    const { library } = makeLibrary({
      loadBytes: vi.fn(async () => Promise.reject(new Error('IndexedDB unavailable'))),
    });
    const r = await library.resolve('user:x', 'builtin:click');
    expect(r).toMatchObject({ usedId: 'builtin:click', error: 'IndexedDB unavailable' });
  });

  it('forget() drops the cached copy', async () => {
    const { library, deps } = makeLibrary();
    await library.resolve('user:a', 'builtin:click');
    library.forget('user:a');
    await library.resolve('user:a', 'builtin:click');
    expect(deps.decode).toHaveBeenCalledTimes(2);
  });
});
