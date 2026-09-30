import { beatPhase } from '../engine/beatTimeline';
import type { BeatEvent } from '../engine/scheduler';
import { type BeatLevel, isSubOn } from '../state/settings';
import { GLOW_SECONDS, glowIntensity, MUTE_GLOW_SCALE } from './geometry';

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
  /** Clicks per beat the dots between nodes stand for; 1 = no dots. */
  subdivision: number;
  /** Which subdivision click (1..subdivision−1) inside the active beat was heard last; −1 on the
   *  beat itself, or when idle. */
  activeSub: number;
  /** 0..1 flash intensity of that subdivision's dot. */
  subGlow: number;
  reducedMotion: boolean;
  subOff: readonly boolean[];
  /** The one subdivision group currently fanned out, if any; set by VizController. */
  subFan?: { beat: number; frac: number };
}

export interface FrameInput {
  running: boolean;
  beat: BeatEvent | null;
  heardTime: number;
  beatsPerBar: number;
  levels: readonly BeatLevel[];
  reducedMotion: boolean;
  /** Effective clicks per beat (1 when off, and always 1 in compound meters). */
  subdivision: number;
  subOff: readonly boolean[];
}

export function computeFrame(input: FrameInput): VizFrame {
  const { beat } = input;
  const subdivision = Math.max(1, input.subdivision);
  if (!input.running || !beat) {
    return {
      running: input.running,
      beatsPerBar: input.beatsPerBar,
      levels: input.levels,
      activeBeat: -1,
      phase: 0,
      glow: 0,
      subdivision,
      activeSub: -1,
      subGlow: 0,
      reducedMotion: input.reducedMotion,
      subOff: input.subOff,
    };
  }
  const since = input.heardTime - beat.time;
  const decay = Math.min(GLOW_SECONDS, beat.duration * 0.9);
  const glow = glowIntensity(since, decay);
  // Same spacing the scheduler uses for the subdivision clicks (beat.time + duration * k / sub),
  // and the same "gone before the next click" decay rule as the beat glow above.
  let activeSub = -1;
  let subGlow = 0;
  if (subdivision > 1 && beat.duration > 0 && since >= 0) {
    const pulse = beat.duration / subdivision;
    // The epsilon keeps an exact k/sub boundary from flooring to k−1 on float rounding.
    const k = Math.min(subdivision - 1, Math.floor(since / pulse + 1e-9));
    if (k >= 1) {
      activeSub = k;
      subGlow = isSubOn(input.subOff, subdivision, beat.beatInBar, k)
        ? glowIntensity(Math.max(0, since - k * pulse), Math.min(GLOW_SECONDS, pulse * 0.9))
        : 0;
    }
  }
  return {
    running: true,
    beatsPerBar: beat.beatsPerBar,
    levels: input.levels,
    activeBeat: beat.beatInBar,
    phase: beatPhase(beat, input.heardTime),
    glow: beat.level === 'mute' ? glow * MUTE_GLOW_SCALE : glow,
    subdivision,
    activeSub,
    subGlow,
    reducedMotion: input.reducedMotion,
    subOff: input.subOff,
  };
}
