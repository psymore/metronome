export function polygonVertices(
  n: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

/** The shared square region both polygon layers are inscribed in, centered like circularLayout. */
export function polyStageLayout(width: number, height: number) {
  const size = Math.min(width, height);
  const pad = Math.max(18, size * 0.12);
  const radius = Math.max(10, size / 2 - pad);
  return { cx: width / 2, cy: height / 2, radius };
}
