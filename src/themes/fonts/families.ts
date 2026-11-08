/** Font family names exactly as declared in @font-face. Use these in SVG `font-family` and CSS. */
export const FONT_FAMILIES = {
  /** Classic theme display serif (500 and 600, plus 400 italic). */
  playfair: 'Playfair Display',
  /** Classic theme dates (400). */
  sourceSans: 'Source Sans 3',
  /** Botanical theme display and body serif (500 and 600, plus 500 italic for trait words). */
  cormorant: 'Cormorant Garamond',
  /** Script for couple titles (400 only). */
  greatVibes: 'Great Vibes',
  /** Modern theme geometric sans (300 and 500, plus 300 italic). */
  jost: 'Jost',
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;
export type FontFamily = (typeof FONT_FAMILIES)[FontFamilyKey];

const GENERIC_FALLBACK: Readonly<Record<FontFamily, string>> = {
  'Playfair Display': 'serif',
  'Source Sans 3': 'sans-serif',
  'Cormorant Garamond': 'serif',
  'Great Vibes': 'cursive',
  Jost: 'sans-serif',
};

/** A `font-family` value with a generic fallback, e.g. `'Playfair Display', serif`. Safe inside a double-quoted SVG attribute. */
export function fontStack(family: FontFamily): string {
  return `'${family}', ${GENERIC_FALLBACK[family]}`;
}
