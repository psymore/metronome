import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { linearLayout, linearNodeSpacing, linearNodeX, linearStickX, nodeRadius } from './geometry';
import type { Visualizer } from './types';

export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const track = linearLayout(width, height);
    const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(n, track.width));
    const tick = Math.max(18, nodeR * 2);

    // Same fixed pixel gap as the circular view's ring/spoke cutoff.
    const gap = nodeR + 5;

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    for (let i = 0; i < n; i++) {
      const from = linearNodeX(i, n, track.left, track.width) + gap;
      const nextIndex = i + 1;
      const to = linearNodeX(nextIndex, n, track.left, track.width) - (nextIndex < n ? gap : 0);
      ctx.beginPath();
      ctx.moveTo(from, track.y);
      ctx.lineTo(to, track.y);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i <= n; i++) {
      // i === n is the bar line at the right end; it has no sphere, so no gap needed.
      const x = linearNodeX(i, n, track.left, track.width);
      const h = i === n ? tick * 1.4 : tick;
      ctx.beginPath();
      if (i === n) {
        ctx.moveTo(x, track.y - h);
        ctx.lineTo(x, track.y + h);
      } else {
        ctx.moveTo(x, track.y - h);
        ctx.lineTo(x, track.y - gap);
        ctx.moveTo(x, track.y + gap);
        ctx.lineTo(x, track.y + h);
      }
      ctx.stroke();
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const x = linearStickX(frame.activeBeat, frame.phase, n, track.left, track.width);
      ctx.save();
      ctx.strokeStyle = theme.hand;
      ctx.lineWidth = 5;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, track.y - tick * 2.2);
      ctx.lineTo(x, track.y + tick * 2.2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    for (let i = 0; i < n; i++) {
      const x = linearNodeX(i, n, track.left, track.width);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, x, track.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(String(i + 1), x, track.y);
    }
  },
};
