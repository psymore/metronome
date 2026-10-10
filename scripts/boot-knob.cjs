// Builds the boot / easter-egg knob from public/icon.svg so the loading screen matches the Android
// launch splash exactly (same art, same mint halo as scripts/android-icons.cjs's splash):
//   public/boot-knob.svg   the knob body with its halo, no play glyph (it spins)
//   public/boot-glyph.svg  just the play glyph, on the same 500x500 canvas (it stays upright)
// Run after editing public/icon.svg:  node scripts/boot-knob.cjs
const fs = require('node:fs');

const raw = fs.readFileSync('public/icon.svg', 'utf8');
const glyphStart = raw.indexOf('<!-- Play glyph');
const glyphEnd = raw.lastIndexOf('</svg>');
if (glyphStart < 0 || glyphEnd < 0) throw new Error('public/icon.svg lost its play glyph marker');

const halo =
  '<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.74" stop-color="#7fe0bb" stop-opacity="0.4"/><stop offset="0.84" stop-color="#7fe0bb" stop-opacity="0.14"/><stop offset="1" stop-color="#7fe0bb" stop-opacity="0"/></radialGradient>';

const body = (raw.slice(0, glyphStart) + raw.slice(glyphEnd))
  .replace('viewBox="40 40 432 432"', 'viewBox="6 6 500 500"')
  .replace('<defs>', `<defs>${halo}`)
  .replace('<!-- Conic', '<circle cx="256" cy="256" r="250" fill="url(#glow)"/><!-- Conic');
if (!body.includes('url(#glow)') || !body.includes('viewBox="6 6 500 500"')) {
  throw new Error('public/icon.svg lost the markers this script edits');
}

const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 6 500 500">\n  ${raw.slice(glyphStart, glyphEnd).trim()}\n</svg>\n`;

fs.writeFileSync('public/boot-knob.svg', body);
fs.writeFileSync('public/boot-glyph.svg', glyph);
console.log('boot-knob.svg', body.length, 'bytes; boot-glyph.svg', glyph.length, 'bytes');
