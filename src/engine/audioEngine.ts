import type { PcmData } from '../sounds/pcm';
import { BeatTimeline } from './beatTimeline';
import { computeHeardTime } from './clock';
import { type PolyBeatEvent, type PolyPattern, PolyScheduler } from './polyScheduler';
import { type BeatEvent, type Pattern, Scheduler, type SchedulerStats } from './scheduler';
import { makeSoftClipCurve, SOFT_CLIP_CURVE_SIZE, SOFT_CLIP_DOMAIN } from './softClip';

export type SoundSlot = 'accent' | 'normal';
export type PolySoundSlot = 'polyA' | 'polyB';

export interface AudioEngineOptions {
  getPattern: () => Pattern;
  getPolyPattern: () => PolyPattern;
}

// 50ms of silence, looped. iOS Safari puts a page in the "Ambient" audio session category
// (silenced by the Ring/Silent switch) until a real <audio>/<video> element is actively
// playing on the page; Web Audio alone never triggers that switch. Keeping this looping
// silently in the background makes Web Audio output audible with the switch engaged.
const SILENT_LOOP_SRC =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Transparent soft limiter on the master output: wired to `ctx.destination`, returns the node to
 * feed. Two coincident poly accents can sum past 2.7, and this keeps the output under 1.0 while
 * leaving everything below the knee untouched. A WaveShaper rather than a DynamicsCompressorNode,
 * because the compressor adds ~6 ms of latency that would break heard-time sync.
 */
function createSoftLimiter(ctx: AudioContext): AudioNode {
  // The shaper only reads [-1, 1]. Scaling down by the domain and building the curve over the
  // full domain means the limited signal comes out in original units, so no post-gain is needed.
  const input = ctx.createGain();
  input.gain.value = 1 / SOFT_CLIP_DOMAIN;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve(SOFT_CLIP_CURVE_SIZE, SOFT_CLIP_DOMAIN);
  shaper.oversample = 'none';
  input.connect(shaper);
  shaper.connect(ctx.destination);
  return input;
}

export class AudioEngine {
  private _ctx: AudioContext;
  readonly timeline = new BeatTimeline<BeatEvent>();
  readonly polyTimelineA = new BeatTimeline<PolyBeatEvent>();
  readonly polyTimelineB = new BeatTimeline<PolyBeatEvent>();
  private master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly polyScheduler: PolyScheduler;
  private readonly getPolyPattern: () => PolyPattern;
  private readonly worker: Worker;
  private readonly buffers: Record<SoundSlot, AudioBuffer | null> = { accent: null, normal: null };
  private readonly polyBuffers: Record<PolySoundSlot, AudioBuffer | null> = {
    polyA: null,
    polyB: null,
  };
  private readonly active = new Set<AudioBufferSourceNode>();
  private readonly silentUnlock: HTMLAudioElement;
  /** The last volume `setVolume` was given, so `recoverContext()`'s fresh master gain starts at
   *  the user's actual setting instead of the node default of 1.0 (full volume). */
  private volume = 1;
  /** Per-level gains for the main scheduler's beats, kept in sync with Settings by the caller
   *  (see `setVolume`'s pattern). Defaults match the pre-slider hardcoded mix. */
  private accentGain = 1;
  private mediumGain = 0.6;
  private normalGain = 1;

  constructor(opts: AudioEngineOptions) {
    this.getPolyPattern = opts.getPolyPattern;
    this.scheduler = new Scheduler({
      getPattern: opts.getPattern,
      onBeat: (b) => this.playBeat(b),
      onSubdivision: (time) => this.playSubdivision(time),
    });
    this.polyScheduler = new PolyScheduler({
      getPattern: opts.getPolyPattern,
      onEvent: (e) => this.playPolyBeat(e),
    });
    this.worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => {
      const now = this._ctx.currentTime;
      this.scheduler.tick(now);
      this.polyScheduler.tick(now);
    };
    this.silentUnlock = new Audio(SILENT_LOOP_SRC);
    this.silentUnlock.loop = true;
    this.silentUnlock.volume = 0;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.tryResume();
    });
    window.addEventListener('pageshow', this.tryResume);
    this._ctx = this.createContext();
    this.master = this.createMaster();
  }

  get ctx(): AudioContext {
    return this._ctx;
  }

  private createContext(): AudioContext {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.addEventListener('statechange', this.tryResume);
    return ctx;
  }

  private createMaster(): GainNode {
    const master = this._ctx.createGain();
    master.gain.value = this.volume;
    master.connect(createSoftLimiter(this._ctx));
    return master;
  }

  private readonly tryResume = () => {
    // Device change or OS interruption while playing: try to get the clock running again.
    if (!this.scheduler.isRunning && !this.polyScheduler.isRunning) return;
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    if (this.silentUnlock.paused) this.silentUnlock.play().catch(() => {});
  };

  /**
   * `AudioContext.resume()` can hang forever instead of ever settling — once that happens, per
   * spec every later `resume()` call on the same context returns that same stuck promise, so the
   * context can never recover on its own. Call this after a failed `start()` (see
   * `ui/transport.ts`'s timeout) to throw the wedged context away and build a fresh one, so the
   * next tap gets a real chance instead of being doomed to time out forever.
   */
  recoverContext(): void {
    if (this.scheduler.isRunning || this.polyScheduler.isRunning) return;
    const stale = this._ctx;
    this._ctx = this.createContext();
    this.master = this.createMaster();
    stale.close().catch(() => {});
  }

  get running(): boolean {
    return this.scheduler.isRunning || this.polyScheduler.isRunning;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get stats(): SchedulerStats {
    return this.scheduler.stats;
  }

  /** Must be called from a user gesture (autoplay policy). */
  async start(): Promise<void> {
    if (this.scheduler.isRunning || this.polyScheduler.isRunning) return;
    // Started together, from the same gesture: iOS only exempts Web Audio from the Ring/Silent
    // switch while a real media element is actively playing on the page.
    await Promise.all([this.ctx.resume(), this.silentUnlock.play().catch(() => {})]);
    this.timeline.clear();
    this.polyTimelineA.clear();
    this.polyTimelineB.clear();
    const now = this.ctx.currentTime;
    if (this.getPolyPattern().polyrhythm.enabled) {
      this.polyScheduler.start(now);
    } else {
      this.scheduler.start(now);
    }
    this.worker.postMessage('start');
  }

  /**
   * Swaps between the standard and polyrhythm schedulers while playing, following the current
   * `polyrhythm.enabled`. Synchronous and gesture-free: the AudioContext, silent-unlock loop and
   * worker tick are already running, so only the schedulers, pending clicks and timelines change.
   * A no-op when stopped (start() picks the mode) or already in the requested mode.
   */
  switchMode(): void {
    if (!this.running) return;
    const poly = this.getPolyPattern().polyrhythm.enabled;
    if (poly === this.polyScheduler.isRunning) return;
    this.scheduler.stop();
    this.polyScheduler.stop();
    // Drop clicks the old mode already queued inside its look-ahead window.
    this.stopSources();
    this.timeline.clear();
    this.polyTimelineA.clear();
    this.polyTimelineB.clear();
    const now = this.ctx.currentTime;
    if (poly) this.polyScheduler.start(now);
    else this.scheduler.start(now);
  }

  stop(): void {
    this.scheduler.stop();
    this.polyScheduler.stop();
    this.worker.postMessage('stop');
    this.stopSources();
    this.timeline.clear();
    this.polyTimelineA.clear();
    this.polyTimelineB.clear();
    this.silentUnlock.pause();
    // A running context holds the audio hardware clock open and drains battery in silence.
    // start() and preview() both resume it, so suspending here is self-healing.
    this.ctx.suspend().catch(() => {
      // Nothing to do: the context is already closed or the browser refused.
    });
  }

  private stopSources(): void {
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.active.clear();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
  }

  setAccentGain(gain: number): void {
    this.accentGain = gain;
  }

  setMediumGain(gain: number): void {
    this.mediumGain = gain;
  }

  setNormalGain(gain: number): void {
    this.normalGain = gain;
  }

  setSound(slot: SoundSlot, pcm: PcmData): void {
    this.buffers[slot] = this.toBuffer(pcm);
  }

  setPolySound(slot: PolySoundSlot, pcm: PcmData): void {
    this.polyBuffers[slot] = this.toBuffer(pcm);
  }

  /** Note: decodeAudioData detaches `bytes`; pass a copy if you still need them. */
  async decode(bytes: ArrayBuffer): Promise<PcmData> {
    const buffer = await this.ctx.decodeAudioData(bytes);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    return { sampleRate: buffer.sampleRate, channels };
  }

  async preview(pcm: PcmData, levelGain = 1): Promise<void> {
    await this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = this.toBuffer(pcm);
    const gain = this.ctx.createGain();
    gain.gain.value = levelGain;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(this.ctx.currentTime + 0.01);
  }

  heardTime(syncOffsetMs: number): number {
    const timestamp =
      typeof this.ctx.getOutputTimestamp === 'function' ? this.ctx.getOutputTimestamp() : null;
    return computeHeardTime({
      timestamp,
      perfNow: performance.now(),
      currentTime: this.ctx.currentTime,
      outputLatency: this.ctx.outputLatency || this.ctx.baseLatency || 0,
      syncOffsetMs,
    });
  }

  private playBeat(beat: BeatEvent): void {
    this.timeline.push(beat);
    if (beat.level === 'mute') return;
    // `medium` borrows the accent buffer (no separate sound slot) at a quieter gain, sitting
    // between the unaccented click and a full accent.
    const buffer = this.buffers[beat.level === 'medium' ? 'accent' : beat.level];
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const levelGain =
      beat.level === 'accent'
        ? this.accentGain
        : beat.level === 'medium'
          ? this.mediumGain
          : this.normalGain;
    const gain = this.ctx.createGain();
    gain.gain.value = levelGain;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.active.add(source);
    source.start(beat.time);
  }

  private playPolyBeat(beat: PolyBeatEvent): void {
    (beat.layer === 'A' ? this.polyTimelineA : this.polyTimelineB).push(beat);
    const layerLevels =
      beat.layer === 'A'
        ? this.getPolyPattern().polyrhythm.levelsA
        : this.getPolyPattern().polyrhythm.levelsB;
    const level = layerLevels?.[beat.index] ?? 'normal';
    if (level === 'mute') return;
    const buffer = this.polyBuffers[beat.layer === 'A' ? 'polyA' : 'polyB'];
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    // Tuned by ear: normal 1, medium 1.1 (between normal and accent), accent 1.35.
    gain.gain.value = level === 'accent' ? 1.35 : level === 'medium' ? 1.1 : 1;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.active.add(source);
    source.start(beat.time);
  }

  /** Quieter click between beats, always the "normal" sound regardless of the surrounding beat's level. */
  private playSubdivision(time: number): void {
    const buffer = this.buffers.normal;
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.active.add(source);
    source.start(time);
  }

  private toBuffer(pcm: PcmData): AudioBuffer {
    const length = Math.max(1, ...pcm.channels.map((c) => c.length));
    const buffer = this.ctx.createBuffer(Math.max(1, pcm.channels.length), length, pcm.sampleRate);
    pcm.channels.forEach((channel, i) => {
      buffer.copyToChannel(channel, i);
    });
    return buffer;
  }
}
