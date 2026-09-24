export interface RenderPolicyInput {
  running: boolean;
  /** `document.hidden` — the page is in a background tab, or the window is minimised. */
  hidden: boolean;
}

/**
 * Whether the visualiser should request another animation frame after the one just drawn.
 * Nothing here affects *when* a click sounds; the audio scheduler runs on its own worker tick.
 */
export function shouldAnimate(input: RenderPolicyInput): boolean {
  return input.running && !input.hidden;
}
