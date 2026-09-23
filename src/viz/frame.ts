import { beatPhase } from '../engine/beatTimeline';
import type { BeatEvent } from '../engine/scheduler';
import type { BeatLevel } from '../state/settings';
import { GLOW_SECONDS, glowIntensity } from './geometry';

export interface VizFrame {
  running: boolean;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  /** Beat index (in bar) most recently heard; −1 when idle. */
  activeBeat: number;
  /** 0..1 progress from the active beat to the next. */
  phase: number;
  /** 0..1 flash intensity of the active beat's node. */
  glow: number;
  reducedMotion: boolean;
}

export interface FrameInput {
  running: boolean;
  beat: BeatEvent | null;
  heardTime: number;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  reducedMotion: boolean;
}

export function computeFrame(input: FrameInput): VizFrame {
  const { beat } = input;
  if (!input.running || !beat) {
    return {
      running: input.running,
      beatsPerBar: input.beatsPerBar,
      levels: input.levels,
      activeBeat: -1,
      phase: 0,
      glow: 0,
      reducedMotion: input.reducedMotion,
    };
  }
  const since = input.heardTime - beat.time;
  const decay = Math.min(GLOW_SECONDS, beat.duration * 0.9);
  const glow = glowIntensity(since, decay);
  return {
    running: true,
    beatsPerBar: beat.beatsPerBar,
    levels: input.levels,
    activeBeat: beat.beatInBar,
    phase: beatPhase(beat, input.heardTime),
    glow: beat.level === 'mute' ? glow * 0.25 : glow,
    reducedMotion: input.reducedMotion,
  };
}
