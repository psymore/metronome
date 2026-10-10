// The easter-egg screen's drawing: eight lines grow out of the boot knob, each starting 8px off
// its edge in one of the compass directions, bending twice in 45/90 degree steps and ending in a
// glowing node. Everything is CSS-animated (see index.html); this module only picks the paths,
// and re-picks one whenever its branch finishes a cycle. It is loaded on the first tap of the
// knob, so none of it costs anything at boot.

const SVG_NS = 'http://www.w3.org/2000/svg';
const BRANCH_COUNT = 8;
const START_GAP = 8;
const NODE_RADIUS = 7;
const CLEARANCE = NODE_RADIUS * 2.4;
const EDGE_MARGIN = 14;
const MAX_TRIES = 40;
const TURNS = [-2, -1, 1, 2];

export interface Pt {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PlanContext {
  startRadius: number;
  segmentLength: number;
  bounds: Bounds;
  /** Polylines of the other branches, which the new one must keep clear of. */
  others: Pt[][];
}

/** Heading in 45 degree steps: 0 = north, 2 = east, 4 = south, 6 = west. */
const dir = (h: number): Pt => ({
  x: Math.sin((h * Math.PI) / 4),
  y: -Math.cos((h * Math.PI) / 4),
});

/** Signed difference between two headings, in -3..4 steps. */
const headingDiff = (a: number, b: number): number => {
  const d = (((a - b) % 8) + 8) % 8;
  return d > 4 ? d - 8 : d;
};

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(
    pointSegDist(a, c, d),
    pointSegDist(b, c, d),
    pointSegDist(c, a, b),
    pointSegDist(d, a, b),
  );
}

function polylinesClear(a: Pt[], b: Pt[], gap: number): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segDist(a[i], a[i + 1], b[j], b[j + 1]) < gap) return false;
    }
  }
  return true;
}

function inside(p: Pt, b: Bounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

/**
 * Plans one branch leaving the knob at compass heading `base` (0..7): points p0..p3 relative to
 * the knob's centre. The first segment runs straight out; each later one turns 45 or 90 degrees
 * either way, never back towards the knob. Candidates that leave the screen or touch another
 * branch are rejected; if none fits, a straight (shortened) spoke is used.
 */
export function planBranch(base: number, ctx: PlanContext, rand: () => number = Math.random): Pt[] {
  const start = dir(base);
  const p0 = { x: start.x * ctx.startRadius, y: start.y * ctx.startRadius };

  const build = (headings: number[], lengths: number[]): Pt[] => {
    const pts = [p0];
    for (let i = 0; i < headings.length; i++) {
      const d = dir(headings[i]);
      const last = pts[pts.length - 1];
      pts.push({ x: last.x + d.x * lengths[i], y: last.y + d.y * lengths[i] });
    }
    return pts;
  };

  const turn = (from: number): number => {
    const options = TURNS.map((t) => from + t).filter((h) => Math.abs(headingDiff(h, base)) <= 2);
    return options[Math.floor(rand() * options.length)];
  };

  for (let i = 0; i < MAX_TRIES; i++) {
    const h2 = turn(base);
    const h3 = turn(h2);
    const lengths = [0, 0, 0].map(() => ctx.segmentLength * (0.7 + 0.6 * rand()));
    const pts = build([base, h2, h3], lengths);
    const fits =
      pts.every((p) => inside(p, ctx.bounds) && Math.hypot(p.x, p.y) >= ctx.startRadius - 1) &&
      ctx.others.every((o) => polylinesClear(pts, o, CLEARANCE));
    if (fits) return pts;
  }
  // Straight spoke, shortened until it is on screen.
  let scale = 1;
  let pts = build(
    [base, base, base],
    [0, 0, 0].map(() => ctx.segmentLength * scale),
  );
  while (!inside(pts[3], ctx.bounds) && scale > 0.2) {
    scale -= 0.15;
    pts = build(
      [base, base, base],
      [0, 0, 0].map(() => ctx.segmentLength * scale),
    );
  }
  return pts;
}

const pathData = (pts: Pt[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');

interface Branch {
  g: SVGGElement;
  path: SVGPathElement;
  node: SVGCircleElement;
  pts: Pt[];
}

/** Builds the eight branches inside `svg` (whose origin it re-centres on the knob). */
export function createBootBranches(svg: SVGSVGElement, knob: HTMLElement): { reset(): void } {
  const staggers = Array.from({ length: BRANCH_COUNT }, (_, i) => i);
  for (let i = staggers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [staggers[i], staggers[j]] = [staggers[j], staggers[i]];
  }

  const branches: Branch[] = staggers.map((stagger) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'boot-branch');
    g.style.setProperty('--i', String(stagger));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'boot-line');
    path.setAttribute('pathLength', '1');
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('class', 'boot-node');
    node.setAttribute('r', String(NODE_RADIUS * 2.2));
    g.append(path, node);
    svg.append(g);
    return { g, path, node, pts: [] };
  });

  let context: Omit<PlanContext, 'others'> | null = null;

  function measure(): void {
    const box = svg.getBoundingClientRect();
    const knobBox = knob.getBoundingClientRect();
    const w = box.width;
    svg.setAttribute('viewBox', `${-w / 2} ${-w / 2} ${w} ${w}`);
    const cx = box.left + w / 2;
    const cy = box.top + w / 2;
    const bounds: Bounds = {
      minX: EDGE_MARGIN - cx,
      maxX: window.innerWidth - EDGE_MARGIN - cx,
      minY: EDGE_MARGIN - cy,
      maxY: window.innerHeight - EDGE_MARGIN - cy,
    };
    const startRadius = knobBox.width * 0.47 + START_GAP;
    const room = Math.min(bounds.maxX, -bounds.minX) - startRadius;
    context = {
      startRadius,
      segmentLength: Math.max(16, Math.min(46, room / 2.2)),
      bounds,
    };
  }

  function plan(index: number): void {
    if (!context) return;
    const branch = branches[index];
    const others = branches
      .filter((_, i) => i !== index && branches[i].pts.length)
      .map((b) => b.pts);
    branch.pts = planBranch(index, { ...context, others });
    branch.path.setAttribute('d', pathData(branch.pts));
    const end = branch.pts[3];
    branch.node.setAttribute('cx', end.x.toFixed(1));
    branch.node.setAttribute('cy', end.y.toFixed(1));
  }

  // A branch is invisible at the moment its cycle wraps, so it can be re-planned right then.
  svg.addEventListener('animationiteration', (e) => {
    if (e.animationName !== 'bootBranchFade') return;
    const index = branches.findIndex((b) => b.g === e.target);
    if (index < 0) return;
    measure();
    plan(index);
  });

  return {
    reset() {
      measure();
      for (const b of branches) b.pts = [];
      for (let i = 0; i < branches.length; i++) plan(i);
    },
  };
}
