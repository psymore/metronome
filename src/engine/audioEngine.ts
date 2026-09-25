import type { PcmData } from '../sounds/pcm';
import { BeatTimeline } from './beatTimeline';
import { computeHeardTime } from './clock';
import { type BeatEvent, type Pattern, Scheduler, type SchedulerStats } from './scheduler';

export type SoundSlot = 'accent' | 'normal';

export interface AudioEngineOptions {
  getPattern: () => Pattern;
}

// 50ms of silence, looped. iOS Safari puts a page in the "Ambient" audio session category
// (silenced by the Ring/Silent switch) until a real <audio>/<video> element is actively
// playing on the page; Web Audio alone never triggers that switch. Keeping this looping
// silently in the background makes Web Audio output audible with the switch engaged.
const SILENT_LOOP_SRC =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly timeline = new BeatTimeline();
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly worker: Worker;
  private readonly buffers: Record<SoundSlot, AudioBuffer | null> = { accent: null, normal: null };
  private readonly active = new Set<AudioBufferSourceNode>();
  private readonly silentUnlock: HTMLAudioElement;

  constructor(opts: AudioEngineOptions) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.scheduler = new Scheduler({
      getPattern: opts.getPattern,
      onBeat: (b) => this.playBeat(b),
      onSubdivision: (time) => this.playSubdivision(time),
    });
    this.worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => this.scheduler.tick(this.ctx.currentTime);
    this.silentUnlock = new Audio(SILENT_LOOP_SRC);
    this.silentUnlock.loop = true;
    this.silentUnlock.volume = 0;
    const tryResume = () => {
      // Device change or OS interruption while playing: try to get the clock running again.
      if (!this.scheduler.isRunning) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.silentUnlock.paused) this.silentUnlock.play().catch(() => {});
    };
    this.ctx.addEventListener('statechange', tryResume);
    // `statechange` fires only on the running->suspended transition. If that resume attempt is
    // rejected (iOS can refuse it right after an interruption), the context stays suspended with
    // no further event to retry on — so also retry whenever the page comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryResume();
    });
    window.addEventListener('pageshow', tryResume);
  }

  get running(): boolean {
    return this.scheduler.isRunning;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get stats(): SchedulerStats {
    return this.scheduler.stats;
  }

  /** Must be called from a user gesture (autoplay policy). */
  async start(): Promise<void> {
    if (this.scheduler.isRunning) return;
    // Started together, from the same gesture: iOS only exempts Web Audio from the Ring/Silent
    // switch while a real media element is actively playing on the page.
    await Promise.all([this.ctx.resume(), this.silentUnlock.play().catch(() => {})]);
    this.timeline.clear();
    this.scheduler.start(this.ctx.currentTime);
    this.worker.postMessage('start');
  }

  stop(): void {
    this.scheduler.stop();
    this.worker.postMessage('stop');
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.active.clear();
    this.timeline.clear();
    this.silentUnlock.pause();
    // A running context holds the audio hardware clock open and drains battery in silence.
    // start() and preview() both resume it, so suspending here is self-healing.
    this.ctx.suspend().catch(() => {
      // Nothing to do: the context is already closed or the browser refused.
    });
  }

  setVolume(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
  }

  setSound(slot: SoundSlot, pcm: PcmData): void {
    this.buffers[slot] = this.toBuffer(pcm);
  }

  /** Note: decodeAudioData detaches `bytes`; pass a copy if you still need them. */
  async decode(bytes: ArrayBuffer): Promise<PcmData> {
    const buffer = await this.ctx.decodeAudioData(bytes);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    return { sampleRate: buffer.sampleRate, channels };
  }

  async preview(pcm: PcmData): Promise<void> {
    await this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = this.toBuffer(pcm);
    source.connect(this.master);
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
    const buffer = this.buffers[beat.level];
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
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
