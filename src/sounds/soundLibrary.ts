import type { PcmData } from './pcm';
import { BUILTIN_SOUNDS, renderClick } from './synth';
import { trimLeadingSilence } from './trim';

export interface SoundLibraryDeps {
  /** Sample rate built-ins are rendered at (the AudioContext's). */
  sampleRate: number;
  decode(bytes: ArrayBuffer): Promise<PcmData>;
  loadBytes(id: string): Promise<ArrayBuffer | undefined>;
}

export interface ResolvedSound {
  pcm: PcmData;
  /** The id actually used: the requested one, or the fallback after an error. */
  usedId: string;
  error?: string;
}

export class SoundLibrary {
  private readonly cache = new Map<string, PcmData>();

  constructor(private readonly deps: SoundLibraryDeps) {}

  async load(id: string): Promise<PcmData> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    let pcm: PcmData;
    const builtin = Object.hasOwn(BUILTIN_SOUNDS, id) ? BUILTIN_SOUNDS[id] : undefined;
    if (builtin) {
      pcm = {
        sampleRate: this.deps.sampleRate,
        channels: [renderClick(builtin.spec, this.deps.sampleRate)],
      };
    } else {
      const bytes = await this.deps.loadBytes(id);
      if (!bytes) throw new Error('Sound not found');
      pcm = trimLeadingSilence(await this.deps.decode(bytes));
    }
    this.cache.set(id, pcm);
    return pcm;
  }

  /** Load `id`; on any failure load `fallbackId` (a built-in) and report why. */
  async resolve(id: string, fallbackId: string): Promise<ResolvedSound> {
    try {
      return { pcm: await this.load(id), usedId: id };
    } catch (e) {
      return {
        pcm: await this.load(fallbackId),
        usedId: fallbackId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  forget(id: string): void {
    this.cache.delete(id);
  }
}
