const MARKINGS: ReadonlyArray<readonly [max: number, name: string]> = [
  [24, 'Larghissimo'],
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
  [Number.POSITIVE_INFINITY, 'Prestissimo'],
];

/** The classical Italian tempo term for a given BPM. */
export function tempoMarking(bpm: number): string {
  for (const [max, name] of MARKINGS) {
    if (bpm <= max) return name;
  }
  return MARKINGS[MARKINGS.length - 1][1];
}
