import { describe, expect, it } from 'vitest';
import { tempoMarking } from '../../src/state/tempoMarking';

describe('tempoMarking', () => {
  it('maps BPM to the classical Italian term at each boundary', () => {
    expect(tempoMarking(20)).toBe('Larghissimo');
    expect(tempoMarking(60)).toBe('Largo');
    expect(tempoMarking(61)).toBe('Larghetto');
    expect(tempoMarking(120)).toBe('Moderato');
    expect(tempoMarking(121)).toBe('Allegro');
    expect(tempoMarking(400)).toBe('Prestissimo');
  });
});
