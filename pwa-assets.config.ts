import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// icon.svg is the bare BPM knob on a transparent background. The plain icons keep it
// transparent (also used for the install splash); the maskable and Apple icons need an opaque
// square, so they sit on a dark teal that matches the knob rim, so the knob reads as one big circle.
const background = '#1b4435';

export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0.06, resizeOptions: { background } },
    apple: { ...preset.apple, padding: 0.02, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
