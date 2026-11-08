import cormorant500Italic from './cormorant-garamond-latin-500-italic.woff2';
import cormorant500 from './cormorant-garamond-latin-500-normal.woff2';
import cormorant600 from './cormorant-garamond-latin-600-normal.woff2';
import cormorant500ItalicExt from './cormorant-garamond-latin-ext-500-italic.woff2';
import cormorant500Ext from './cormorant-garamond-latin-ext-500-normal.woff2';
import cormorant600Ext from './cormorant-garamond-latin-ext-600-normal.woff2';
import greatVibes400 from './great-vibes-latin-400-normal.woff2';
import greatVibes400Ext from './great-vibes-latin-ext-400-normal.woff2';
import jost300Italic from './jost-latin-300-italic.woff2';
import jost300 from './jost-latin-300-normal.woff2';
import jost500 from './jost-latin-500-normal.woff2';
import jost300ItalicExt from './jost-latin-ext-300-italic.woff2';
import jost300Ext from './jost-latin-ext-300-normal.woff2';
import jost500Ext from './jost-latin-ext-500-normal.woff2';
import playfair400Italic from './playfair-display-latin-400-italic.woff2';
import playfair500 from './playfair-display-latin-500-normal.woff2';
import playfair600 from './playfair-display-latin-600-normal.woff2';
import playfair400ItalicExt from './playfair-display-latin-ext-400-italic.woff2';
import playfair500Ext from './playfair-display-latin-ext-500-normal.woff2';
import playfair600Ext from './playfair-display-latin-ext-600-normal.woff2';
import sourceSans400 from './source-sans-3-latin-400-normal.woff2';
import sourceSans400Ext from './source-sans-3-latin-ext-400-normal.woff2';
import { FONT_FAMILIES, type FontFamily } from './families';

export { FONT_FAMILIES, fontStack, type FontFamily, type FontFamilyKey } from './families';

export type FontSubset = 'latin' | 'latin-ext';
export type FontStyle = 'normal' | 'italic';

/** One @font-face: a static woff2 instance covering one unicode subset of one family, weight, and style. */
export interface FontFaceEntry {
  family: FontFamily;
  /** CSS font-weight of the instance. */
  weight: number;
  style: FontStyle;
  subset: FontSubset;
  /** CSS unicode-range of the subset file. */
  unicodeRange: string;
  /**
   * URL from a Vite asset import: `/assets/<name>-<hash>.woff2` in the build,
   * `/src/themes/fonts/<file>` under the dev server and vitest.
   */
  url: string;
  /** File name in src/themes/fonts/, for tests that read the bytes from disk. */
  file: string;
}

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const LATIN_EXT_SOURCE_SANS = LATIN_EXT.replace('U+20AD-20C0', 'U+20AD-20C4');

function face(
  family: FontFamily,
  weight: number,
  style: FontStyle,
  subset: FontSubset,
  file: string,
  url: string,
  unicodeRange = subset === 'latin' ? LATIN : LATIN_EXT,
): FontFaceEntry {
  return Object.freeze({ family, weight, style, subset, unicodeRange, url, file });
}

const { playfair, sourceSans, cormorant, greatVibes, jost } = FONT_FAMILIES;

/**
 * Every bundled face (SIL OFL 1.1; license texts are beside the files):
 * static instances of exactly the weights and styles the themes draw, since
 * Chrome embeds variable fonts in print PDFs as Type 3, which print shops may reject.
 */
export const FONT_FACES: readonly FontFaceEntry[] = Object.freeze([
  face(playfair, 500, 'normal', 'latin', 'playfair-display-latin-500-normal.woff2', playfair500),
  face(playfair, 500, 'normal', 'latin-ext', 'playfair-display-latin-ext-500-normal.woff2', playfair500Ext),
  face(playfair, 600, 'normal', 'latin', 'playfair-display-latin-600-normal.woff2', playfair600),
  face(playfair, 600, 'normal', 'latin-ext', 'playfair-display-latin-ext-600-normal.woff2', playfair600Ext),
  face(playfair, 400, 'italic', 'latin', 'playfair-display-latin-400-italic.woff2', playfair400Italic),
  face(playfair, 400, 'italic', 'latin-ext', 'playfair-display-latin-ext-400-italic.woff2', playfair400ItalicExt),
  face(sourceSans, 400, 'normal', 'latin', 'source-sans-3-latin-400-normal.woff2', sourceSans400),
  face(sourceSans, 400, 'normal', 'latin-ext', 'source-sans-3-latin-ext-400-normal.woff2', sourceSans400Ext, LATIN_EXT_SOURCE_SANS),
  face(cormorant, 500, 'normal', 'latin', 'cormorant-garamond-latin-500-normal.woff2', cormorant500),
  face(cormorant, 500, 'normal', 'latin-ext', 'cormorant-garamond-latin-ext-500-normal.woff2', cormorant500Ext),
  face(cormorant, 600, 'normal', 'latin', 'cormorant-garamond-latin-600-normal.woff2', cormorant600),
  face(cormorant, 600, 'normal', 'latin-ext', 'cormorant-garamond-latin-ext-600-normal.woff2', cormorant600Ext),
  face(cormorant, 500, 'italic', 'latin', 'cormorant-garamond-latin-500-italic.woff2', cormorant500Italic),
  face(cormorant, 500, 'italic', 'latin-ext', 'cormorant-garamond-latin-ext-500-italic.woff2', cormorant500ItalicExt),
  face(greatVibes, 400, 'normal', 'latin', 'great-vibes-latin-400-normal.woff2', greatVibes400),
  face(greatVibes, 400, 'normal', 'latin-ext', 'great-vibes-latin-ext-400-normal.woff2', greatVibes400Ext),
  face(jost, 300, 'normal', 'latin', 'jost-latin-300-normal.woff2', jost300),
  face(jost, 300, 'normal', 'latin-ext', 'jost-latin-ext-300-normal.woff2', jost300Ext),
  face(jost, 500, 'normal', 'latin', 'jost-latin-500-normal.woff2', jost500),
  face(jost, 500, 'normal', 'latin-ext', 'jost-latin-ext-500-normal.woff2', jost500Ext),
  face(jost, 300, 'italic', 'latin', 'jost-latin-300-italic.woff2', jost300Italic),
  face(jost, 300, 'italic', 'latin-ext', 'jost-latin-ext-300-italic.woff2', jost300ItalicExt),
]);

/**
 * @font-face rules for every face, one per FONT_FACES entry. `resolveUrl`
 * replaces each src URL, e.g. with a `data:font/woff2;base64,...` URL when
 * inlining fonts into an exported SVG. The output contains no `<` or `&`.
 */
export function fontFaceCss(resolveUrl: (face: FontFaceEntry) => string = (f) => f.url): string {
  return FONT_FACES.map((f) =>
    [
      '@font-face {',
      `  font-family: '${f.family}';`,
      `  font-style: ${f.style};`,
      `  font-weight: ${f.weight};`,
      '  font-display: block;',
      `  src: url("${resolveUrl(f)}") format('woff2');`,
      `  unicode-range: ${f.unicodeRange};`,
      '}',
    ].join('\n'),
  ).join('\n');
}

const STYLE_ELEMENT_ID = 'family-tree-fonts';
const SUBSET_SAMPLE: Readonly<Record<FontSubset, string>> = { latin: 'A', 'latin-ext': '\u0100' };

let loading: Promise<void> | undefined;

/**
 * Makes every face usable by the page: injects the @font-face rules once (a
 * `<style id="family-tree-fonts">` in `<head>`), loads each face via
 * `document.fonts.load`, then awaits `document.fonts.ready`. Resolves even when
 * a face fails to load (text falls back to a generic family). Await it before
 * measuring with `createCanvasMeasurer()` or rasterizing. Memoized; no-op when
 * `document` is undefined, and only injects the rules where `document.fonts`
 * is missing (jsdom).
 */
export function loadFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  loading ??= injectAndLoad();
  return loading;
}

async function injectAndLoad(): Promise<void> {
  if (!document.getElementById(STYLE_ELEMENT_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = fontFaceCss();
    document.head.append(style);
  }
  const fonts = document.fonts as FontFaceSet | undefined;
  if (!fonts) return;
  await Promise.allSettled(FONT_FACES.map((f) => fonts.load(`${f.style} ${f.weight} 16px '${f.family}'`, SUBSET_SAMPLE[f.subset])));
  await fonts.ready;
}
