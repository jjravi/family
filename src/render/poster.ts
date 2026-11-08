import type { TextMeasurer } from '../layout/measure';
import type { Tree } from '../model/types';
import type { LayoutId, Orientation, PageGeometry, Style } from '../style';
import { composeScene } from './scene';
import { writeSvg } from './write';

export interface DrawContext {
  /** Text widths in points; `approxMeasurer` in Node, a canvas measurer in the browser (after loadFonts()). */
  measure: TextMeasurer;
  /** The full share URL for the QR corner; null = no QR corner (and no notice). */
  shareUrl: string | null;
  /** The DSL text; seeds the PRNG behind organic jitter so the same URL always draws the same picture. */
  seed: string;
}

export interface DrawResult {
  /** Complete standalone SVG markup sized to the physical page. */
  svg: string;
  layout: LayoutId;
  orientation: Orientation;
  page: PageGeometry;
  /** Human-readable notes for the UI, e.g. 'link too long for QR', traits dropped, capacity limits. */
  notices: string[];
}

/**
 * The poster engine's single entry point: tree + style -> one SVG poster.
 * Pure, synchronous, deterministic (identical inputs give an identical string),
 * and DOM-free, so golden snapshots run in Node.
 *
 * Input: a tree without blocking errors and with 1 or 2 focus ids (renderPoster
 * guarantees this). `layout`, `orientation`, and `page` in the result equal
 * `resolveStyle(style, tree.focus.length)`.
 *
 * Output SVG: root `<svg xmlns="http://www.w3.org/2000/svg">` with width/height
 * from `physicalSize(page)` and `viewBox="0 0 page.width page.height"` (points),
 * a `<title>` and `aria-label`, `data-id` on every person node, and nothing but
 * the background inside the page margin. Font families come from FONT_FAMILIES /
 * fontStack(); no @font-face is embedded (export/svg.ts inlines fonts).
 *
 * Rules: persons not connected to the focus are omitted; `dates` adds a years
 * line, `traits` an italic trait line (both change metrics, so layout re-runs);
 * `living` hides the birth year of living persons (birth known, no death year);
 * when `tree.title` is null a default title is derived (spec decision 27: "A & B",
 * using surnames when present). The QR corner is drawn with render/qr.ts when
 * `style.qr` and `shareUrl` are set; when qrPlan(shareUrl) is null the corner is
 * omitted with the notice 'link too long for QR'.
 */
export function drawPoster(tree: Tree, style: Style, ctx: DrawContext): DrawResult {
  const scene = composeScene(tree, style, ctx);
  return {
    svg: writeSvg(scene),
    layout: scene.layout,
    orientation: scene.orientation,
    page: scene.page,
    notices: scene.notices,
  };
}
