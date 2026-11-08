import { polar } from '../layout/geometry';
import type { Shape } from '../layout/types';
import type { NodeShape, Theme } from '../themes/schema';
import { connectorWidth } from './edges';
import { el, path } from './svg';

/** Path data of an annular sector (a pie slice when r0 is 0). */
function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, r1, a0);
  const o1 = polar(cx, cy, r1, a1);
  if (r0 <= 0) return path('M', cx, cy, 'L', o0.x, o0.y, 'A', r1, r1, 0, large, 1, o1.x, o1.y, 'Z');
  const i1 = polar(cx, cy, r0, a1);
  const i0 = polar(cx, cy, r0, a0);
  return path('M', o0.x, o0.y, 'A', r1, r1, 0, large, 1, o1.x, o1.y, 'L', i1.x, i1.y, 'A', r0, r0, 0, large, 0, i0.x, i0.y, 'Z');
}

/** Fraction along the box where the leaf's control points sit; smaller = rounder shoulders, blunter tips. */
const LEAF_SHOULDER = 0.2;

/** A pointed-ellipse leaf filling the box, tips on the long axis. */
function leafPath(x: number, y: number, w: number, h: number): string {
  if (w >= h) {
    const my = y + h / 2;
    const lift = (2 * h) / 3;
    return path(
      'M', x, my,
      'C', x + LEAF_SHOULDER * w, my - lift, x + (1 - LEAF_SHOULDER) * w, my - lift, x + w, my,
      'C', x + (1 - LEAF_SHOULDER) * w, my + lift, x + LEAF_SHOULDER * w, my + lift, x, my, 'Z',
    );
  }
  const mx = x + w / 2;
  const lift = (2 * w) / 3;
  return path(
    'M', mx, y,
    'C', mx + lift, y + LEAF_SHOULDER * h, mx + lift, y + (1 - LEAF_SHOULDER) * h, mx, y + h,
    'C', mx - lift, y + (1 - LEAF_SHOULDER) * h, mx - lift, y + LEAF_SHOULDER * h, mx, y, 'Z',
  );
}

function rectOutline(shape: NodeShape, x: number, y: number, w: number, h: number, radius: number, paint: Record<string, string | number | null>): string {
  switch (shape) {
    case 'box':
      return el('rect', { x, y, width: w, height: h, rx: radius || null, ...paint });
    case 'pill':
      return el('rect', { x, y, width: w, height: h, rx: Math.min(w, h) / 2, ...paint });
    case 'leaf': {
      // A short stalk at the base tip, curling down (or left on upright leaves).
      const stalk =
        w >= h
          ? path('M', x + w * 0.02, y + h / 2, 'Q', x - w * 0.03, y + h * 0.52, x - w * 0.07, y + h * 0.66)
          : path('M', x + w / 2, y + h * 0.98, 'Q', x + w * 0.48, y + h * 1.03, x + w * 0.34, y + h * 1.07);
      const stroke = paint['stroke'] ? { stroke: paint['stroke'], 'stroke-width': paint['stroke-width'] } : {};
      return el('path', { d: stalk, fill: 'none', ...stroke, 'stroke-linecap': 'round' }) + el('path', { d: leafPath(x, y, w, h), ...paint });
    }
    case 'circle':
      return el('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...paint });
    case 'text-only':
      return '';
  }
}

/** Hairline spokes along a fan cell's two radial edges: the cell outline of text-only themes. */
function spokesSvg(theme: Theme, shape: Extract<Shape, { kind: 'sector' }>, scale: number, page: number): string {
  const ends = [shape.a0, shape.a1].map((a) => [polar(shape.cx, shape.cy, shape.r0, a), polar(shape.cx, shape.cy, shape.r1, a)] as const);
  const d = ends.map(([p, q]) => path('M', p.x, p.y, 'L', q.x, q.y)).join('');
  return el('path', { d, fill: 'none', stroke: theme.palette.edge, 'stroke-width': Math.max(0.35, connectorWidth(theme, scale, page) * 0.8) });
}

/** The shape behind a person's name. `page` is the page scale (1 at 18x24 in). */
export function nodeShapeSvg(theme: Theme, shape: Shape, size: number, focus: boolean, scale: number, page: number): string {
  const { palette, node } = theme;
  const stroke = node.stroke * scale;
  const paint = {
    fill: palette.node,
    stroke: stroke > 0 ? palette.stroke : null,
    'stroke-width': stroke > 0 ? stroke : null,
  };
  if (shape.kind === 'sector') {
    if (node.shape === 'text-only') return shape.r0 > 0 ? spokesSvg(theme, shape, scale, page) : '';
    const d = sectorPath(shape.cx, shape.cy, shape.r0, shape.r1, shape.a0, shape.a1);
    if (!shape.arcOnly) return el('path', { d, ...paint });
    const o0 = polar(shape.cx, shape.cy, shape.r1, shape.a0);
    const o1 = polar(shape.cx, shape.cy, shape.r1, shape.a1);
    const arc = path('M', o0.x, o0.y, 'A', shape.r1, shape.r1, 0, shape.a1 - shape.a0 > Math.PI ? 1 : 0, 1, o1.x, o1.y);
    return el('path', { d, fill: paint.fill }) + (paint.stroke ? el('path', { d: arc, ...paint, fill: 'none' }) : '');
  }
  const { x, y, w, h } = shape;
  const radius = node.radius * size;
  let out = rectOutline(node.shape, x, y, w, h, radius, paint);
  if (focus && node.focusRing && node.shape !== 'text-only') {
    const d = Math.max(2, 0.16 * size);
    out += rectOutline(node.shape, x + d, y + d, w - 2 * d, h - 2 * d, Math.max(0, radius - d), {
      fill: 'none',
      stroke: palette.stroke,
      'stroke-width': stroke * 0.6,
    });
  }
  return out;
}

/** An unknown ancestor: the shape faded or dotted, or a short blank line for text-only themes. */
export function placeholderSvg(theme: Theme, shape: Shape, size: number, scale: number): string {
  const { palette, node } = theme;
  const dotted = theme.placeholder === 'dotted';
  const width = Math.max(0.6, (dotted ? 1.3 : node.stroke || 0.8) * scale);
  const line = {
    fill: 'none',
    stroke: palette.placeholder,
    'stroke-width': width,
    'stroke-dasharray': dotted ? `0.01 ${width * 2.6}` : null,
    'stroke-linecap': dotted ? 'round' : null,
  };
  if (shape.kind === 'sector') {
    const d = sectorPath(shape.cx, shape.cy, shape.r0, shape.r1, shape.a0, shape.a1);
    if (node.shape === 'text-only' || dotted) return el('path', { d, ...line });
    return el('path', { d, fill: palette.node, 'fill-opacity': 0.55, stroke: palette.placeholder, 'stroke-width': width });
  }
  const { x, y, w, h } = shape;
  if (node.shape === 'text-only') {
    const vertical = h > w;
    const len = (vertical ? h : w) * 0.5;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const d = vertical ? path('M', cx, cy - len / 2, 'V', cy + len / 2) : path('M', cx - len / 2, cy, 'H', cx + len / 2);
    return el('path', { d, ...line, 'stroke-dasharray': `0.01 ${width * 2.6}`, 'stroke-linecap': 'round' });
  }
  if (dotted) return rectOutline(node.shape, x, y, w, h, node.radius * size, line);
  return rectOutline(node.shape, x, y, w, h, node.radius * size, {
    fill: palette.node,
    'fill-opacity': 0.5,
    stroke: palette.placeholder,
    'stroke-width': width,
  });
}
