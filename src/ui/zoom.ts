export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Maps page units to viewport pixels: screen = page × scale + (x, y). */
export interface View {
  scale: number;
  x: number;
  y: number;
}

/** Space to keep clear at each edge of the viewport, in pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fit-to-width, capped by the height: the whole page centered in the viewport minus `insets`. */
export function fitView(viewport: Size, page: Size, insets: Insets): View {
  const width = Math.max(1, viewport.width - insets.left - insets.right);
  const height = Math.max(1, viewport.height - insets.top - insets.bottom);
  const scale = Math.min(width / page.width, height / page.height);
  return { scale, x: insets.left + (width - page.width * scale) / 2, y: insets.top + (height - page.height * scale) / 2 };
}

/** Scales by `factor` (the result clamped to [min, max]) about `anchor`, keeping the page point under it fixed. */
export function zoomAt(view: View, factor: number, anchor: Point, min: number, max: number): View {
  const scale = clamp(view.scale * factor, min, max);
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

/** Keeps at least `keep` pixels of the page (all of it when smaller) inside the viewport on each axis. */
export function clampView(view: View, viewport: Size, page: Size, keep: number): View {
  const width = page.width * view.scale;
  const height = page.height * view.scale;
  const keepX = Math.min(keep, width, viewport.width);
  const keepY = Math.min(keep, height, viewport.height);
  return {
    scale: view.scale,
    x: clamp(view.x, keepX - width, viewport.width - keepX),
    y: clamp(view.y, keepY - height, viewport.height - keepY),
  };
}
