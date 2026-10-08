// Renders the Android launcher icon, the launch splash and the Play Store icon from
// public/icon.svg. After editing public/icon.svg, regenerate every icon from the repo root:
//   npm run generate-pwa-assets      web icons and favicon
//   npx tauri icon public/icon.svg   desktop icons
//   node scripts/android-icons.cjs   this script
// sharp is installed with @vite-pwa/assets-generator.
const fs = require('node:fs');
const sharp = require('sharp');

const res = 'android/app/src/main/res/';
const raw = fs.readFileSync('public/icon.svg', 'utf8');

// The knob on a wider canvas with a soft mint halo behind it.
function withHalo(inner, outer) {
  const svg = raw
    .replace('viewBox="40 40 432 432"', 'viewBox="6 6 500 500"')
    .replace(
      '<defs>',
      `<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.74" stop-color="#7fe0bb" stop-opacity="${inner}"/><stop offset="0.84" stop-color="#7fe0bb" stop-opacity="${outer}"/><stop offset="1" stop-color="#7fe0bb" stop-opacity="0"/></radialGradient>`,
    )
    .replace('<!-- Conic', '<circle cx="256" cy="256" r="250" fill="url(#glow)"/><!-- Conic');
  if (svg === raw) throw new Error('public/icon.svg lost the markers this script edits');
  return svg;
}

const splashSvg = withHalo(0.4, 0.14);
// The launcher icon gets a stronger halo and lifted colours so it still reads on dark home
// screens. The splash, Play and web icons keep the original tones.
const launcherSvg = withHalo(0.7, 0.3);
const launcherLift = { brightness: 1.22, saturation: 1.15, lightness: 4 };

const render = (svg, px) => sharp(Buffer.from(svg), { density: 300 }).resize(px, px).png();

async function main() {
  // Launch splash (drawable/splash) and the web install splash.
  const splash = { mdpi: 216, hdpi: 324, xhdpi: 432, xxhdpi: 648, xxxhdpi: 864 };
  for (const [density, px] of Object.entries(splash)) {
    await render(splashSvg, px).toFile(`${res}drawable-${density}/splash.png`);
  }
  for (const px of [192, 512]) {
    await render(splashSvg, px).toFile(`public/splash-icon-${px}x${px}.png`);
  }

  // Legacy launcher icon (Android 5 to 7): the bare knob, lifted like the adaptive one.
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, px] of Object.entries(legacy)) {
    const knob = await render(raw, px).toBuffer();
    await sharp(knob)
      .modulate(launcherLift)
      .png()
      .toFile(`${res}mipmap-${density}/ic_launcher.png`);
  }

  // Adaptive foreground (Android 8+). The halo canvas at 0.69 of the 108dp layer keeps the knob
  // inside the 66dp safe zone; the background layer is @color/iconBackground.
  const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [density, layer] of Object.entries(adaptive)) {
    const knob = await sharp(Buffer.from(launcherSvg), { density: 300 })
      .resize(Math.round(layer * 0.69))
      .png()
      .toBuffer();
    const lifted = await sharp(knob).modulate(launcherLift).png().toBuffer();
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    await sharp({ create: { width: layer, height: layer, channels: 4, background: transparent } })
      .composite([{ input: lifted, gravity: 'center' }])
      .png()
      .toFile(`${res}mipmap-${density}/ic_foreground.png`);
  }

  // Play Store listing icon: an opaque 512px square; Play rounds the corners itself.
  const storeKnob = await render(raw, Math.round(512 * 0.94)).toBuffer();
  const teal = { r: 0x1b, g: 0x44, b: 0x35, alpha: 1 };
  await sharp({ create: { width: 512, height: 512, channels: 4, background: teal } })
    .composite([{ input: storeKnob, gravity: 'center' }])
    .png()
    .toFile('android/store_icon.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
