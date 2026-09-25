import { describe, expect, it } from 'vitest';
import { formatTimeLeft, practiceProgressPercent } from '../../src/state/practiceTimer';

describe('practiceProgressPercent', () => {
  it('is 0 with no session', () => {
    expect(practiceProgressPercent(0, 0)).toBe(0);
  });

  it('scales linearly within the session', () => {
    expect(practiceProgressPercent(0, 120)).toBe(0);
    expect(practiceProgressPercent(60, 120)).toBe(50);
    expect(practiceProgressPercent(120, 120)).toBe(100);
  });

  it('clamps to the session bounds', () => {
    expect(practiceProgressPercent(-5, 120)).toBe(0);
    expect(practiceProgressPercent(999, 120)).toBe(100);
  });
});

describe('formatTimeLeft', () => {
  it('formats minutes and seconds', () => {
    expect(formatTimeLeft(0, 125)).toBe('2:05');
    expect(formatTimeLeft(65, 125)).toBe('1:00');
    expect(formatTimeLeft(120, 125)).toBe('0:05');
  });

  it('floors at 0:00 once elapsed reaches or passes the total', () => {
    expect(formatTimeLeft(125, 125)).toBe('0:00');
    expect(formatTimeLeft(999, 125)).toBe('0:00');
  });
});
