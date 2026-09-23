import { describe, expect, it } from 'vitest';
import { computeHeardTime } from '../../src/engine/clock';

const base = { perfNow: 5100, currentTime: 10.2, outputLatency: 0.05, syncOffsetMs: 0 };

describe('computeHeardTime', () => {
  it('extrapolates the output timestamp to now', () => {
    const t = computeHeardTime({ ...base, timestamp: { contextTime: 10, performanceTime: 5000 } });
    expect(t).toBeCloseTo(10.1, 9);
  });

  it('never runs ahead of currentTime', () => {
    const t = computeHeardTime({
      ...base,
      perfNow: 6000,
      timestamp: { contextTime: 10, performanceTime: 5000 },
    });
    expect(t).toBeCloseTo(10.2, 9);
  });

  it('falls back to currentTime − outputLatency without a timestamp', () => {
    expect(computeHeardTime({ ...base, timestamp: null })).toBeCloseTo(10.15, 9);
  });

  it('treats a zero performanceTime (not yet rendering) as missing', () => {
    const t = computeHeardTime({ ...base, timestamp: { contextTime: 0, performanceTime: 0 } });
    expect(t).toBeCloseTo(10.15, 9);
  });

  it('subtracts the sync offset so positive values delay the visuals', () => {
    const t = computeHeardTime({
      ...base,
      syncOffsetMs: 20,
      timestamp: { contextTime: 10, performanceTime: 5000 },
    });
    expect(t).toBeCloseTo(10.08, 9);
  });
});
