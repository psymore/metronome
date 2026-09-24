import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import {
  circularLayout,
  circularNodeSpacing,
  handAngle,
  nodeAngle,
  nodeRadius,
  polar,
} from './geometry';
import { spriteSize } from './nodeSprite';
import type { Visualizer } from './types';

export const circularVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme, sprites) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const { cx, cy, r, hub } = circularLayout(width, height);
    const nodeR = nodeRadius(r, circularNodeSpacing(n, r));

    // Same fixed pixel gap for the ring and the spokes, so both cut off the
    // same visible distance from the sphere edge regardless of radius.
    const gap = 5;
    const gapAngle = Math.asin(Math.min(1, (nodeR + gap) / r));

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const endAngle = a + gapAngle;
      const nextStartAngle =
        i < n - 1 ? nodeAngle(i + 1, n) - gapAngle : nodeAngle(0, n) - gapAngle + Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, endAngle, nextStartAngle);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const from = polar(cx, cy, hub, a);
      const to = polar(cx, cy, r - nodeR - gap, a);
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

    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = spriteSize(nodeR);
    for (let i = 0; i < n; i++) {
      const a = nodeAngle(i, n);
      const p = polar(cx, cy, r, a);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      const label = String(i + 1);
      const glow = i === frame.activeBeat ? frame.glow : 0;
      if (glow === 0) {
        const sprite = sprites.get(level, label, nodeR);
        if (sprite) {
          ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
          continue;
        }
      }
      drawNode(ctx, p.x, p.y, nodeR, level, glow, theme);
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = level === 'mute' ? theme.accent : '#fff';
      ctx.fillText(label, p.x, p.y);
      ctx.restore();
    }
  },
};
