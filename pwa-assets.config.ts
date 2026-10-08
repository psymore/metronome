import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// icon.svg is the bare BPM knob on a transparent background. The plain icons keep it
// transparent (also used for the install splash); the maskable and Apple icons need an opaque
// square, so they sit on the app's own #141416 with room for the launcher's mask.
const background = '#141416';

export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0.12, resizeOptions: { background } },
    apple: { ...preset.apple, padding: 0.04, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
