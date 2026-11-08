import { FONT_FAMILIES } from '../themes/fonts/families';

/** A font to measure with. Sizes are points, which are SVG user units on the poster. */
export interface FontSpec {
  family: string;
  /** Font size in points. */
  size: number;
  /** CSS weight; defaults to 400. */
  weight?: number;
  /** Defaults to 'normal'. */
  style?: 'normal' | 'italic';
}

/** Measures set text. Implementations must return the same width for the same inputs. */
export interface TextMeasurer {
  /** Advance width of `text` set in `font`, in points. */
  width(text: string, font: FontSpec): number;
}

const NARROW = new Set("iljtfrI.,;:'!|()[]{}`\u2019\u00b7");
const WIDE = new Set('mwMW@%&');
const COMBINING_MARK = /\p{M}/u;

function charEm(char: string): number {
  if (COMBINING_MARK.test(char)) return 0;
  if (char === ' ') return 0.26;
  if (NARROW.has(char)) return 0.3;
  if (WIDE.has(char)) return 0.85;
  if (char >= '0' && char <= '9') return 0.55;
  if (char >= 'A' && char <= 'Z') return 0.68;
  if (char >= 'a' && char <= 'z') return 0.5;
  return 0.6;
}

const FAMILY_SCALE: Readonly<Record<string, number>> = {
  [FONT_FAMILIES.playfair]: 1.05,
  [FONT_FAMILIES.sourceSans]: 0.94,
  [FONT_FAMILIES.cormorant]: 0.9,
  [FONT_FAMILIES.greatVibes]: 0.86,
  [FONT_FAMILIES.jost]: 0.98,
};

/**
 * Deterministic, DOM-free estimate from per-character width classes, scaled by
 * size, family, weight, and style. Used by Node tests and golden snapshots;
 * the browser uses `createCanvasMeasurer()`.
 */
export const approxMeasurer: TextMeasurer = {
  width(text, font) {
    let em = 0;
    for (const char of text.normalize('NFD')) em += charEm(char);
    const family = FAMILY_SCALE[font.family] ?? 1;
    const weight = 1 + (((font.weight ?? 400) - 400) / 300) * 0.05;
    const style = font.style === 'italic' ? 0.97 : 1;
    return em * font.size * family * weight * style;
  },
};

const REFERENCE_PX = 100;

/**
 * Measures with a canvas 2D context (cached per font and text). Text is set at
 * a fixed reference size and scaled linearly. Callers must `await loadFonts()`
 * first, or the canvas silently measures a fallback font.
 */
export function createCanvasMeasurer(): TextMeasurer {
  const context = createContext();
  const cache = new Map<string, number>();
  return {
    width(text, font) {
      if (text === '') return 0;
      const css = `${font.style ?? 'normal'} ${font.weight ?? 400} ${REFERENCE_PX}px "${font.family}"`;
      const key = `${css}\u0000${text}`;
      let width = cache.get(key);
      if (width === undefined) {
        context.font = css;
        width = context.measureText(text).width;
        cache.set(key, width);
      }
      return (width * font.size) / REFERENCE_PX;
    },
  };
}

function createContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context =
    typeof document !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : new OffscreenCanvas(1, 1).getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  return context;
}
