import { setSoundLoading } from './loadingStatus';
import type { PcmData } from './pcm';
import { BUILTIN_SOUNDS, renderClick } from './synth';
import { trimLeadingSilence } from './trim';

export interface SoundLibraryDeps {
  /** Sample rate built-ins are rendered at (the AudioContext's). */
  sampleRate: number;
  decode(bytes: ArrayBuffer): Promise<PcmData>;
  loadBytes(id: string): Promise<ArrayBuffer | undefined>;
  /** Fetches a bundled file by its path under `public/` (e.g. `sounds/x.wav`). */
  loadAsset(path: string): Promise<ArrayBuffer>;
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
    const builtin = Object.hasOwn(BUILTIN_SOUNDS, id) ? BUILTIN_SOUNDS[id] : undefined;
    // Synthesized built-ins render instantly; only fetches and decodes are worth a spinner.
    const slow = !builtin?.spec;
    if (slow) setSoundLoading(id, true);
    try {
      const pcm = await this.fetchPcm(id, builtin);
      this.cache.set(id, pcm);
      return pcm;
    } finally {
      if (slow) setSoundLoading(id, false);
    }
  }

  private async fetchPcm(
    id: string,
    builtin: (typeof BUILTIN_SOUNDS)[string] | undefined,
  ): Promise<PcmData> {
    if (builtin?.file) {
      // First use fetches the WAV; the service worker keeps it for offline use afterwards.
      return trimLeadingSilence(
        await this.deps.decode(await this.deps.loadAsset(`sounds/${builtin.file}`)),
      );
    }
    if (builtin?.spec) {
      return {
        sampleRate: this.deps.sampleRate,
        channels: [renderClick(builtin.spec, this.deps.sampleRate)],
      };
    }
    const bytes = await this.deps.loadBytes(id);
    if (!bytes) throw new Error('Sound not found');
    return trimLeadingSilence(await this.deps.decode(bytes));
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
