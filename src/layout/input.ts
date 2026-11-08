import type { TreeIndex } from '../model/index';
import type { PersonId, Tree } from '../model/types';
import type { PageGeometry } from '../style';
import type { Theme } from '../themes/schema';
import type { Rect } from './geometry';
import type { PersonLabel } from './labels';
import type { TextMeasurer } from './measure';
import type { Layout } from './types';

/** Everything a layout function reads. Layouts are pure: same input, same output. */
export interface LayoutInput {
  tree: Tree;
  index: TreeIndex;
  theme: Theme;
  /** Labels of every person connected to the focus, after the toggles. */
  labels: ReadonlyMap<PersonId, PersonLabel>;
  measure: TextMeasurer;
  page: PageGeometry;
  /** Content area in points: inside the safe margin and the theme's border. */
  area: Rect;
  /** Square reserved for the QR code at the bottom-right of the area, or null. */
  qr: Rect | null;
  /** The poster title (tree title or the derived default). */
  title: string;
}

/** A layout: tree + theme + page area -> positioned nodes, connectors, and the title block. */
export type LayoutFn = (input: LayoutInput) => Layout;

/** Largest and smallest legible layout scale (1 = the theme's sizes). */
export const SCALE = { min: 0.55, max: 1.8 } as const;

/** `value` limited to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Where a line of descent leaves a couple drawn side by side: the center of
 * the join, or just below the ampersand when the theme joins with one.
 */
export function descentY(theme: Theme, rowCenter: number, size: number): number {
  return theme.ornaments.join === 'ampersand' ? rowCenter + size * 0.75 : rowCenter;
}
