/** Ready-made accent / other-beat pairs; applying one preserves the user's volume mix. */
export const SOUND_PRESETS = [
  {
    id: 'classic',
    accentSoundId: 'builtin:click-high',
    normalSoundId: 'builtin:click',
  },
  {
    id: 'woodblock',
    accentSoundId: 'builtin:vcsl_Agogo_High_v2_rr1_Mid',
    normalSoundId: 'builtin:vcsl_Agogo_Low_v2_rr1_Mid',
  },
  {
    id: 'mechanical',
    accentSoundId: 'builtin:fs_jonopodmore_mechanical-metronome-2',
    normalSoundId: 'builtin:fs_jonopodmore_mechanical-metronome-3',
  },
  {
    id: 'scifi',
    accentSoundId: 'builtin:kenney_laserSmall_000',
    normalSoundId: 'builtin:kenney_laserSmall_001',
  },
  {
    id: 'acoustic',
    accentSoundId: 'builtin:fs_gnuoctathorpe_rimshot',
    normalSoundId: 'builtin:vcsl_HiHat_Close_rr1_Mid',
  },
  {
    id: 'drumMachine',
    accentSoundId: 'builtin:synth_tr808-cowbell',
    normalSoundId: 'builtin:synth_tr808-hat-closed',
  },
] as const;
