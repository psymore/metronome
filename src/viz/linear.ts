import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { linearLayout, linearNodeX, linearStickX, nodeRadius } from './geometry';
import type { Visualizer } from './types';

export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const track = linearLayout(width, height);
    const nodeR = nodeRadius(n, track.width / 2);
    const tick = Math.max(18, nodeR * 2);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    ctx.beginPath();
    ctx.moveTo(track.left, track.y);
    ctx.lineTo(track.left + track.width, track.y);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i <= n; i++) {
      // i === n is the bar line at the right end.
      const x = linearNodeX(i, n, track.left, track.width);
      const h = i === n ? tick * 1.4 : tick;
      ctx.beginPath();
      ctx.moveTo(x, track.y - h);
      ctx.lineTo(x, track.y + h);
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

    ctx.font = `600 ${Math.round(Math.max(12, nodeR * 1.7))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const x = linearNodeX(i, n, track.left, track.width);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, x, track.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      ctx.fillStyle = theme.label;
      ctx.fillText(String(i + 1), x, track.y + tick * 2.2 + 14);
    }
  },
};
