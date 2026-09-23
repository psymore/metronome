/** Decoded audio independent of any AudioContext (so it can be unit-tested and cached). */
export interface PcmData {
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
}
