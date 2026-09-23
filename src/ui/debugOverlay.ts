import type { AudioEngine } from '../engine/audioEngine';

/** `?debug=1`: live scheduler health. minLead must stay > 0 ms and skipped must stay 0. */
export function mountDebugOverlay(el: HTMLElement, engine: AudioEngine): void {
  el.hidden = false;
  const ms = (seconds: number) => `${(seconds * 1000).toFixed(1)} ms`;
  const update = () => {
    const { scheduled, minLead, skipped } = engine.stats;
    const ctx = engine.ctx;
    el.textContent = [
      `context   ${ctx.state} @ ${ctx.sampleRate} Hz`,
      `scheduled ${scheduled}`,
      `minLead   ${Number.isFinite(minLead) ? ms(minLead) : '–'}`,
      `skipped   ${skipped}`,
      `output    ${ms(ctx.outputLatency || 0)}`,
      `base      ${ms(ctx.baseLatency || 0)}`,
    ].join('\n');
  };
  update();
  setInterval(update, 500);
}
