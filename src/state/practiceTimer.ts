/** Percent of the session elapsed so far, clamped to [0, 100]. */
export function practiceProgressPercent(elapsedSeconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  return (Math.min(totalSeconds, Math.max(0, elapsedSeconds)) / totalSeconds) * 100;
}

/** Remaining time as m:ss, floored at 0:00. */
export function formatTimeLeft(elapsedSeconds: number, totalSeconds: number): string {
  const remaining = Math.max(0, Math.round(totalSeconds - elapsedSeconds));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
