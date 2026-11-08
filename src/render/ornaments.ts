import type { Point, Rect } from '../layout/geometry';
import type { JoinLink, TitleBlock } from '../layout/types';
import type { Theme } from '../themes/schema';
import { el, path } from './svg';

/**
 * Hand-drawn ornaments. Coordinates are in page points; `k` scales strokes and
 * motifs with the page (1 at 18x24 in).
 */

function rotate(p: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** A small pointed leaf from `base`, pointing at `angle` (radians), `length` long and `width` wide. */
function leaf(base: Point, angle: number, length: number, width: number): (string | number)[] {
  const at = (u: number, v: number) => {
    const r = rotate({ x: u, y: v }, angle);
    return [base.x + r.x, base.y + r.y];
  };
  const [tx, ty] = at(length, 0);
  const [ax, ay] = at(length * 0.45, -width * 0.62);
  const [bx, by] = at(length * 0.45, width * 0.62);
  return ['M', base.x, base.y, 'Q', ax!, ay!, tx!, ty!, 'Q', bx!, by!, base.x, base.y, 'Z'];
}

function diamond(cx: number, cy: number, r: number): string {
  return path('M', cx, cy - r, 'L', cx + r, cy, 'L', cx, cy + r, 'L', cx - r, cy, 'Z');
}

/**
 * Leaf positions along a corner sprig: fraction of the stem, side (+1 inward,
 * -1 toward the border), and size. Curated by eye; the same for every poster.
 */
const SPRIG_LEAVES: readonly [number, 1 | -1, number][] = [
  [0.16, 1, 1],
  [0.27, -1, 0.92],
  [0.39, 1, 0.86],
  [0.5, -1, 0.78],
  [0.61, 1, 0.68],
  [0.72, -1, 0.58],
  [0.83, 1, 0.46],
];

/** A leafy sprig growing from `origin` along unit direction `dir`; `inward` is the unit normal toward the page center. */
function sprig(origin: Point, dir: Point, inward: Point, length: number, k: number): { stem: string; leaves: string } {
  const at = (t: number, bow: number): Point => ({
    x: origin.x + dir.x * length * t + inward.x * bow,
    y: origin.y + dir.y * length * t + inward.y * bow,
  });
  const bowAt = (t: number) => Math.sin(t * Math.PI) * 5 * k;
  const p1 = at(0.35, bowAt(0.35) * 1.6);
  const p2 = at(0.7, bowAt(0.7) * 1.6);
  const end = at(1, 0);
  const stem = path('M', origin.x, origin.y, 'C', p1.x, p1.y, p2.x, p2.y, end.x, end.y);
  const base = Math.atan2(dir.y, dir.x);
  const normal = Math.atan2(inward.y, inward.x);
  const leaves: (string | number)[] = [];
  for (const [t, side, size] of SPRIG_LEAVES) {
    const p = at(t, bowAt(t));
    const toward = side === 1 ? normal : normal + Math.PI;
    // Lean each leaf forward along the stem, 40 degrees off it.
    const delta = Math.atan2(Math.sin(toward - base), Math.cos(toward - base));
    const angle = base + Math.sign(delta) * (40 * Math.PI) / 180;
    leaves.push(...leaf(p, angle, 15 * k * size, 6.5 * k * size));
  }
  leaves.push(...leaf(end, base, 9 * k, 4 * k));
  return { stem, leaves: path(...leaves) };
}

/** Border and corner ornaments inside the safe area. */
export function frameSvg(theme: Theme, safe: Rect, band: number, k: number): string {
  const { ornaments, palette } = theme;
  let out = '';
  if (ornaments.border === 'double-rule') {
    const outer = 1.6 * k;
    out += el('rect', {
      x: safe.x + outer / 2,
      y: safe.y + outer / 2,
      width: safe.w - outer,
      height: safe.h - outer,
      fill: 'none',
      stroke: palette.stroke,
      'stroke-width': outer,
    });
    const g = 7 * k;
    const n = Math.min(band * 0.55, 20 * k);
    const x0 = safe.x + g;
    const y0 = safe.y + g;
    const x1 = safe.x + safe.w - g;
    const y1 = safe.y + safe.h - g;
    out += el('path', {
      d: path(
        'M', x0 + n, y0, 'H', x1 - n, 'V', y0 + n, 'H', x1, 'V', y1 - n, 'H', x1 - n, 'V', y1,
        'H', x0 + n, 'V', y1 - n, 'H', x0, 'V', y0 + n, 'H', x0 + n, 'Z',
      ),
      fill: 'none',
      stroke: palette.stroke,
      'stroke-width': 0.6 * k,
    });
    if (ornaments.corners === 'classic') {
      const r = Math.min(n * 0.28, 4.5 * k);
      const d = [
        diamond(x0 + n / 2, y0 + n / 2, r),
        diamond(x1 - n / 2, y0 + n / 2, r),
        diamond(x1 - n / 2, y1 - n / 2, r),
        diamond(x0 + n / 2, y1 - n / 2, r),
      ].join('');
      out += el('path', { d, fill: palette.accent });
    }
  } else if (ornaments.border === 'hairline') {
    const w = 0.7 * k;
    out += el('rect', {
      x: safe.x + w / 2,
      y: safe.y + w / 2,
      width: safe.w - w,
      height: safe.h - w,
      fill: 'none',
      stroke: palette.accent,
      'stroke-width': w,
      'stroke-opacity': 0.7,
    });
  }
  if (ornaments.corners === 'botanical') {
    const inset = band * 0.42;
    const length = Math.min(150 * k, safe.w * 0.22, safe.h * 0.22);
    const corners: [Point, Point, Point][] = [
      [{ x: safe.x + inset, y: safe.y + inset }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      [{ x: safe.x + safe.w - inset, y: safe.y + inset }, { x: -1, y: 0 }, { x: 0, y: 1 }],
      [{ x: safe.x + safe.w - inset, y: safe.y + safe.h - inset }, { x: -1, y: 0 }, { x: 0, y: -1 }],
      [{ x: safe.x + inset, y: safe.y + safe.h - inset }, { x: 1, y: 0 }, { x: 0, y: -1 }],
    ];
    let stems = '';
    let leaves = '';
    let berries = '';
    for (const [origin, along, down] of corners) {
      const a = sprig(origin, along, down, length, k);
      const b = sprig(origin, down, along, length, k);
      stems += a.stem + b.stem;
      leaves += a.leaves + b.leaves;
      for (const [u, v, r] of [
        [0, 0, 2.6],
        [5.5, 2.5, 1.8],
        [2.5, 5.5, 1.8],
      ] as const) {
        const x = origin.x + (along.x * u + down.x * v) * k;
        const y = origin.y + (along.y * u + down.y * v) * k;
        berries += path('M', x - r * k, y, 'A', r * k, r * k, 0, 1, 0, x + r * k, y, 'A', r * k, r * k, 0, 1, 0, x - r * k, y, 'Z');
      }
    }
    out += el('path', { d: stems, fill: 'none', stroke: palette.edge, 'stroke-width': 0.9 * k, 'stroke-linecap': 'round' });
    out += el('path', { d: leaves, fill: palette.accent, 'fill-opacity': 0.85 });
    out += el('path', { d: berries, fill: palette.edge, 'fill-opacity': 0.9 });
  }
  return out;
}

/** A centered rule under a heading, at baseline `y`, about `half` wide on each side. */
function headingRule(theme: Theme, cx: number, y: number, half: number, k: number): string {
  const { palette, ornaments } = theme;
  const stroke = { fill: 'none', stroke: palette.accent, 'stroke-width': 0.8 * k, 'stroke-linecap': 'round' };
  if (ornaments.rule === 'diamond') {
    const gap = 11 * k;
    return (
      el('path', { d: path('M', cx - half, y, 'H', cx - gap, 'M', cx + gap, y, 'H', cx + half), ...stroke }) +
      el('path', { d: diamond(cx, y, 4.2 * k) + diamond(cx - half - 4 * k, y, 1.8 * k) + diamond(cx + half + 4 * k, y, 1.8 * k), fill: palette.accent })
    );
  }
  if (ornaments.rule === 'sprig') {
    const gap = 22 * k;
    const leaves = [
      ...leaf({ x: cx - 2 * k, y }, Math.PI + 0.42, 15 * k, 6 * k),
      ...leaf({ x: cx - 2 * k, y }, Math.PI - 0.42, 15 * k, 6 * k),
      ...leaf({ x: cx + 2 * k, y }, 0.42, 15 * k, 6 * k),
      ...leaf({ x: cx + 2 * k, y }, -0.42, 15 * k, 6 * k),
    ];
    return (
      el('path', { d: path('M', cx - half, y, 'H', cx - gap, 'M', cx + gap, y, 'H', cx + half), ...stroke, stroke: palette.edge }) +
      el('path', { d: path(...leaves), fill: palette.accent })
    );
  }
  const short = Math.min(half, 36 * k);
  return el('path', { d: path('M', cx - short, y, 'H', cx + short), ...stroke, 'stroke-width': 1.4 * k });
}

/** Laurel branch from `start` sweeping outward (dir -1 left, +1 right) and up to `end`. */
function laurel(start: Point, end: Point, dir: 1 | -1, k: number): { stem: string; leaves: string } {
  const c1 = { x: start.x + (end.x - start.x) * 0.45, y: start.y + 2 * k };
  const c2 = { x: end.x, y: start.y - (start.y - end.y) * 0.25 };
  const stem = path('M', start.x, start.y, 'C', c1.x, c1.y, c2.x, c2.y, end.x, end.y);
  const leaves: (string | number)[] = [];
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const u = 1 - t;
    const p = {
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    };
    const tx = 3 * u * u * (c1.x - start.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (end.x - c2.x);
    const ty = 3 * u * u * (c1.y - start.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (end.y - c2.y);
    const along = Math.atan2(ty, tx);
    const size = (0.7 + 0.5 * Math.sin(t * Math.PI)) * k;
    leaves.push(...leaf(p, along - 0.55 * dir, 14 * size, 5.5 * size));
    leaves.push(...leaf(p, along + 0.55 * dir, 14 * size, 5.5 * size));
  }
  leaves.push(...leaf(end, Math.atan2(end.y - c2.y, end.x - c2.x), 12 * k, 5 * k));
  return { stem, leaves: path(...leaves) };
}

/** The title's ornament: a rule under a heading, or the theme's cartouche frame. */
export function titleOrnamentSvg(theme: Theme, block: TitleBlock, titleSize: number, textBottom: number, k: number): string {
  const { palette, ornaments } = theme;
  const f = block.frame;
  const cx = f.x + f.w / 2;
  if (block.kind === 'heading') {
    const y = Math.min(f.y + f.h - 2 * k, textBottom + titleSize * 0.45);
    return headingRule(theme, cx, y, Math.min(f.w * 0.2, 240 * k), k);
  }
  if (ornaments.cartouche === 'classic') {
    const c = Math.min(f.h * 0.22, 18 * k);
    const frame = (x: number, y: number, w: number, h: number, r: number) =>
      path(
        'M', x + r, y, 'H', x + w - r, 'A', r, r, 0, 0, 0, x + w, y + r, 'V', y + h - r,
        'A', r, r, 0, 0, 0, x + w - r, y + h, 'H', x + r, 'A', r, r, 0, 0, 0, x, y + h - r,
        'V', y + r, 'A', r, r, 0, 0, 0, x + r, y, 'Z',
      );
    const d = 5 * k;
    return (
      el('path', { d: frame(f.x, f.y, f.w, f.h, c), fill: palette.node, stroke: palette.stroke, 'stroke-width': 1.3 * k }) +
      el('path', { d: frame(f.x + d, f.y + d, f.w - 2 * d, f.h - 2 * d, c), fill: 'none', stroke: palette.stroke, 'stroke-width': 0.5 * k }) +
      el('path', { d: diamond(f.x, f.y + f.h / 2, 4 * k) + diamond(f.x + f.w, f.y + f.h / 2, 4 * k), fill: palette.accent })
    );
  }
  if (ornaments.cartouche === 'botanical') {
    const bottom = f.y + f.h - 3 * k;
    const left = laurel({ x: cx - 6 * k, y: bottom }, { x: f.x + f.w * 0.06, y: f.y + f.h * 0.42 }, -1, k);
    const right = laurel({ x: cx + 6 * k, y: bottom }, { x: f.x + f.w * 0.94, y: f.y + f.h * 0.42 }, 1, k);
    return (
      el('path', { d: left.stem + right.stem, fill: 'none', stroke: palette.edge, 'stroke-width': 0.9 * k, 'stroke-linecap': 'round' }) +
      el('path', { d: left.leaves + right.leaves, fill: palette.accent, 'fill-opacity': 0.85 })
    );
  }
  const stroke = { fill: 'none', stroke: palette.ink, 'stroke-width': 0.75 * k };
  const inset = f.w * 0.08;
  return (
    el('path', { d: path('M', f.x + inset, f.y, 'H', f.x + f.w - inset, 'M', f.x + inset, f.y + f.h, 'H', f.x + f.w - inset), ...stroke }) +
    el('rect', { x: cx - 2.5 * k, y: f.y - 2.5 * k, width: 5 * k, height: 5 * k, fill: palette.accent })
  );
}

/** The mark between two partners drawn side by side (the ampersand is a text mark, drawn elsewhere). */
export function joinSvg(theme: Theme, link: JoinLink): string {
  const { palette, ornaments } = theme;
  const cx = (link.a.x + link.b.x) / 2;
  const cy = (link.a.y + link.b.y) / 2;
  const gap = link.b.x - link.a.x;
  if (ornaments.join === 'ring') {
    const r = Math.min(gap * 0.18, link.size * 0.26);
    const off = r * 0.55;
    const ring = (x: number) => path('M', x - r, cy, 'A', r, r, 0, 1, 0, x + r, cy, 'A', r, r, 0, 1, 0, x - r, cy, 'Z');
    return (
      el('path', { d: path('M', link.a.x, cy, 'H', cx - off - r, 'M', cx + off + r, cy, 'H', link.b.x), fill: 'none', stroke: palette.edge, 'stroke-width': link.size * 0.05 }) +
      el('path', { d: ring(cx - off) + ring(cx + off), fill: 'none', stroke: palette.accent, 'stroke-width': link.size * 0.07 })
    );
  }
  if (ornaments.join === 'bar') {
    const half = Math.min(gap * 0.3, link.size * 0.45);
    return el('path', { d: path('M', cx - half, cy, 'H', cx + half), fill: 'none', stroke: palette.accent, 'stroke-width': Math.max(0.6, link.size * 0.06) });
  }
  return '';
}
