import type { BeatLevel } from '../state/settings';
import { drawNode } from './drawNode';
import {
  beatLayoutGrid,
  linearGridStickX,
  linearGridX,
  linearGridY,
  linearLayout,
  linearNodeSpacing,
  nodeRadius,
} from './geometry';
import { spriteSize } from './nodeSprite';
import type { Visualizer } from './types';

export const linearVisualizer: Visualizer = {
  draw(ctx, { width, height }, frame, theme, sprites, style) {
    ctx.clearRect(0, 0, width, height);
    const n = frame.beatsPerBar;
    const track = linearLayout(width, height);
    const cells = beatLayoutGrid(n);
    const rows = cells[0]?.rows ?? 1;
    const nodeR = nodeRadius(track.width / 2, linearNodeSpacing(Math.min(n, 4), track.width));
    const tick = Math.max(18, nodeR * 2);
    const reach = tick * 2.2; // the stick's half-height, the tallest thing drawn around a row
    // Rows shrink together to fit the canvas height (the mobile stage is capped at 320px), keeping
    // the outer rows' stick on-canvas, but never so far that neighbouring spheres touch.
    // Keep identical to linearBeatAt in hitTest.ts.
    const rowGap =
      rows > 1
        ? Math.max(nodeR * 2 + 6, Math.min(tick * 3.2, (height - reach * 2) / (rows - 1)))
        : tick * 3.2;
    // Row tick marks stop halfway to the next row rather than running into its marks.
    const rowTick = rows > 1 ? Math.min(tick, rowGap / 2) : tick;
    const barTick = rows > 1 ? Math.min(tick * 1.4, rowGap / 2) : tick * 1.4;
    const gap = nodeR + 5;

    const rowY = (row: number) => linearGridY(row, rows, track.y, rowGap);
    const nodeX = (col: number, rowCount: number) =>
      linearGridX(col, rowCount, track.left, track.width);

    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.ring;
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const y = rowY(cell.row);
      const from = nodeX(cell.col, cell.rowCount) + gap;
      const nextCol = cell.col + 1;
      const to =
        nextCol < cell.rowCount
          ? nodeX(nextCol, cell.rowCount) - gap
          : nodeX(cell.col, cell.rowCount) + gap;
      if (nextCol >= cell.rowCount) continue; // no connecting segment past the last node in a row
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.spoke;
    for (let row = 0; row < rows; row++) {
      const rowCount = cells.find((c) => c.row === row)?.rowCount ?? 0;
      const y = rowY(row);
      for (let col = 0; col <= rowCount; col++) {
        // col === rowCount is the bar line at the right end of this row; it has no sphere.
        const x =
          col < rowCount
            ? nodeX(col, rowCount)
            : nodeX(rowCount - 1, rowCount) + track.width / 4 / 2;
        const isEnd = col === rowCount;
        const h = isEnd ? barTick : rowTick;
        ctx.beginPath();
        if (isEnd) {
          ctx.moveTo(x, y - h);
          ctx.lineTo(x, y + h);
        } else {
          ctx.moveTo(x, y - h);
          ctx.lineTo(x, y - gap);
          ctx.moveTo(x, y + gap);
          ctx.lineTo(x, y + h);
        }
        ctx.stroke();
      }
    }

    if (frame.activeBeat >= 0 && !frame.reducedMotion) {
      const cell = cells[frame.activeBeat];
      if (cell) {
        const y = rowY(cell.row);
        const x = linearGridStickX(cell.col, frame.phase, cell.rowCount, track.left, track.width);
        ctx.save();
        ctx.strokeStyle = theme.hand;
        ctx.lineWidth = 5;
        ctx.shadowColor = theme.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(x, y - reach);
        ctx.lineTo(x, y + reach);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.font = `600 ${Math.round(Math.max(10, nodeR * 1.05))}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = spriteSize(nodeR);
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const x = nodeX(cell.col, cell.rowCount);
      const y = rowY(cell.row);
      const level: BeatLevel = frame.levels[i] ?? (i === 0 ? 'accent' : 'normal');
      const label = String(i + 1);
      const glow = i === frame.activeBeat ? frame.glow : 0;
      if (glow === 0) {
        const sprite = sprites.get(level, label, nodeR);
        if (sprite) {
          ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
          continue;
        }
      }
      drawNode(ctx, x, y, nodeR, level, glow, theme, style);
      if (style === 'classic') {
        ctx.save();
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, y);
        ctx.restore();
      }
    }
  },
};
