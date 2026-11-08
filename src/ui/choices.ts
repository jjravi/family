import { layoutsForFocusCount, resolveLayout, type LayoutId, type Style } from '../style';

/** What the layout select offers and shows. */
export interface LayoutChoice {
  /** Only the layouts offered for the focus count, in display order. */
  options: readonly LayoutId[];
  /** The layout the poster is drawn with; null when nothing is offered. */
  selected: LayoutId | null;
}

/**
 * The layout select's state. The resolved layout is selected, so a null
 * (auto) or unavailable `style.layout` shows the layout actually drawn.
 */
export function layoutChoice(style: Style, focusCount: number): LayoutChoice {
  const options = layoutsForFocusCount(focusCount);
  return { options, selected: options.length > 0 ? resolveLayout(style, focusCount) : null };
}
