# Sound candidates

Audition set for possible new built-in sounds. Nothing here is wired into the app yet.
Every file is CC0 (public domain) or was synthesized for this project, so it can be
bundled in the web app, PWA, Tauri and Android builds with no attribution and no
redistribution limits. A credit line is still a nice gesture.

| Folder | Source | Licence | Format |
|---|---|---|---|
| `01-woodblock-claves/vcsl_*` | [VCSL](https://github.com/sgossner/VCSL), Versilian Community Sample Library | CC0 1.0 | 24-bit 44.1 kHz stereo WAV (original) |
| `02-metronome-clock/fs_*` | Freesound, per-file links below | CC0 1.0 | 128 kbps MP3 preview |
| `03-scifi/kenney_*` | [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) and [Digital Audio](https://kenney.nl/assets/digital-audio) | CC0 1.0 | OGG Vorbis (original) |
| `04-acoustic-drums/vcsl_*` | VCSL (as above) | CC0 1.0 | 24-bit WAV (original) |
| `04-acoustic-drums/fs_*` | Freesound, per-file links below | CC0 1.0 | 128 kbps MP3 preview |
| `05-drum-machine-synth/synth_*` | Rendered here with Web Audio (808/909-style recipes, no samples) | Ours | 16-bit 48 kHz mono WAV |

## Freesound files

The Freesound files are the public previews. Before shipping one, download the original
(needs a free Freesound account) so the bundled file isn't a lossy MP3 transcode.

| File | Original |
|---|---|
| `fs_sadiquecat_metronome-click` | https://freesound.org/people/Sadiquecat/sounds/793346/ |
| `fs_pushkin_metronome-2` | https://freesound.org/people/pushkin/sounds/445370/ |
| `fs_unfa_metronome-2khz` | https://freesound.org/people/unfa/sounds/243748/ |
| `fs_trader-one_mpc-metronome-click` | https://freesound.org/people/trader_one/sounds/684106/ |
| `fs_korgms2000b_metronome-click` | https://freesound.org/people/KorgMS2000B/sounds/54406/ |
| `fs_jonopodmore_mechanical-metronome-1..4` | Single ticks cut from https://freesound.org/people/jonopodmore/sounds/607216/ (73 s recording of a mechanical metronome) |
| `fs_pbimal_clock-tick-01` | https://freesound.org/people/pbimal/sounds/534094/ |
| `fs_fellur_tic-alt` | https://freesound.org/people/fellur/sounds/429721/ |
| `fs_diboz_assymetric-tick` | https://freesound.org/people/Diboz/sounds/211203/ |
| `fs_magundah14_tic-toc` | https://freesound.org/people/magundah14/sounds/187992/ |
| `fs_julien-matthey_tick-tock` | https://freesound.org/people/Julien_Matthey/sounds/118338/ |
| `fs_pjcohen_ludwig-closed-rimshot` | https://freesound.org/people/pjcohen/sounds/46564/ |
| `fs_gnuoctathorpe_rimshot` | https://freesound.org/people/gnuoctathorpe/sounds/404856/ |

## Notes for picking

- A built-in sound should have its audible part under about 0.3 s, so it doesn't smear into
  the next beat at fast tempos. Most of the woodblock, clock, sci-fi and drum-machine picks
  meet that. The acoustic kick, snare and tom ring for 1 to 1.8 s.
- The VCSL WAVs carry 5 to 25 ms of leading silence and up to 1.5 s of silent tail.
  The app already trims the leading silence at load. Trim the tail before bundling.
- The drum-machine set needs no files at all. The same recipes can go into
  `src/sounds/synth.ts` and render at startup like the current built-ins, at 0 bytes of
  download.
- Rejected: m1rk0's mechanical metronome pack is CC BY 3.0, not CC0, so it would need a
  visible credit. Another Freesound clock loop (modusmogulus 790486) was too soft to
  cut clean single ticks from.
