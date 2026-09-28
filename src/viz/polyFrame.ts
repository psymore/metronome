import type { PolyBeatEvent } from '../engine/polyScheduler';
import type { BeatLevel } from '../state/settings';
import { GLOW_SECONDS, glowIntensity } from './geometry';

export interface PolyFrame {
  running: boolean;
  a: number;
  b: number;
  /** Index of the most recently heard event in this layer; -1 when idle. */
  activeIndexA: number;
  activeIndexB: number;
  /** 0..1 flash intensity of the active vertex in this layer. */
  glowA: number;
  glowB: number;
  levelsA: readonly BeatLevel[];
  levelsB: readonly BeatLevel[];
  /** 0..1 split progress per coincident-pair key (from polyPairs). Missing keys mean 0. */
  splitFrac: Record<string, number>;
  reducedMotion: boolean;
}

export interface PolyFrameInput {
  running: boolean;
  beatA: PolyBeatEvent | null;
  beatB: PolyBeatEvent | null;
  heardTime: number;
  a: number;
  b: number;
  levelsA: readonly BeatLevel[];
  levelsB: readonly BeatLevel[];
  splitFrac: Record<string, number>;
  reducedMotion: boolean;
}

function glowFor(beat: PolyBeatEvent | null, heardTime: number): number {
  if (!beat) return 0;
  const since = heardTime - beat.time;
  const decay = Math.min(GLOW_SECONDS, beat.duration * 0.9);
  return glowIntensity(since, decay);
}

export function computePolyFrame(input: PolyFrameInput): PolyFrame {
  if (!input.running) {
    return {
      running: false,
      a: input.a,
      b: input.b,
      activeIndexA: -1,
      activeIndexB: -1,
      glowA: 0,
      glowB: 0,
      levelsA: input.levelsA,
      levelsB: input.levelsB,
      splitFrac: input.splitFrac,
      reducedMotion: input.reducedMotion,
    };
  }
  return {
    running: true,
    a: input.a,
    b: input.b,
    activeIndexA: input.beatA?.index ?? -1,
    activeIndexB: input.beatB?.index ?? -1,
    glowA: glowFor(input.beatA, input.heardTime),
    glowB: glowFor(input.beatB, input.heardTime),
    levelsA: input.levelsA,
    levelsB: input.levelsB,
    splitFrac: input.splitFrac,
    reducedMotion: input.reducedMotion,
  };
}
