import type { LayoutId, ThemeId } from '../style';
import type { FontFamily } from './fonts/families';

export const NODE_SHAPES = ['box', 'pill', 'leaf', 'circle', 'text-only'] as const;
/** The shape drawn behind each name. */
export type NodeShape = (typeof NODE_SHAPES)[number];

export const EDGE_STYLES = ['orthogonal', 'curve', 'organic', 'radial'] as const;
/** How parent-child connectors are drawn; `organic` = tapered Bézier branches, `radial` = straight hairlines. */
export type EdgeStyle = (typeof EDGE_STYLES)[number];

export const PLACEHOLDER_STYLES = ['hidden', 'dotted', 'faded'] as const;
/** How unknown ancestors (empty pedigree slots) appear. */
export type PlaceholderStyle = (typeof PLACEHOLDER_STYLES)[number];

/** A typeface choice. Families come from FONT_FAMILIES so the exporter can find and inline them. */
export interface Face {
  family: FontFamily;
  weight: number;
  style: 'normal' | 'italic';
  /** Letter spacing in em. */
  tracking: number;
  uppercase: boolean;
}

/** Theme colors (hex). */
export interface Palette {
  background: string;
  /** Optional paper treatment over the background: a soft vignette toward `edge`. */
  paper: { edge: string } | null;
  ink: string;
  /** Title text. */
  title: string;
  accent: string;
  muted: string;
  placeholder: string;
  /** Fill behind names for shaped nodes. */
  node: string;
  /** Node outline. */
  stroke: string;
  /** Connector lines and branches. */
  edge: string;
}

/** Typefaces and type sizes. */
export interface ThemeType {
  /** Single-root title. */
  display: Face;
  /** Couple title in the cartouche (a script face for botanical). */
  coupleTitle: Face;
  name: Face;
  /** Names of the focus person or couple. */
  focusName: Face;
  dates: Face;
  /** Trait words; always an italic face. */
  trait: Face;
  /** Name size in points at scale 1 for generation 0 (focus), 1, 2, ...; the last entry repeats. */
  nameSizes: readonly number[];
  /** Dates size as a fraction of the name size. */
  datesScale: number;
  /** Trait size as a fraction of the name size. */
  traitScale: number;
  /** Title size as a fraction of the content width, before fitting. */
  titleScale: number;
}

/** How person nodes are drawn. */
export interface NodeStyle {
  shape: NodeShape;
  /** Outline width in points at scale 1; 0 = no outline. */
  stroke: number;
  /** Corner radius of `box` nodes, in em of the name size. */
  radius: number;
  /** Draw a second, inner outline around the focus. */
  focusRing: boolean;
}

/** How connectors are drawn. */
export interface EdgeTheme {
  style: EdgeStyle;
  /** Stroke width in points at scale 1 (the thinnest branch for `organic`). */
  width: number;
  /** Thinnest stroked connector in points on an 18x24 page, scaled with the page (0 = no floor beyond the renderer's). */
  minWidth: number;
  /** Corner radius of orthogonal connectors, in points at scale 1. */
  corner: number;
}

/** Curated, hand-drawn ornaments (render/ornaments.ts); none are generated. */
export interface Ornaments {
  border: 'none' | 'double-rule' | 'hairline';
  corners: 'none' | 'classic' | 'botanical';
  cartouche: 'classic' | 'botanical' | 'modern';
  rule: 'diamond' | 'sprig' | 'line';
  /** The mark joining a couple: an ampersand, a ring, or a plain bar. */
  join: 'ampersand' | 'ring' | 'bar';
}

/**
 * Box metrics in em of the generation's name size. A box is `padY + nameLine
 * [+ datesLine] [+ traitsLine] + padY` tall (see `boxHeightEm`), so toggling dates
 * or traits changes the box and the layout re-runs with it.
 */
export interface ThemeMetrics {
  padX: number;
  padY: number;
  nameLine: number;
  datesLine: number;
  traitsLine: number;
  /** Width bounds of a box; content decides within them. */
  minWidth: number;
  maxWidth: number;
  /** Gap between neighbouring boxes. */
  gap: number;
  /** Minimum gap between generations (room for connectors). */
  rowGap: number;
}

/** A complete theme as drawn for one layout (after overrides). */
export interface Theme {
  id: ThemeId;
  palette: Palette;
  type: ThemeType;
  node: NodeStyle;
  edge: EdgeTheme;
  ornaments: Ornaments;
  placeholder: PlaceholderStyle;
  metrics: ThemeMetrics;
}

/** Fields a layout may override, section by section. */
export type ThemeOverride = { [K in Exclude<keyof Theme, 'id'>]?: Partial<Theme[K]> };

/** A theme plus its per-layout overrides. Pure data: adding a theme never touches layout code. */
export interface ThemeDefinition extends Theme {
  layouts: Partial<Record<LayoutId, ThemeOverride>>;
}

/** Box height in em of the name size, given the toggles and the number of name lines. */
export function boxHeightEm(metrics: ThemeMetrics, lines: { dates: boolean; traits: boolean; nameLines?: number }): number {
  return (
    2 * metrics.padY +
    metrics.nameLine * (lines.nameLines ?? 1) +
    (lines.dates ? metrics.datesLine : 0) +
    (lines.traits ? metrics.traitsLine : 0)
  );
}
