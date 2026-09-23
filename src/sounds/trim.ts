import type { PcmData } from './pcm';

const PRE_ROLL_SECONDS = 0.001;

/** Samples of near-silence before the sound starts, keeping 1 ms of pre-roll. */
export function leadingSilenceSamples(
  channels: readonly Float32Array[],
  sampleRate: number,
  threshold = 0.003,
): number {
  let length = 0;
  for (const c of channels) length = Math.max(length, c.length);
  for (let i = 0; i < length; i++) {
    for (const c of channels) {
      if (i < c.length && Math.abs(c[i] ?? 0) >= threshold) {
        return Math.max(0, i - Math.round(sampleRate * PRE_ROLL_SECONDS));
      }
    }
  }
  return 0;
}

/** Remove leading silence so the click is heard exactly at its scheduled time. */
export function trimLeadingSilence(pcm: PcmData): PcmData {
  const start = leadingSilenceSamples(pcm.channels, pcm.sampleRate);
  if (start === 0) return pcm;
  return { sampleRate: pcm.sampleRate, channels: pcm.channels.map((c) => c.slice(start)) };
}
