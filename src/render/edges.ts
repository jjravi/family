import { polar, type Point } from '../layout/geometry';
import type { ForkLink, PolarLink } from '../layout/types';
import type { Theme } from '../themes/schema';
import { seeded } from './random';
import { el, path } from './svg';

/** Organic branch width for a subtree of `weight` persons: proportional to 1 + log2(size). */
function branchWidth(base: number, weight: number): number {
  return base * (1 + Math.log2(Math.max(1, weight)));
}

function isVertical(axis: ForkLink['axis']): boolean {
  return axis === 'up' || axis === 'down';
}

/**
 * An orthogonal fork: a stem from `source` to the crossbar at `mid`, the
 * crossbar, and a riser to each target. The two ends of the crossbar turn with
 * rounded corners (radius up to `r`); risers meeting it mid-span are plain T-joins.
 */
function forkPath(source: Point, targets: readonly Point[], mid: number, axis: ForkLink['axis'], r: number): string {
  const vertical = isVertical(axis);
  // Work in (u, v): u runs along the crossbar, v along the axis; map back at the end.
  const toUV = (p: Point) => (vertical ? { u: p.x, v: p.y } : { u: p.y, v: p.x });
  const fromUV = (u: number, v: number): [number, number] => (vertical ? [u, v] : [v, u]);
  const arms = [source, ...targets].map(toUV);
  const sorted = [...arms].sort((a, b) => a.u - b.u);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const parts: (string | number)[] = [];
  const move = (u: number, v: number) => parts.push('M', ...fromUV(u, v));
  const line = (u: number, v: number) => parts.push('L', ...fromUV(u, v));
  const curve = (cu: number, cv: number, u: number, v: number) => parts.push('Q', ...fromUV(cu, cv), ...fromUV(u, v));

  const span = last.u - first.u;
  if (span < 0.05) {
    for (const arm of arms) {
      move(arm.u, arm.v);
      line(arm.u, mid);
    }
    return path(...parts);
  }
  const rr = (arm: { v: number }) => Math.min(r, span / 2, Math.abs(arm.v - mid));
  const r0 = rr(first);
  const r1 = rr(last);
  const s0 = Math.sign(first.v - mid);
  const s1 = Math.sign(last.v - mid);
  move(first.u, first.v);
  line(first.u, mid + s0 * r0);
  curve(first.u, mid, first.u + r0, mid);
  line(last.u - r1, mid);
  curve(last.u, mid, last.u, mid + s1 * r1);
  line(last.u, last.v);
  for (const arm of sorted.slice(1, -1)) {
    move(arm.u, mid);
    line(arm.u, arm.v);
  }
  return path(...parts);
}

function curveControls(s: Point, t: Point, mid: number, axis: ForkLink['axis']): [Point, Point] {
  return isVertical(axis) ? [{ x: s.x, y: mid }, { x: t.x, y: mid }] : [{ x: mid, y: s.y }, { x: mid, y: t.y }];
}

function rotateAround(p: Point, o: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: o.x + (p.x - o.x) * cos - (p.y - o.y) * sin, y: o.y + (p.x - o.x) * sin + (p.y - o.y) * cos };
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { point: Point; tangent: Point } {
  const u = 1 - t;
  const point = {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
  const tangent = {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
  return { point, tangent };
}

/** A filled, tapered Bézier branch from width w0 at p0 to w1 at p3. */
function taperedPath(p0: Point, p1: Point, p2: Point, p3: Point, w0: number, w1: number, steps = 18): string {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { point, tangent } = bezier(p0, p1, p2, p3, t);
    const len = Math.hypot(tangent.x, tangent.y) || 1;
    const nx = -tangent.y / len;
    const ny = tangent.x / len;
    const half = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: point.x + nx * half, y: point.y + ny * half });
    right.push({ x: point.x - nx * half, y: point.y - ny * half });
  }
  const parts: (string | number)[] = ['M', left[0]!.x, left[0]!.y];
  for (const p of left.slice(1)) parts.push('L', p.x, p.y);
  for (const p of right.reverse()) parts.push('L', p.x, p.y);
  parts.push('Z');
  return path(...parts);
}

interface EdgePaint {
  stroke: string;
  width: number;
  dotted: boolean;
  opacity: number;
}

function strokeAttrs(paint: EdgePaint): Record<string, string | number | null> {
  return {
    fill: 'none',
    stroke: paint.stroke,
    'stroke-width': paint.width,
    'stroke-linecap': paint.dotted ? 'round' : null,
    'stroke-dasharray': paint.dotted ? `0.01 ${paint.width * 3}` : null,
    'stroke-opacity': paint.opacity < 1 ? paint.opacity : null,
  };
}

/** Context shared by every connector on a poster. */
export interface EdgeContext {
  theme: Theme;
  scale: number;
  /** Page scale: 1 at 18x24 in. */
  page: number;
  seed: string;
}

/** Width of a stroked connector: the theme width at the layout scale, but never under the theme's minimum for the page. */
export function connectorWidth(theme: Theme, scale: number, page: number): number {
  return Math.max(0.35, theme.edge.minWidth * page, theme.edge.width * scale);
}

function paints(ctx: EdgeContext): { solid: EdgePaint; placeholder: EdgePaint } {
  const { theme } = ctx;
  const width = connectorWidth(theme, ctx.scale, ctx.page);
  return {
    solid: { stroke: theme.palette.edge, width, dotted: false, opacity: 1 },
    placeholder:
      theme.placeholder === 'dotted'
        ? { stroke: theme.palette.placeholder, width: width * 1.2, dotted: true, opacity: 1 }
        : { stroke: theme.palette.placeholder, width, dotted: false, opacity: 0.8 },
  };
}

/** One fork connector in the theme's edge style. `key` seeds the organic jitter. */
export function forkSvg(link: ForkLink, ctx: EdgeContext, key: string): string {
  const { theme, scale } = ctx;
  const style = theme.edge.style;
  const { solid, placeholder } = paints(ctx);
  if (style === 'orthogonal') {
    const r = theme.edge.corner * scale;
    const real = link.targets.filter((t) => !t.placeholder).map((t) => t.point);
    const faded = link.targets.filter((t) => t.placeholder).map((t) => t.point);
    let out = '';
    if (real.length > 0) out += el('path', { d: forkPath(link.source, real, link.mid, link.axis, r), ...strokeAttrs(solid) });
    const join = real.length > 0 ? (isVertical(link.axis) ? { x: link.source.x, y: link.mid } : { x: link.mid, y: link.source.y }) : link.source;
    for (const t of faded) out += el('path', { d: forkPath(join, [t], link.mid, link.axis, r), ...strokeAttrs(placeholder) });
    return out;
  }
  let out = '';
  link.targets.forEach((target, i) => {
    const t = target.point;
    const s = link.source;
    const paint = target.placeholder ? placeholder : solid;
    if (style === 'organic' && !target.placeholder) {
      const random = seeded(ctx.seed, `${key}.${i}`);
      const jitter = () => ((random() * 2 - 1) * 2 * Math.PI) / 180;
      const [c1, c2] = curveControls(s, t, link.mid, link.axis);
      const base = theme.edge.width * scale;
      const w1 = branchWidth(base, target.weight);
      out += el('path', {
        d: taperedPath(s, rotateAround(c1, s, jitter()), rotateAround(c2, t, jitter()), t, w1, w1 * 0.5),
        fill: theme.palette.edge,
      });
      return;
    }
    let d: string;
    if (style === 'radial') d = path('M', s.x, s.y, 'L', t.x, t.y);
    else {
      const [c1, c2] = curveControls(s, t, link.mid, link.axis);
      d = path('M', s.x, s.y, 'C', c1.x, c1.y, c2.x, c2.y, t.x, t.y);
    }
    out += el('path', { d, ...strokeAttrs(paint) });
  });
  return out;
}

/** A fan connector: out from the child, along an arc between the rings, out to each parent. */
export function polarSvg(link: PolarLink, ctx: EdgeContext): string {
  const { solid, placeholder } = paints(ctx);
  const { cx, cy, mid } = link;
  const angles = [link.source.a, ...link.targets.map((t) => t.a)];
  const a0 = Math.min(...angles);
  const a1 = Math.max(...angles);
  const allPlaceholder = link.targets.every((t) => t.placeholder);
  const s0 = polar(cx, cy, link.source.r, link.source.a);
  const s1 = polar(cx, cy, mid, link.source.a);
  const m0 = polar(cx, cy, mid, a0);
  const m1 = polar(cx, cy, mid, a1);
  let out = el('path', {
    d: path('M', s0.x, s0.y, 'L', s1.x, s1.y, 'M', m0.x, m0.y, 'A', mid, mid, 0, a1 - a0 > Math.PI ? 1 : 0, 1, m1.x, m1.y),
    ...strokeAttrs(allPlaceholder ? placeholder : solid),
  });
  for (const target of link.targets) {
    const p0 = polar(cx, cy, mid, target.a);
    const p1 = polar(cx, cy, target.r, target.a);
    out += el('path', { d: path('M', p0.x, p0.y, 'L', p1.x, p1.y), ...strokeAttrs(target.placeholder ? placeholder : solid) });
  }
  return out;
}
