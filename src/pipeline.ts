import { parse } from './dsl/parse';
import { approxMeasurer, type TextMeasurer } from './layout/measure';
import { hasErrors, type Diagnostic, type ParseResult, type Tree } from './model/types';
import { drawPoster } from './render/poster';
import { resolveStyle, type LayoutId, type Orientation, type PageGeometry, type Style } from './style';

export interface PosterInput {
  dsl: string;
  style: Style;
  /** Full share URL for the QR corner; null = no QR corner. */
  shareUrl: string | null;
  /** Defaults to `approxMeasurer`; the browser passes a canvas measurer created after loadFonts(). */
  measure?: TextMeasurer;
}

export interface PosterResult {
  /** True when `svg` holds a fresh poster. False when parse errors block rendering or drawing threw. */
  ok: boolean;
  /** Parser diagnostics, sorted by line (stable within a line). */
  diagnostics: Diagnostic[];
  /** Messages for the UI that are not tied to a DSL line (engine notices, internal failures). */
  notices: string[];
  /** The parsed tree, even when it has errors; null only when the parser itself crashed. */
  tree: Tree | null;
  /** `tree.focus.length` (0 when there is no usable focus). */
  focusCount: number;
  /** Resolved layout, orientation, and page whenever the focus count is 1 or 2 (even when `ok` is false); else null. */
  layout: LayoutId | null;
  orientation: Orientation | null;
  page: PageGeometry | null;
  /** The poster markup when `ok`; else null (the UI keeps the last good render, dimmed). */
  svg: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * DSL + style -> poster: parse, stop if errors block rendering, else drawPoster.
 * Pure and synchronous; never throws (parser or engine exceptions become
 * `ok: false` plus a notice).
 */
export function renderPoster(input: PosterInput): PosterResult {
  const failed: PosterResult = {
    ok: false,
    diagnostics: [],
    notices: [],
    tree: null,
    focusCount: 0,
    layout: null,
    orientation: null,
    page: null,
    svg: null,
  };

  let parsed: ParseResult;
  try {
    parsed = parse(input.dsl);
  } catch (error) {
    return { ...failed, notices: [`The parser failed: ${errorMessage(error)}`] };
  }

  const { tree } = parsed;
  const diagnostics = [...parsed.diagnostics].sort((a, b) => a.line - b.line);
  const focusCount = tree.focus.length;
  const resolved = focusCount === 1 || focusCount === 2 ? resolveStyle(input.style, focusCount) : null;
  const partial: PosterResult = {
    ...failed,
    diagnostics,
    tree,
    focusCount,
    layout: resolved?.layout ?? null,
    orientation: resolved?.orientation ?? null,
    page: resolved?.page ?? null,
  };

  if (hasErrors(diagnostics)) return partial;
  if (!resolved) return { ...partial, notices: ['Add a focus line: `focus: Name` or `focus: Name + Name`.'] };

  try {
    const drawn = drawPoster(tree, input.style, {
      measure: input.measure ?? approxMeasurer,
      shareUrl: input.shareUrl,
      seed: input.dsl,
    });
    return {
      ...partial,
      ok: true,
      notices: drawn.notices,
      layout: drawn.layout,
      orientation: drawn.orientation,
      page: drawn.page,
      svg: drawn.svg,
    };
  } catch (error) {
    return { ...partial, notices: [`Could not draw the poster: ${errorMessage(error)}`] };
  }
}
