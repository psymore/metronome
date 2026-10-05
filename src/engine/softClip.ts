// Transfer function for the master output limiter. Pure math, no Web Audio, so it can be unit
// tested; audioEngine.ts feeds it to a WaveShaperNode.

/** Below this absolute level the limiter is exactly the identity. */
export const SOFT_CLIP_KNEE = 0.75;
/** Asymptote of the shoulder. Output never reaches it, and never exceeds it. */
export const SOFT_CLIP_CEILING = 1;
/** Largest |input| the curve is built for. Two coincident poly accents reach ~2.7; 3 leaves headroom. */
export const SOFT_CLIP_DOMAIN = 3;
/** Curve table length. Odd, so the table has an exact sample at zero. */
export const SOFT_CLIP_CURVE_SIZE = 8193;

/**
 * Identity up to `knee`, then a tanh shoulder toward `ceiling`. The shoulder starts at the knee
 * with slope 1 (tanh'(0) = 1), so the curve is continuous in value and slope there.
 */
export function softClipSample(
  x: number,
  knee: number = SOFT_CLIP_KNEE,
  ceiling: number = SOFT_CLIP_CEILING,
): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const shoulder = ceiling - knee;
  const y = knee + shoulder * Math.tanh((a - knee) / shoulder);
  return x < 0 ? -y : y;
}

/**
 * Lookup table for a WaveShaperNode. Index i covers input u = -1 + 2i/(size-1), which the
 * WaveShaper reads as a value in [-1, 1]. The table stores softClipSample(u * domain), so the
 * caller must scale the signal by 1 / domain before the shaper. Output is then the limited signal
 * in the original units. Inputs past ±domain are clamped by the WaveShaper to the end values,
 * which are already at or below the ceiling.
 */
export function makeSoftClipCurve(
  size: number = SOFT_CLIP_CURVE_SIZE,
  domain: number = SOFT_CLIP_DOMAIN,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u = (2 * i) / (size - 1) - 1;
    curve[i] = softClipSample(u * domain);
  }
  return curve;
}
