import { describe, expect, it } from 'vitest';
import {
  beatLayoutGrid,
  circularLayout,
  circularNodeSpacing,
  circularRingRadius,
  GLOW_SECONDS,
  glowIntensity,
  handAngle,
  linearGridStickX,
  linearGridX,
  linearGridY,
  linearLayout,
  linearNodeSpacing,
  linearNodeX,
  linearStickX,
  nodeAngle,
  nodeRadius,
  polar,
  subDotRadius,
} from '../../src/viz/geometry';

describe('circular geometry', () => {
  it("puts beat 1 at 12 o'clock and goes clockwise on screen (y grows downward)", () => {
    const top = polar(0, 0, 10, nodeAngle(0, 4));
    const right = polar(0, 0, 10, nodeAngle(1, 4));
    const bottom = polar(0, 0, 10, nodeAngle(2, 4));
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(bottom.y).toBeCloseTo(10);
  });

  it('lands the hand exactly on a node at its beat', () => {
    expect(handAngle(1, 0, 4)).toBeCloseTo(nodeAngle(1, 4));
    const end = polar(0, 0, 1, handAngle(3, 1, 4));
    const first = polar(0, 0, 1, nodeAngle(0, 4));
    expect(end.x).toBeCloseTo(first.x);
    expect(end.y).toBeCloseTo(first.y);
  });

  it('sweeps between nodes with the phase', () => {
    const mid = polar(0, 0, 1, handAngle(3, 0.5, 4)); // between beat 4 (left) and beat 1 (top)
    expect(mid.x).toBeLessThan(0);
    expect(mid.y).toBeLessThan(0);
  });

  it('handles a one-beat bar as a full turn per beat', () => {
    const half = polar(0, 0, 1, handAngle(0, 0.5, 1));
    expect(half.y).toBeCloseTo(1);
  });

  it('lays out the circle inside the canvas with room for labels', () => {
    const l = circularLayout(400, 300);
    expect(l.cx).toBe(200);
    expect(l.cy).toBe(150);
    expect(l.r).toBeCloseTo(117);
    expect(l.hub).toBeCloseTo(117 * 0.16);
    expect(circularLayout(10, 10).r).toBe(10);
  });
});

describe('linearLayout', () => {
  it('centers the track vertically in the canvas', () => {
    expect(linearLayout(400, 300).y).toBe(150);
    expect(linearLayout(320, 320).y).toBe(160);
  });

  it('insets the track horizontally by at least 34px or 8% of width', () => {
    const narrow = linearLayout(200, 300);
    expect(narrow.left).toBe(34);
    const wide = linearLayout(1000, 300);
    expect(wide.left).toBe(80);
  });
});

describe('linear geometry', () => {
  it('spaces nodes across the bar and ends at the bar line', () => {
    expect(linearNodeX(0, 4, 10, 400)).toBe(10);
    expect(linearNodeX(4, 4, 10, 400)).toBe(410);
  });

  it('puts the stick on the node at its beat and between nodes mid-beat', () => {
    expect(linearStickX(2, 0, 4, 10, 400)).toBe(linearNodeX(2, 4, 10, 400));
    expect(linearStickX(1, 0.5, 4, 10, 400)).toBe(160);
  });
});

describe('glowIntensity and nodeRadius', () => {
  it('peaks at the beat and fades quadratically to zero', () => {
    expect(glowIntensity(0)).toBe(1);
    expect(glowIntensity(0.175, 0.35)).toBeCloseTo(0.25);
    expect(glowIntensity(GLOW_SECONDS)).toBe(0);
    expect(glowIntensity(-0.01)).toBe(0);
  });

  it('stays fixed at 17px when beats are spaced out, shrinking for a tiny span or crowding', () => {
    expect(nodeRadius(200, circularNodeSpacing(4, 200))).toBe(17);
    expect(nodeRadius(200, circularNodeSpacing(40, 200))).toBeLessThan(17);
    expect(nodeRadius(10, circularNodeSpacing(4, 10))).toBe(5);
    expect(nodeRadius(1000, circularNodeSpacing(4, 1000))).toBe(17);
    expect(nodeRadius(200, linearNodeSpacing(4, 400))).toBe(17);
    expect(nodeRadius(200, linearNodeSpacing(20, 400))).toBeLessThan(17);
  });
});

describe('beatLayoutGrid', () => {
  it('keeps 1-4 beats in a single row', () => {
    const cells = beatLayoutGrid(4);
    expect(cells).toEqual([
      { row: 0, col: 0, rowCount: 4, rows: 1 },
      { row: 0, col: 1, rowCount: 4, rows: 1 },
      { row: 0, col: 2, rowCount: 4, rows: 1 },
      { row: 0, col: 3, rowCount: 4, rows: 1 },
    ]);
  });

  it('wraps 5-8 beats into two rows of at most 4', () => {
    const cells = beatLayoutGrid(6);
    expect(cells.map((c) => c.row)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(cells.map((c) => c.col)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(cells[0]?.rows).toBe(2);
    expect(cells[0]?.rowCount).toBe(4);
    expect(cells[4]?.rowCount).toBe(2); // the shorter second row
  });

  it('preserves beat order and produces one cell per beat for 1..16', () => {
    for (let n = 1; n <= 16; n++) {
      const cells = beatLayoutGrid(n);
      expect(cells).toHaveLength(n);
      cells.forEach((cell, i) => {
        expect(cell.row * 4 + cell.col).toBe(i);
      });
    }
  });

  it('handles a single beat without dividing by zero', () => {
    const cells = beatLayoutGrid(1);
    expect(cells).toEqual([{ row: 0, col: 0, rowCount: 1, rows: 1 }]);
  });
});

describe('linearGridX / linearGridY', () => {
  it('reserves a full interval after the final beat for the bar line', () => {
    // Track from 0 to 400: four 100px intervals, nodes at 0..300 and bar line at 400.
    expect(linearGridX(0, 4, 0, 400)).toBe(0);
    expect(linearGridX(3, 4, 0, 400) + 100).toBe(400);
  });

  it('centers a short row together with its full interval to the bar line', () => {
    // 2 nodes plus their bar interval occupy 3 * 100px and are centered in the 400px track.
    expect(linearGridX(0, 2, 0, 400)).toBe(100);
    expect(linearGridX(1, 2, 0, 400)).toBe(200);
    expect(linearGridX(1, 2, 0, 400) + 100).toBe(300);
  });

  it('puts the grid stick on each sphere at phase 0 and on the next sphere at phase 1 (full row)', () => {
    for (let col = 0; col < 3; col++) {
      expect(linearGridStickX(col, 0, 4, 10, 400)).toBe(linearGridX(col, 4, 10, 400));
      expect(linearGridStickX(col, 1, 4, 10, 400)).toBe(linearGridX(col + 1, 4, 10, 400));
    }
    expect(linearGridStickX(1, 0.5, 4, 10, 400)).toBe(160);
  });

  it('keeps the grid stick on the spheres of a short, centered row', () => {
    // 3 nodes, cell 100, row centered with the final bar interval: spheres at 60, 160, 260.
    expect(linearGridStickX(0, 0, 3, 10, 400)).toBe(60);
    expect(linearGridStickX(0, 1, 3, 10, 400)).toBe(160);
    expect(linearGridStickX(1, 0.25, 3, 10, 400)).toBe(185);
    expect(linearGridStickX(2, 0, 3, 10, 400)).toBe(260);
  });

  it("ends the last beat's sweep one full cell past its sphere", () => {
    expect(linearGridStickX(3, 1, 4, 10, 400)).toBe(410);
    expect(linearGridStickX(1, 1, 2, 0, 400)).toBe(300);
  });

  it('stacks rows symmetrically around the center', () => {
    expect(linearGridY(0, 1, 160, 40)).toBe(160);
    expect(linearGridY(0, 2, 160, 40)).toBeCloseTo(140);
    expect(linearGridY(1, 2, 160, 40)).toBeCloseTo(180);
  });
});

describe('circularRingRadius', () => {
  it('returns maxR when there is only one ring', () => {
    expect(circularRingRadius(0, 1, 120, 60)).toBe(120);
  });

  it('spaces rings evenly between minR (innermost) and maxR (outermost)', () => {
    expect(circularRingRadius(0, 3, 120, 60)).toBe(120);
    expect(circularRingRadius(2, 3, 120, 60)).toBe(60);
    expect(circularRingRadius(1, 3, 120, 60)).toBe(90);
  });
});

describe('subDotRadius', () => {
  it('is 40% of the node radius when there is room', () => {
    expect(subDotRadius(17, 60)).toBeCloseTo(6.8);
  });

  it('shrinks to keep 3px between neighbouring dots', () => {
    expect(subDotRadius(17, 10)).toBeCloseTo(3.5);
  });

  it('is 0 (not drawn) below the minimum visible radius', () => {
    expect(subDotRadius(17, 5.9)).toBe(0);
  });
});
