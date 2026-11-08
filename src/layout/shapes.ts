import {
  ASCENT,
  DESCENT,
  polygonBounds,
  rectPolygon,
  rotatedRect,
  sectorPolygon,
  type Polygon,
  type Rect,
} from './geometry';
import type { Shape, TextFrame, TextRun } from './types';

/** Axis-aligned bounds of a node shape. */
export function shapeBounds(shape: Shape): Rect {
  if (shape.kind === 'rect') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  return polygonBounds(shapePolygon(shape));
}

/** A node shape as a polygon (sectors approximated by chords). */
export function shapePolygon(shape: Shape): Polygon {
  if (shape.kind === 'rect') return rectPolygon(shape);
  return sectorPolygon(shape.cx, shape.cy, shape.r0, shape.r1, shape.a0, shape.a1);
}

/** The region a text frame allows, as a polygon. */
export function framePolygon(frame: TextFrame): Polygon {
  if (frame.kind === 'box') {
    const angle = (frame.rotate * Math.PI) / 180;
    return rotatedRect(frame.cx, frame.cy, frame.w, frame.h, angle);
  }
  return sectorPolygon(frame.cx, frame.cy, frame.r0, frame.r1, frame.a0, frame.a1, 0.02);
}

/**
 * The footprint of a run of text: its advance width by ascent + descent around
 * the baseline, as a rotated rectangle for straight lines and an annular sector
 * for arc text (glyphs rise away from the center unless the arc is flipped).
 */
export function runPolygon(run: TextRun): Polygon {
  const size = run.font.size;
  const p = run.placement;
  if (p.kind === 'line') {
    const angle = (p.rotate * Math.PI) / 180;
    const shift = ((DESCENT - ASCENT) / 2) * size;
    const cx = p.x - shift * Math.sin(angle);
    const cy = p.y + shift * Math.cos(angle);
    return rotatedRect(cx, cy, run.width, (ASCENT + DESCENT) * size, angle);
  }
  const half = run.width / 2 / p.r;
  const inner = p.flipped ? p.r - ASCENT * size : p.r - DESCENT * size;
  const outer = p.flipped ? p.r + DESCENT * size : p.r + ASCENT * size;
  return sectorPolygon(p.cx, p.cy, inner, outer, p.a - half, p.a + half, 0.02);
}
