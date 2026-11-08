import { describe, expect, it } from 'vitest';
import { clampView, fitView, zoomAt, type Point, type View } from '../../src/ui/zoom';

const portrait = { width: 1296, height: 1728 };

function pagePoint(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.scale, y: (screen.y - view.y) / view.scale };
}

const even = (pad: number) => ({ top: pad, right: pad, bottom: pad, left: pad });

describe('fitView', () => {
  it('fits a portrait page by height in a wide viewport, centered', () => {
    const view = fitView({ width: 1000, height: 800 }, portrait, even(32));
    expect(view.scale).toBeCloseTo(736 / 1728);
    expect(view.y).toBeCloseTo(32);
    expect(view.x).toBeCloseTo((1000 - 1296 * view.scale) / 2);
  });

  it('fits to width in a narrow viewport', () => {
    const view = fitView({ width: 390, height: 700 }, portrait, even(14));
    expect(view.scale).toBeCloseTo(362 / 1296);
    expect(view.x).toBeCloseTo(14);
  });

  it('keeps clear of a larger bottom inset (the zoom bar)', () => {
    const view = fitView({ width: 1000, height: 800 }, portrait, { top: 32, right: 32, bottom: 60, left: 32 });
    expect(view.scale).toBeCloseTo(708 / 1728);
    expect(view.y).toBeCloseTo(32);
    expect(view.y + 1728 * view.scale).toBeCloseTo(740);
  });
});

describe('zoomAt', () => {
  it('keeps the page point under the anchor fixed', () => {
    const view = { scale: 0.5, x: 100, y: 50 };
    const anchor = { x: 300, y: 400 };
    const next = zoomAt(view, 2, anchor, 0.1, 10);
    expect(next.scale).toBe(1);
    expect(pagePoint(next, anchor).x).toBeCloseTo(pagePoint(view, anchor).x);
    expect(pagePoint(next, anchor).y).toBeCloseTo(pagePoint(view, anchor).y);
  });

  it('clamps the scale to the limits', () => {
    const view = { scale: 1, x: 0, y: 0 };
    expect(zoomAt(view, 100, { x: 0, y: 0 }, 0.5, 4).scale).toBe(4);
    expect(zoomAt(view, 0.01, { x: 0, y: 0 }, 0.5, 4).scale).toBe(0.5);
  });
});

describe('clampView', () => {
  it('keeps part of the page inside the viewport', () => {
    const viewport = { width: 800, height: 600 };
    const gone = clampView({ scale: 1, x: 5000, y: -5000 }, viewport, portrait, 64);
    expect(gone.x).toBe(800 - 64);
    expect(gone.y).toBe(64 - 1728);
  });

  it('leaves a view that already shows the page alone', () => {
    const view = { scale: 0.3, x: 100, y: 20 };
    expect(clampView(view, { width: 800, height: 600 }, portrait, 64)).toEqual(view);
  });
});
