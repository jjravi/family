export const LAYOUT_IDS = ['ped', 'fan', 'desc', 'bowtie', 'butterfly', 'converge'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const LAYOUT_LABELS: Readonly<Record<LayoutId, string>> = {
  ped: 'Pedigree',
  fan: 'Fan',
  desc: 'Descendants',
  bowtie: 'Bowtie',
  butterfly: 'Butterfly',
  converge: 'Converging',
};

const SINGLE_LAYOUTS: readonly LayoutId[] = Object.freeze(['ped', 'fan', 'desc']);
const COUPLE_LAYOUTS: readonly LayoutId[] = Object.freeze(['bowtie', 'butterfly', 'converge', 'desc']);
const NO_LAYOUTS: readonly LayoutId[] = Object.freeze([]);

/** Layouts offered for a focus count: 1 -> ped, fan, desc; 2 -> bowtie, butterfly, converge, desc; otherwise none. */
export function layoutsForFocusCount(focusCount: number): readonly LayoutId[] {
  if (focusCount === 1) return SINGLE_LAYOUTS;
  if (focusCount === 2) return COUPLE_LAYOUTS;
  return NO_LAYOUTS;
}

export const THEME_IDS = ['classic', 'botanical', 'modern'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  classic: 'Classic',
  botanical: 'Botanical',
  modern: 'Modern',
};

export const PAGE_SIZE_IDS = ['8x10', '11x14', '16x20', '18x24', '24x36', 'a4', 'a3', 'a2'] as const;
export type PageSizeId = (typeof PAGE_SIZE_IDS)[number];

export interface PageSize {
  /** Label for the options bar, e.g. '18 × 24 in'. */
  label: string;
  /** Portrait width in PostScript points (72 pt = 1 in). */
  width: number;
  /** Portrait height in points. */
  height: number;
  /** Portrait size in the unit it is defined in (for CSS `@page` and SVG width/height). */
  physical: { width: number; height: number; unit: 'in' | 'mm' };
}

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

function inchSize(width: number, height: number): PageSize {
  return {
    label: `${width} × ${height} in`,
    width: width * POINTS_PER_INCH,
    height: height * POINTS_PER_INCH,
    physical: { width, height, unit: 'in' },
  };
}

function isoSize(name: string, width: number, height: number): PageSize {
  return {
    label: `${name} (${width} × ${height} mm)`,
    width: (width * POINTS_PER_INCH) / MM_PER_INCH,
    height: (height * POINTS_PER_INCH) / MM_PER_INCH,
    physical: { width, height, unit: 'mm' },
  };
}

export const PAGE_SIZES: Readonly<Record<PageSizeId, PageSize>> = {
  '8x10': inchSize(8, 10),
  '11x14': inchSize(11, 14),
  '16x20': inchSize(16, 20),
  '18x24': inchSize(18, 24),
  '24x36': inchSize(24, 36),
  a4: isoSize('A4', 210, 297),
  a3: isoSize('A3', 297, 420),
  a2: isoSize('A2', 420, 594),
};

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Every display choice. Lives in the URL beside the DSL, never in the DSL itself. */
export interface Style {
  /** Requested layout; null = auto (see `resolveLayout`). */
  layout: LayoutId | null;
  theme: ThemeId;
  /** Show birth and death years. */
  dates: boolean;
  /** Show trait words. */
  traits: boolean;
  /** Privacy: hide the birth years of living persons (birth known, no death year) on the print. */
  living: boolean;
  /** Print the QR corner that encodes the share URL. */
  qr: boolean;
  size: PageSizeId;
  /** Requested orientation; null = auto (see `resolveOrientation`). */
  orientation: Orientation | null;
}

/**
 * Codec v1 defaults: a style param missing from a v1 URL means this value.
 * Part of the v1 link format; never change for v1.
 */
export const DEFAULT_STYLE: Readonly<Style> = Object.freeze({
  layout: null,
  theme: 'classic',
  dates: true,
  traits: false,
  living: false,
  qr: true,
  size: '18x24',
  orientation: null,
});

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function isLayoutId(value: unknown): value is LayoutId {
  return isOneOf(LAYOUT_IDS, value);
}

export function isThemeId(value: unknown): value is ThemeId {
  return isOneOf(THEME_IDS, value);
}

export function isPageSizeId(value: unknown): value is PageSizeId {
  return isOneOf(PAGE_SIZE_IDS, value);
}

export function isOrientation(value: unknown): value is Orientation {
  return isOneOf(ORIENTATIONS, value);
}

/**
 * The layout to draw: `style.layout` when it is offered for the focus count,
 * otherwise the default. Single root: `ped`. Couple: `bowtie` when the
 * orientation is explicitly landscape, else `converge`. Focus counts other
 * than 2 are treated as single.
 */
export function resolveLayout(style: Style, focusCount: number): LayoutId {
  if (style.layout !== null && layoutsForFocusCount(focusCount).includes(style.layout)) {
    return style.layout;
  }
  if (focusCount === 2) return style.orientation === 'landscape' ? 'bowtie' : 'converge';
  return 'ped';
}

/** The explicit orientation when set, else landscape for the wide layouts (`bowtie`, and `fan`'s half circle) and portrait for the rest. */
export function resolveOrientation(style: Style, layout: LayoutId): Orientation {
  return style.orientation ?? (layout === 'bowtie' || layout === 'fan' ? 'landscape' : 'portrait');
}

/** The physical page in points. The safe margin is for framing mats; nothing but the background is drawn inside it. */
export interface PageGeometry {
  size: PageSizeId;
  orientation: Orientation;
  /** Width in points, after applying orientation. */
  width: number;
  /** Height in points, after applying orientation. */
  height: number;
  /** Safe margin on every side, in points. */
  margin: number;
}

/** 0.75 in. */
const PAGE_MARGIN = 54;

/** Page geometry in points; landscape swaps width and height. 18x24 portrait = 1296 x 1728. */
export function pageGeometry(size: PageSizeId, orientation: Orientation): PageGeometry {
  const { width, height } = PAGE_SIZES[size];
  const landscape = orientation === 'landscape';
  return {
    size,
    orientation,
    width: landscape ? height : width,
    height: landscape ? width : height,
    margin: PAGE_MARGIN,
  };
}

/** CSS lengths of the page after orientation, e.g. `{ width: '24in', height: '18in' }` or `{ width: '297mm', height: '420mm' }`. */
export function physicalSize(page: PageGeometry): { width: string; height: string } {
  const { width, height, unit } = PAGE_SIZES[page.size].physical;
  const landscape = page.orientation === 'landscape';
  return {
    width: `${landscape ? height : width}${unit}`,
    height: `${landscape ? width : height}${unit}`,
  };
}

export interface ResolvedStyle {
  layout: LayoutId;
  orientation: Orientation;
  page: PageGeometry;
}

/** Layout, orientation, and page geometry for a style and focus count: the single source both the engine and the UI use. */
export function resolveStyle(style: Style, focusCount: number): ResolvedStyle {
  const layout = resolveLayout(style, focusCount);
  const orientation = resolveOrientation(style, layout);
  return { layout, orientation, page: pageGeometry(style.size, orientation) };
}
