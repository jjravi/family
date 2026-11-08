import { APPROX, DASH, DASH_ALIASES, YEAR_PATTERN } from './spec';

/** A year as written: `c1932` is `{ year: 1932, approx: true }`. */
export interface Year {
  year: number;
  approx: boolean;
}

/** A person's years; at least one is set when read from the DSL. */
export interface Years {
  birth: Year | null;
  death: Year | null;
}

const DASHES: ReadonlySet<string> = new Set([DASH, ...DASH_ALIASES]);
const ANY_DASH = new RegExp(`[${[...DASHES].map((d) => d.replace(/[\\\]^-]/g, '\\$&')).join('')}]`, 'g');
const RANGE = new RegExp(`^(?:${YEAR_PATTERN})?(?:${DASH}(?:${YEAR_PATTERN})?)?$`, 'i');
const BRACKETED = /^\((.*)\)$|^\[(.*)\]$/s;
/** The most words one years expression spans: `1932 – 2019`. */
const MAX_YEAR_WORDS = 3;

function toYear(prefix: string | undefined, digits: string | undefined): Year | null {
  return digits === undefined ? null : { year: Number(digits), approx: prefix !== undefined };
}

/**
 * Reads one years expression: `1932-2019`, `1932`, `1932-`, `-2019`, a `c`
 * prefix on either year, full ISO dates, any accepted dash, optionally wrapped
 * in parentheses or brackets. Null when `text` is not one.
 */
export function readYears(text: string): Years | null {
  const bracketed = BRACKETED.exec(text);
  const inner = bracketed ? (bracketed[1] ?? bracketed[2]!) : text;
  const match = RANGE.exec(inner.replace(ANY_DASH, DASH));
  if (!match || (match[2] === undefined && match[4] === undefined)) return null;
  return { birth: toYear(match[1], match[2]), death: toYear(match[3], match[4]) };
}

export function isDashOnly(word: string): boolean {
  return word !== '' && [...word].every((char) => DASHES.has(char));
}

function joinable(left: string, right: string): boolean {
  return DASHES.has(left.at(-1)!) || DASHES.has(right[0]!);
}

/**
 * Finds the years expression at the end of a person's words. It may span up to
 * three words when they meet at a dash (`1932 – 2019`, `1932 -2019`), so a name
 * ending in an initial (`Mary C 1950`) never turns the initial into a year prefix.
 */
export function splitYears(words: readonly string[]): { years: Years; wordCount: number } | null {
  for (let count = Math.min(MAX_YEAR_WORDS, words.length); count >= 1; count--) {
    const tail = words.slice(words.length - count);
    if (!tail.every((word, i) => i === 0 || joinable(tail[i - 1]!, word))) continue;
    const years = readYears(tail.join(''));
    if (years) return { years, wordCount: count };
  }
  return null;
}

/** `1932`, or `c1932` when approximate; padded to the four digits the parser reads. */
export function formatYear(year: Year): string {
  return `${year.approx ? APPROX : ''}${String(year.year).padStart(4, '0')}`;
}

/** Canonical years: `1932-2019`, `1932`, `-2019`, or '' when neither is known. */
export function formatYears({ birth, death }: Years): string {
  if (death === null) return birth === null ? '' : formatYear(birth);
  return `${birth === null ? '' : formatYear(birth)}${DASH}${formatYear(death)}`;
}
