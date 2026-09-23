import type { PcmData } from '../sounds/pcm';
import { BeatTimeline } from './beatTimeline';
import { computeHeardTime } from './clock';
import { type BeatEvent, type Pattern, Scheduler, type SchedulerStats } from './scheduler';

export type SoundSlot = 'accent' | 'normal';

export interface AudioEngineOptions {
  getPattern: () => Pattern;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly timeline = new BeatTimeline();
  private readonly master: GainNode;
  private readonly scheduler: Scheduler;
  private readonly worker: Worker;
  private readonly buffers: Record<SoundSlot, AudioBuffer | null> = { accent: null, normal: null };
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(opts: AudioEngineOptions) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.scheduler = new Scheduler({
      getPattern: opts.getPattern,
      onBeat: (b) => this.playBeat(b),
    });
    this.worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = () => this.scheduler.tick(this.ctx.currentTime);
    this.ctx.addEventListener('statechange', () => {
      // Device change or OS interruption while playing: try to get the clock running again.
      if (this.scheduler.isRunning && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    });
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
    await this.ctx.resume();
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

  private toBuffer(pcm: PcmData): AudioBuffer {
    const length = Math.max(1, ...pcm.channels.map((c) => c.length));
    const buffer = this.ctx.createBuffer(Math.max(1, pcm.channels.length), length, pcm.sampleRate);
    pcm.channels.forEach((channel, i) => {
      buffer.copyToChannel(channel, i);
    });
    return buffer;
  }
}
