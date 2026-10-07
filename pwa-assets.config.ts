import {
  defineConfig,
  minimal2023Preset as preset,
} from '@vite-pwa/assets-generator/config';

// icon.svg already carries its own full-bleed background, so no extra padding is added:
// padded output would leave transparent edges that show white on Android's adaptive icon mask.
export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0 },
    apple: { ...preset.apple, padding: 0 },
  },
  images: ['public/icon.svg'],
});
