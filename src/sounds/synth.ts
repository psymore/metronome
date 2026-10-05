export interface ClickSpec {
  frequency: number;
  durationMs: number;
  decayMs: number;
  /** 0–1 share of white noise mixed in (woodblock-style attack). */
  noise?: number;
}

/** Display groups for built-ins, in the order they appear in the sound pickers. */
export const BUILTIN_GROUPS = [
  'builtin',
  'woodblock',
  'clock',
  'scifi',
  'drums',
  'drumMachine',
] as const;
export type BuiltinGroup = (typeof BUILTIN_GROUPS)[number];

/** A built-in is either rendered from a synth spec or decoded from a WAV in `public/sounds/`. */
export type BuiltinSound = { name: string; group: BuiltinGroup } & (
  | { spec: ClickSpec; file?: undefined }
  | { file: string; spec?: undefined }
);

const fileSound = (name: string, stem: string, group: BuiltinGroup): BuiltinSound => ({
  name,
  file: `${stem}.wav`,
  group,
});

export const BUILTIN_SOUNDS: Record<string, BuiltinSound> = {
  'builtin:click-high': {
    name: 'Click (high)',
    spec: { frequency: 1760, durationMs: 60, decayMs: 12 },
    group: 'builtin',
  },
  'builtin:click': {
    name: 'Click',
    spec: { frequency: 1320, durationMs: 60, decayMs: 12 },
    group: 'builtin',
  },
  'builtin:wood': {
    name: 'Woodblock',
    spec: { frequency: 900, durationMs: 80, decayMs: 18, noise: 0.25 },
    group: 'builtin',
  },
  'builtin:beep': {
    name: 'Beep',
    spec: { frequency: 880, durationMs: 90, decayMs: 60 },
    group: 'builtin',
  },

  // Woodblock & claves (VCSL, CC0)
  'builtin:vcsl_Agogo_High_v2_rr1_Mid': fileSound(
    'Agogo High',
    'vcsl_Agogo_High_v2_rr1_Mid',
    'woodblock',
  ),
  'builtin:vcsl_Agogo_Low_v2_rr1_Mid': fileSound(
    'Agogo Low',
    'vcsl_Agogo_Low_v2_rr1_Mid',
    'woodblock',
  ),
  'builtin:vcsl_Claves1_Hit_v3_rr1_Mid': fileSound(
    'Claves 1',
    'vcsl_Claves1_Hit_v3_rr1_Mid',
    'woodblock',
  ),
  'builtin:vcsl_Claves2_Hit_v2_rr1_Mid': fileSound(
    'Claves 2',
    'vcsl_Claves2_Hit_v2_rr1_Mid',
    'woodblock',
  ),
  'builtin:vcsl_LogDrumHi_MedM_v2_rr1_Sum': fileSound(
    'Log Drum High',
    'vcsl_LogDrumHi_MedM_v2_rr1_Sum',
    'woodblock',
  ),
  'builtin:vcsl_LogDrumLo_MedM_v2_rr1_Sum': fileSound(
    'Log Drum Low',
    'vcsl_LogDrumLo_MedM_v2_rr1_Sum',
    'woodblock',
  ),
  'builtin:vcsl_slapstick_rr1': fileSound('Slapstick', 'vcsl_slapstick_rr1', 'woodblock'),
  'builtin:vcsl_wood_click2_mp': fileSound('Wood Click 2', 'vcsl_wood_click2_mp', 'woodblock'),
  'builtin:vcsl_wood_click3_vl2': fileSound('Wood Click 3', 'vcsl_wood_click3_vl2', 'woodblock'),
  'builtin:vcsl_wood_click_f_rr1': fileSound('Wood Click F', 'vcsl_wood_click_f_rr1', 'woodblock'),
  'builtin:vcsl_wood_click_ff': fileSound('Wood Click FF', 'vcsl_wood_click_ff', 'woodblock'),
  'builtin:vcsl_wood_click_mp': fileSound('Wood Click MP', 'vcsl_wood_click_mp', 'woodblock'),

  // Metronome & clock ticks (Freesound previews, CC0)
  'builtin:fs_fellur_tic-alt': fileSound('Tic Alt', 'fs_fellur_tic-alt', 'clock'),
  'builtin:fs_jonopodmore_mechanical-metronome-2': fileSound(
    'Mechanical 2',
    'fs_jonopodmore_mechanical-metronome-2',
    'clock',
  ),
  'builtin:fs_jonopodmore_mechanical-metronome-3': fileSound(
    'Mechanical 3',
    'fs_jonopodmore_mechanical-metronome-3',
    'clock',
  ),
  'builtin:fs_julien-matthey_tick-tock': fileSound(
    'Tick-Tock',
    'fs_julien-matthey_tick-tock',
    'clock',
  ),
  'builtin:fs_korgms2000b_metronome-click': fileSound(
    'Metronome Click A',
    'fs_korgms2000b_metronome-click',
    'clock',
  ),
  'builtin:fs_magundah14_tic-toc': fileSound('Tic-Toc', 'fs_magundah14_tic-toc', 'clock'),
  'builtin:fs_pbimal_clock-tick-01': fileSound('Clock Tick', 'fs_pbimal_clock-tick-01', 'clock'),
  'builtin:fs_pushkin_metronome-2': fileSound('Metronome 2', 'fs_pushkin_metronome-2', 'clock'),
  'builtin:fs_sadiquecat_metronome-click': fileSound(
    'Metronome Click B',
    'fs_sadiquecat_metronome-click',
    'clock',
  ),
  'builtin:fs_trader-one_mpc-metronome-click': fileSound(
    'Metronome Click C',
    'fs_trader-one_mpc-metronome-click',
    'clock',
  ),
  'builtin:fs_unfa_metronome-2khz': fileSound('2 kHz Beep', 'fs_unfa_metronome-2khz', 'clock'),

  // Sci-fi (Kenney, CC0)
  'builtin:kenney_impactMetal_000': fileSound('Metal Impact 1', 'kenney_impactMetal_000', 'scifi'),
  'builtin:kenney_impactMetal_002': fileSound('Metal Impact 2', 'kenney_impactMetal_002', 'scifi'),
  'builtin:kenney_impactMetal_004': fileSound('Metal Impact 3', 'kenney_impactMetal_004', 'scifi'),
  'builtin:kenney_laserLarge_003': fileSound('Laser Large', 'kenney_laserLarge_003', 'scifi'),
  'builtin:kenney_laserSmall_000': fileSound('Laser Small 1', 'kenney_laserSmall_000', 'scifi'),
  'builtin:kenney_laserSmall_001': fileSound('Laser Small 2', 'kenney_laserSmall_001', 'scifi'),
  'builtin:kenney_laserSmall_003': fileSound('Laser Small 3', 'kenney_laserSmall_003', 'scifi'),
  'builtin:kenney_phaserUp7': fileSound('Phaser Up', 'kenney_phaserUp7', 'scifi'),
  'builtin:kenney_tone1': fileSound('Tone', 'kenney_tone1', 'scifi'),

  // Acoustic drums & percussion (VCSL + Freesound, CC0)
  'builtin:fs_gnuoctathorpe_rimshot': fileSound('Rimshot', 'fs_gnuoctathorpe_rimshot', 'drums'),
  'builtin:fs_pjcohen_ludwig-closed-rimshot': fileSound(
    'Rimshot 2',
    'fs_pjcohen_ludwig-closed-rimshot',
    'drums',
  ),
  'builtin:vcsl_BDrumNew_hit_v5_rr1_Sum': fileSound(
    'Bass Drum',
    'vcsl_BDrumNew_hit_v5_rr1_Sum',
    'drums',
  ),
  'builtin:vcsl_Cajon_hit1_f_rr1': fileSound('Cajon', 'vcsl_Cajon_hit1_f_rr1', 'drums'),
  'builtin:vcsl_Clap_rr1': fileSound('Clap', 'vcsl_Clap_rr1', 'drums'),
  'builtin:vcsl_Cowbell1_Hit_v3_rr1_Mid': fileSound(
    'Cowbell',
    'vcsl_Cowbell1_Hit_v3_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_Cowbell1_Muted_v3_rr1_Mid': fileSound(
    'Cowbell Muted',
    'vcsl_Cowbell1_Muted_v3_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_HiHat_Close_rr1_Mid': fileSound(
    'Hi-hat Closed',
    'vcsl_HiHat_Close_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_HiHat_HitC_v3_rr1_Mid': fileSound(
    'Hi-hat Closed 2',
    'vcsl_HiHat_HitC_v3_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_Snare2_HitSN_v5_rr1_Mid': fileSound(
    'Snare',
    'vcsl_Snare2_HitSN_v5_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_Snare2_stick_v1_rr1_Mid': fileSound(
    'Snare Stick',
    'vcsl_Snare2_stick_v1_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_TomH_HitS_v3_rr1_Mid': fileSound('Tom High', 'vcsl_TomH_HitS_v3_rr1_Mid', 'drums'),
  'builtin:vcsl_TomH_rimS_v2_rr1_Mid': fileSound(
    'Tom High Rim',
    'vcsl_TomH_rimS_v2_rr1_Mid',
    'drums',
  ),
  'builtin:vcsl_Triangle1_HitM_v1_rr2_Mid': fileSound(
    'Triangle',
    'vcsl_Triangle1_HitM_v1_rr2_Mid',
    'drums',
  ),

  // Drum machine (rendered by us, 808/909-style)
  'builtin:synth_digital-blip-high': fileSound(
    'Blip High',
    'synth_digital-blip-high',
    'drumMachine',
  ),
  'builtin:synth_digital-blip-low': fileSound('Blip Low', 'synth_digital-blip-low', 'drumMachine'),
  'builtin:synth_tr808-clap': fileSound('808 Clap', 'synth_tr808-clap', 'drumMachine'),
  'builtin:synth_tr808-clave': fileSound('808 Clave', 'synth_tr808-clave', 'drumMachine'),
  'builtin:synth_tr808-cowbell': fileSound('808 Cowbell', 'synth_tr808-cowbell', 'drumMachine'),
  'builtin:synth_tr808-hat-closed': fileSound(
    '808 Hat Closed',
    'synth_tr808-hat-closed',
    'drumMachine',
  ),
  'builtin:synth_tr808-hat-open': fileSound('808 Hat Open', 'synth_tr808-hat-open', 'drumMachine'),
  'builtin:synth_tr808-kick': fileSound('808 Kick', 'synth_tr808-kick', 'drumMachine'),
  'builtin:synth_tr808-rimshot': fileSound('808 Rimshot', 'synth_tr808-rimshot', 'drumMachine'),
  'builtin:synth_tr808-snare': fileSound('808 Snare', 'synth_tr808-snare', 'drumMachine'),
  'builtin:synth_tr808-tom-mid': fileSound('808 Tom Mid', 'synth_tr808-tom-mid', 'drumMachine'),
  'builtin:synth_tr909-kick': fileSound('909 Kick', 'synth_tr909-kick', 'drumMachine'),
  'builtin:synth_tr909-snare': fileSound('909 Snare', 'synth_tr909-snare', 'drumMachine'),
};

/** Sine burst with a 0.5 ms fade-in (no pop, onset well under 1 ms) and a 2 ms fade-out. */
export function renderClick(
  spec: ClickSpec,
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round((spec.durationMs / 1000) * sampleRate));
  const out = new Float32Array(length);
  const fadeIn = Math.max(1, Math.round(sampleRate * 0.0005));
  const decay = (spec.decayMs / 1000) * sampleRate;
  const noise = spec.noise ?? 0;
  for (let i = 0; i < length; i++) {
    const envelope = Math.min(1, (i + 1) / fadeIn) * Math.exp(-i / decay);
    const tone = Math.sin((2 * Math.PI * spec.frequency * i) / sampleRate);
    const hiss = noise > 0 ? (random() * 2 - 1) * noise : 0;
    out[i] = (tone * (1 - noise) + hiss) * envelope * 0.9;
  }
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.002));
  for (let i = 0; i < fadeOut; i++) {
    const idx = length - 1 - i;
    out[idx] = (out[idx] ?? 0) * (i / fadeOut);
  }
  return out;
}
