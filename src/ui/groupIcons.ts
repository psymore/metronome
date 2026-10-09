/**
 * Small line icons for the sound picker's group headings. Drawn for this app (16×16 grid,
 * 1.4 stroke, currentColor), so there's no third-party licence to track.
 */
const ICONS: Record<string, string> = {
  // Metronome: a tapered body with its pendulum arm.
  builtin: '<path d="M5.5 14L7 3h2l1.5 11z"/><path d="M8 10.5l2.5-5"/><path d="M4 14h8"/>',
  // Woodblock: a block with its hollow slot.
  woodblock: '<rect x="2.5" y="5" width="11" height="6" rx="1.5"/><path d="M5.5 8h5"/>',
  // Clock face with hands.
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  // Bass drum: a shell with a head on top.
  drums:
    '<ellipse cx="8" cy="5" rx="5.5" ry="2"/><path d="M2.5 5v5.5c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V5"/>',
  // Drum machine: a 2×2 grid of pads.
  drumMachine:
    '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  // Tray with an upward arrow for the user's own uploads.
  yours: '<path d="M8 2.5v7"/><path d="M5.5 5L8 2.5 10.5 5"/><path d="M3 9.5v3.5h10V9.5"/>',
};

/** The icon for a group id ('builtin', 'woodblock', …, or 'yours'); empty if unknown. */
export function groupIconMarkup(key: string): string {
  return ICONS[key] ?? '';
}
