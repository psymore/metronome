import { describe, expect, it } from 'vitest';
import { leadingSilenceSamples, trimLeadingSilence } from '../../src/sounds/trim';

describe('leadingSilenceSamples', () => {
  it('finds the first loud sample minus 1 ms of pre-roll', () => {
    const c = new Float32Array(1000);
    c[200] = 0.5;
    expect(leadingSilenceSamples([c], 48000)).toBe(152);
  });

  it('checks every channel', () => {
    const left = new Float32Array(500);
    const right = new Float32Array(500);
    right[100] = -0.2;
    expect(leadingSilenceSamples([left, right], 48000)).toBe(52);
  });

  it('returns 0 for pure silence or an immediate onset', () => {
    expect(leadingSilenceSamples([new Float32Array(100)], 48000)).toBe(0);
    const c = new Float32Array(100);
    c[10] = 1;
    expect(leadingSilenceSamples([c], 48000)).toBe(0);
  });
});

describe('trimLeadingSilence', () => {
  it('drops the silent head of every channel', () => {
    const c = new Float32Array(300);
    c[100] = 1;
    const out = trimLeadingSilence({ sampleRate: 1000, channels: [c] });
    expect(out.channels[0]?.length).toBe(201);
    expect(out.channels[0]?.[1]).toBe(1);
  });

  it('returns the same object when there is nothing to trim', () => {
    const pcm = { sampleRate: 1000, channels: [Float32Array.from([1, 0.5])] };
    expect(trimLeadingSilence(pcm)).toBe(pcm);
  });
});
