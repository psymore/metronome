import { format } from '../i18n/i18n';

interface BarCounterProgress {
  /** 1-based bar number within the current loop. */
  bar: number;
  /** 1-based loop number. */
  loop: number;
}

/** Bar-within-loop and loop number for a raw, ever-increasing bar index. */
export function barCounterProgress(barIndex: number, targetBars: number): BarCounterProgress {
  if (targetBars <= 0) return { bar: barIndex + 1, loop: 1 };
  return { bar: (barIndex % targetBars) + 1, loop: Math.floor(barIndex / targetBars) + 1 };
}

/** Formats the bar counter display for the current raw bar index. */
export function formatBarCounter(barIndex: number, targetBars: number, _loopCount: number): string {
  const { bar } = barCounterProgress(barIndex, targetBars);
  if (targetBars <= 0) return format('barCounter.plain', { n: bar });
  return format('barCounter.withTarget', { n: bar, total: targetBars });
}

/** True once targetBars have played loopCount times in full (never for an infinite loop or no target). */
export function barCounterFinished(
  barIndex: number,
  targetBars: number,
  loopCount: number,
): boolean {
  return targetBars > 0 && loopCount !== 0 && barIndex >= targetBars * loopCount;
}

/** Shows the next bar while stopped, retaining the target when a bar limit is set. */
export function formatIdleBarCounter(targetBars: number, _loopCount: number): string {
  if (targetBars <= 0) return format('barCounter.plain', { n: 1 });
  return format('barCounter.withTarget', { n: 1, total: targetBars });
}
