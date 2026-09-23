import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import { circularLayout, handAngle, nodeAngle, nodeRadius, polar } from './geometry';
import type { Visualizer } from './types';

export const circularVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const { cx, cy, r, hub, labelPad } = circularLayout(width, height);
    const nodeR = nodeRadius(n, r);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const from = polar(cx, cy, hub, a);
      const to = polar(cx, cy, r, a);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const a = handAngle(frame.activeBeat, frame.phase, n);
      const from = polar(cx, cy, hub, a);
      const to = polar(cx, cy, r, a);
      ctx.save();
      ctx.strokeStyle = theme.hand;
      ctx.lineWidth = 5;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = `600 ${Math.round(Math.max(12, nodeR * 1.7))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const p = polar(cx, cy, r, a);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      drawNode(ctx, p.x, p.y, nodeR, level, i === frame.activeBeat ? frame.glow : 0, theme);
      const label = polar(cx, cy, r + labelPad, a);
      ctx.fillStyle = theme.label;
      ctx.fillText(String(i + 1), label.x, label.y);
    }
  },
};
