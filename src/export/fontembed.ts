import { FONT_FACES, FONT_FAMILIES, fontFaceCss, type FontFaceEntry, type FontFamily } from '../themes/fonts';

const FAMILIES: readonly FontFamily[] = Object.values(FONT_FAMILIES);

const NAMED_ENTITIES: Readonly<Record<string, string>> = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (entity, name: string) => {
    if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function cssFontValues(css: string): string[] {
  return [...css.matchAll(/(?:^|[;{\s])font(?:-family)?\s*:\s*([^;}]*)/gi)].map((match) => match[1]!);
}

/** Values of `font-family` attributes and of `font` / `font-family` declarations in `style` attributes and `<style>` elements. */
function fontValues(svg: string): string[] {
  const values: string[] = [];
  const attribute = (match: RegExpMatchArray) => decodeEntities(match[1] ?? match[2]!);
  for (const match of svg.matchAll(/\sfont-family\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) values.push(attribute(match));
  for (const match of svg.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) values.push(...cssFontValues(attribute(match)));
  for (const match of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) values.push(...cssFontValues(match[1]!));
  return values;
}

/** Bundled families named in the SVG's font declarations (quoted or not, any case), in FONT_FAMILIES order. */
export function usedFontFamilies(svg: string): FontFamily[] {
  const values = fontValues(svg).map((value) => value.toLowerCase());
  return FAMILIES.filter((family) => values.some((value) => value.includes(family.toLowerCase())));
}

const WEIGHT_KEYWORDS: Readonly<Record<string, number>> = { normal: 400, bold: 700 };

function weightValue(token: string): number | null {
  const keyword = WEIGHT_KEYWORDS[token.toLowerCase()];
  if (keyword !== undefined) return keyword;
  const value = /^\d+(\.\d+)?$/.test(token) ? Number(token) : NaN;
  return value >= 1 && value <= 1000 ? value : null;
}

/**
 * Weights the SVG asks for: `font-weight` attributes and declarations, and the
 * weight of `font` shorthands, plus 400 for text that declares none. Null when
 * one cannot be resolved without the cascade (`bolder`, `inherit`, ...).
 */
function requestedWeights(svg: string): Set<number> | null {
  const weights = new Set([400]);
  const declared: string[] = [];
  const attribute = (match: RegExpMatchArray) => decodeEntities(match[1] ?? match[2]!);
  for (const match of svg.matchAll(/\sfont-weight\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) declared.push(attribute(match));
  const css = [
    ...[...svg.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(attribute),
    ...[...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]!),
  ];
  for (const text of css) {
    for (const match of text.matchAll(/(?:^|[;{\s])font-weight\s*:\s*([^;}]*)/gi)) declared.push(match[1]!);
    for (const match of text.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]*)/gi)) {
      // The weight, if any, comes before the size: `italic 600 14px 'Jost'`.
      const tokens = match[1]!.trim().split(/\s+/);
      const size = tokens.findIndex((token) => /^[\d.]+[a-z%]+$/i.test(token) || token.includes('/'));
      const weight = (size < 0 ? tokens : tokens.slice(0, size)).find((token) => weightValue(token) !== null);
      if (weight) declared.push(weight);
    }
  }
  for (const value of declared) {
    const weight = weightValue(value.trim());
    if (weight === null) return null;
    weights.add(weight);
  }
  return weights;
}

/** The weight CSS font matching (CSS Fonts 4, font-weight) picks for `desired` among `available`. */
export function matchWeight(available: readonly number[], desired: number): number | undefined {
  if (available.includes(desired)) return desired;
  const below = available.filter((w) => w < desired).sort((a, b) => b - a);
  const above = available.filter((w) => w > desired).sort((a, b) => a - b);
  if (desired >= 400 && desired <= 500) return above.find((w) => w <= 500) ?? below[0] ?? above[0];
  return desired < 400 ? (below[0] ?? above[0]) : (above[0] ?? below[0]);
}

function unicodeRanges(range: string): [number, number][] {
  return range.split(',').map((part) => {
    const [low, high = low] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(low!, 16), parseInt(high!, 16)];
  });
}

/**
 * The FONT_FACES entries `svg` needs: faces of the families it names, at the
 * weights the browser would pick for the weights it asks for, italic faces only
 * when it mentions italic or oblique, and only the unicode subsets its
 * characters fall in. Over-inclusion merely costs bytes; omission would change
 * the drawing, so every check leans inclusive (italic anywhere embeds the
 * italic faces of every named family; an unresolvable weight embeds them all).
 */
export function facesForSvg(svg: string): FontFaceEntry[] {
  const families = new Set(usedFontFamilies(svg));
  if (families.size === 0) return [];
  const italic = /italic|oblique/i.test(svg);
  const weights = requestedWeights(svg);
  const codePoints = new Set<number>();
  for (const char of svg) codePoints.add(char.codePointAt(0)!);
  return FONT_FACES.filter((face) => {
    if (!families.has(face.family) || (face.style === 'italic' && !italic)) return false;
    if (weights) {
      const available = FONT_FACES.filter((f) => f.family === face.family && f.style === face.style).map((f) => f.weight);
      if (![...weights].some((weight) => matchWeight(available, weight) === face.weight)) return false;
    }
    const ranges = unicodeRanges(face.unicodeRange);
    for (const point of codePoints) if (ranges.some(([low, high]) => point >= low && point <= high)) return true;
    return false;
  });
}

const SKIPPED = 'about:skipped-font-face';

/** fontFaceCss() reduced to the rules of `faces`, each with its src replaced by `src(face)`. */
export function embeddedFontCss(faces: readonly FontFaceEntry[], src: (face: FontFaceEntry) => string): string {
  const wanted = new Set(faces);
  return fontFaceCss((face) => (wanted.has(face) ? src(face) : SKIPPED))
    .replace(new RegExp(`@font-face\\s*\\{[^}]*${SKIPPED}[^}]*\\}\\s*`, 'g'), '')
    .trim();
}
