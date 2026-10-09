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
    id: 'acoustic',
    accentSoundId: 'builtin:fs_gnuoctathorpe_rimshot',
    normalSoundId: 'builtin:vcsl_HiHat_Close_rr1_Mid',
  },
  {
    id: 'drumMachine',
    accentSoundId: 'builtin:synth_tr808-cowbell',
    normalSoundId: 'builtin:synth_tr808-hat-closed',
  },
  {
    id: 'claves',
    accentSoundId: 'builtin:vcsl_Claves1_Hit_v3_rr1_Mid',
    normalSoundId: 'builtin:vcsl_Claves2_Hit_v2_rr1_Mid',
  },
  {
    id: 'logDrum',
    accentSoundId: 'builtin:vcsl_LogDrumHi_MedM_v2_rr1_Sum',
    normalSoundId: 'builtin:vcsl_LogDrumLo_MedM_v2_rr1_Sum',
  },
  {
    id: 'cowbell',
    accentSoundId: 'builtin:vcsl_Cowbell1_Hit_v3_rr1_Mid',
    normalSoundId: 'builtin:vcsl_Cowbell1_Muted_v3_rr1_Mid',
  },
  {
    id: 'drumKit',
    accentSoundId: 'builtin:vcsl_BDrumNew_hit_v5_rr1_Sum',
    normalSoundId: 'builtin:vcsl_HiHat_Close_rr1_Mid',
  },
  {
    id: 'digital',
    accentSoundId: 'builtin:synth_digital-blip-high',
    normalSoundId: 'builtin:synth_digital-blip-low',
  },
] as const;
