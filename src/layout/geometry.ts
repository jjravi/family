/** A point in page points (x right, y down). */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned rectangle in page points; (x, y) is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A simple polygon as its vertices in order. */
export type Polygon = readonly Point[];

/** Font ascent and descent in em, used for the footprint of a line of text. */
export const ASCENT = 0.8;
export const DESCENT = 0.24;

/** `r` grown by `d` on every side. */
export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

/** True when the interiors overlap by more than `eps` on both axes. */
export function rectsOverlap(a: Rect, b: Rect, eps = 0): boolean {
  return a.x + a.w - eps > b.x && b.x + b.w - eps > a.x && a.y + a.h - eps > b.y && b.y + b.h - eps > a.y;
}

/** The smallest rectangle covering all of `rects`; null for none. */
function rectUnion(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The point at angle `a` (radians, clockwise from +x because y points down) and radius `r`. */
export function polar(cx: number, cy: number, r: number, a: number): Point {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Corners of a w x h rectangle centered at (cx, cy) and rotated by `angle` radians. */
export function rotatedRect(cx: number, cy: number, w: number, h: number, angle: number): Polygon {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([dx, dy]) => ({ x: cx + dx! * cos - dy! * sin, y: cy + dx! * sin + dy! * cos }));
}

/** The four corners of a rectangle, clockwise from the top-left. */
export function rectPolygon(r: Rect): Polygon {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** An annular sector as a polygon, its arcs split into chords no longer than ~`step` radians. */
export function sectorPolygon(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, step = 0.05): Polygon {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const points: Point[] = [];
  for (let i = 0; i <= n; i++) points.push(polar(cx, cy, r1, a0 + ((a1 - a0) * i) / n));
  if (r0 <= 0) points.push({ x: cx, y: cy });
  else for (let i = n; i >= 0; i--) points.push(polar(cx, cy, r0, a0 + ((a1 - a0) * i) / n));
  return points;
}

/** Axis-aligned bounds of a polygon. */
export function polygonBounds(poly: Polygon): Rect {
  return rectUnion(poly.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Even-odd point-in-polygon test (points on an edge may go either way). */
function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True when two simple polygons overlap: an edge crossing, or a vertex strictly inside the other. Touching does not count. */
export function polygonsOverlap(a: Polygon, b: Polygon, eps = 0.01): boolean {
  if (!rectsOverlap(polygonBounds(a), polygonBounds(b))) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  const strictlyInside = (p: Point, poly: Polygon) => pointInPolygon(p, poly) && !nearBoundary(p, poly, eps);
  return a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a));
}

/** True when every vertex of `inner` lies inside `outer` (or within `eps` of its bounds for rectangles). */
export function polygonInside(inner: Polygon, outer: Polygon, eps = 0.01): boolean {
  return inner.every((p) => pointInPolygon(p, outer) || nearBoundary(p, outer, eps));
}

function nearBoundary(p: Point, poly: Polygon, eps: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    const dx = a.x + t * (b.x - a.x) - p.x;
    const dy = a.y + t * (b.y - a.y) - p.y;
    if (dx * dx + dy * dy <= eps * eps) return true;
  }
  return false;
}
