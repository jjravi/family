import { ARROW, DOUBLE_QUOTES, EXAMPLES, MAX_PARTNERS, MAX_TRAIT_LENGTH, MAX_TRAITS, PLUS, SUFFIX, UNKNOWN } from './spec';
import { splitList, splitTokens, stripListMarker, type Token } from './tokenize';
import { isDashOnly, readYears, splitYears, type Year } from './years';

/** One person as written, `Name[@n] [years] ["traits"]`, before identity is resolved. */
export interface PersonEntry {
  /** Trimmed, inner whitespace collapsed, without the `@n` suffix. */
  name: string;
  /** The `@n` suffix (n >= 1), or null when absent. */
  index: number | null;
  birth: Year | null;
  death: Year | null;
  /** Null when no trait string was written; otherwise at most MAX_TRAITS items. */
  traits: string[] | null;
}

interface Failure {
  kind: 'error';
  message: string;
}

type EntrySyntax =
  | { kind: 'person'; entry: PersonEntry; warnings: string[] }
  | { kind: 'unknown' }
  | { kind: 'empty' }
  | Failure;

/** A union line (`A + B -> C, D`), or a line naming one person, which declares or describes them. */
export type LineSyntax =
  | { kind: 'person'; entry: PersonEntry; warnings: string[] }
  | { kind: 'union'; partners: (PersonEntry | null)[]; children: PersonEntry[]; warnings: string[] }
  | Failure;

export type FocusSyntax = { kind: 'focus'; entries: PersonEntry[]; warnings: string[] } | Failure;

export interface Directive {
  /** Lowercased, inner whitespace collapsed. */
  key: string;
  /** The key as written, for messages. */
  written: string;
  /** Everything after the first colon. */
  value: string;
}

const fail = (message: string): Failure => ({ kind: 'error', message });
const quoted = (text: string): string => `"${text}"`;

const SUFFIXED_NAME = new RegExp(`^(.*?)\\s*${SUFFIX}\\s*(\\d{1,3})$`, 's');
const FOUR_DIGITS = /\d{4}/;
const DIRECTIVE_LINE = /^\s*(\p{L}[\p{L}\p{M}\p{N} ._-]*?)\s*:(.*)$/su;
const QUOTE_CHARS = DOUBLE_QUOTES.join('');
const WHOLLY_QUOTED = new RegExp(`^[${QUOTE_CHARS}]([^${QUOTE_CHARS}]*)[${QUOTE_CHARS}]$`);
const YEAR_HELP = `Write years like ${EXAMPLES.bornDied}, ${EXAMPLES.born}, ${EXAMPLES.died}, or ${EXAMPLES.approximate}.`;

function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function wordsOf(tokens: readonly Token[]): string[] {
  return tokens
    .map((t) => (t.kind === 'text' ? t.text : ''))
    .join('')
    .split(/\s+/)
    .filter((w) => w !== '');
}

/** The entry as written, for messages. */
function writtenText(tokens: readonly Token[]): string {
  return clean(tokens.map((t) => (t.kind === 'text' ? t.text : t.kind === 'quoted' ? quoted(t.text) : '')).join(''));
}

function readTraits(text: string, name: string, warnings: string[]): string[] {
  const items = splitList(text).map(clean).filter((t) => t !== '');
  const kept = items.slice(0, MAX_TRAITS);
  if (items.length > MAX_TRAITS) {
    const dropped = items.slice(MAX_TRAITS).join(', ');
    warnings.push(`${quoted(name)} has ${items.length} traits; only the first ${MAX_TRAITS} are kept (dropped: ${quoted(dropped)}).`);
  }
  for (const trait of kept) {
    if ([...trait].length > MAX_TRAIT_LENGTH) {
      warnings.push(`The trait ${quoted(trait)} is longer than ${MAX_TRAIT_LENGTH} characters and may not fit on the poster.`);
    }
  }
  return kept;
}

/** Checks the words left for the name once the years (`yearWords`) are taken off the end. */
function nameError(nameWords: readonly string[], yearWords: readonly string[]): string | null {
  const name = nameWords.join(' ');
  const yearLike = nameWords.find((w) => FOUR_DIGITS.test(w));
  if (yearLike !== undefined) {
    if (!readYears(yearLike)) return `${quoted(yearLike)} is not a year format this understands. ${YEAR_HELP}`;
    if (yearLike === nameWords.at(-1) && yearWords.length > 0) {
      return `Put a dash between the birth and death years, like ${quoted(`${yearLike}-${yearWords.join('')}`)}.`;
    }
    const rest = nameWords.filter((w) => w !== yearLike).join(' ');
    return `${quoted(name)} has years inside the name. Write the name first, then the years, like ${quoted(`${rest} ${yearLike}`)}.`;
  }
  if (nameWords.some(isDashOnly)) {
    return `A dash on its own can't be part of a name (${quoted(name)}). Write years like ${EXAMPLES.bornDied} and arrows as ${quoted(ARROW)}.`;
  }
  if (stripListMarker(name) !== name) {
    return `Remove the list marker at the start of ${quoted(name)}; write people without bullets or numbering.`;
  }
  const forbidden = [':', '`'].find((char) => name.includes(char));
  if (forbidden !== undefined) {
    return `A name can't contain ${quoted(forbidden)} (${quoted(name)}). Directives like "focus:" go on a line of their own.`;
  }
  return null;
}

/** Reads one person entry from the tokens between two separators. */
function readEntry(tokens: readonly Token[]): EntrySyntax {
  const quoteAt = tokens.findIndex((t) => t.kind === 'quoted');
  const traitsToken = quoteAt === -1 ? undefined : tokens[quoteAt];
  const nameAndYears = wordsOf(quoteAt === -1 ? tokens : tokens.slice(0, quoteAt));

  if (traitsToken?.kind === 'quoted') {
    if (!traitsToken.closed) return fail(`The quote before ${quoted(clean(traitsToken.text))} is never closed.`);
    const after = tokens.slice(quoteAt + 1);
    if (after.some((t) => t.kind === 'quoted')) {
      return fail(`Write all of a person's traits inside one pair of quotes, like "kind, funny".`);
    }
    const trailing = wordsOf(after).join(' ');
    if (trailing !== '') {
      return fail(
        `Text after the traits: ${quoted(trailing)}. Write the name, then the years, then the "traits" last; quotes are only for traits.`,
      );
    }
  } else if (nameAndYears.length === 0) {
    return { kind: 'empty' };
  }

  const split = splitYears(nameAndYears);
  const nameWords = nameAndYears.slice(0, nameAndYears.length - (split?.wordCount ?? 0));
  const problem = nameError(nameWords, nameAndYears.slice(nameWords.length));
  if (problem !== null) return fail(problem);

  let name = nameWords.join(' ');
  let index: number | null = null;
  const suffixed = SUFFIXED_NAME.exec(name);
  if (suffixed) {
    name = suffixed[1]!;
    index = Number(suffixed[2]);
  }
  if (name === '') return fail(`Missing a person's name in ${quoted(writtenText(tokens))}.`);
  if (index === 0) {
    return fail(`Numbering starts at 1: ${quoted(`${name}${SUFFIX}1`)} is the first ${name}, ${quoted(`${name}${SUFFIX}2`)} the second.`);
  }
  if (name.includes(SUFFIX)) {
    return fail(`${quoted(name)}: ${quoted(SUFFIX)} is only for numbering people who share a name, like ${quoted(EXAMPLES.sameName)}.`);
  }
  if (name === UNKNOWN) {
    if (split !== null || traitsToken !== undefined || index !== null) {
      return fail(`${quoted(UNKNOWN)} stands for an unknown partner and can't have years, traits, or a number. Give the person a name instead.`);
    }
    return { kind: 'unknown' };
  }

  const warnings: string[] = [];
  const traits = traitsToken?.kind === 'quoted' ? readTraits(traitsToken.text, name, warnings) : null;
  const { birth, death } = split?.years ?? { birth: null, death: null };
  if (birth && death && death.year < birth.year) {
    warnings.push(`${quoted(name)} has a death year (${death.year}) before the birth year (${birth.year}); check the years.`);
  }
  return { kind: 'person', entry: { name, index, birth, death, traits }, warnings };
}

/** Reads a line that is neither blank nor a directive. */
export function readUnionLine(tokens: readonly Token[]): LineSyntax {
  if (tokens.filter((t) => t.kind === 'arrow').length > 1) {
    return fail(`Use one ${quoted(ARROW)} per line: partners before it, children after it.`);
  }
  const arrowAt = tokens.findIndex((t) => t.kind === 'arrow');
  const left = arrowAt === -1 ? tokens : tokens.slice(0, arrowAt);
  const right = arrowAt === -1 ? null : tokens.slice(arrowAt + 1);
  if (left.some((t) => t.kind === 'comma')) {
    return fail(`Join two partners with ${quoted(PLUS)}, not a comma. Commas separate the children after ${quoted(ARROW)}.`);
  }
  if (right?.some((t) => t.kind === 'plus')) {
    return fail(`Only children go after ${quoted(ARROW)}, separated by commas. Write a child's own partner on a separate line.`);
  }

  const warnings: string[] = [];
  const partnerGroups = splitTokens(left, 'plus');
  if (partnerGroups.length > MAX_PARTNERS) {
    return fail(`A couple has at most ${MAX_PARTNERS} partners. Write each couple on its own line.`);
  }
  const partners: (PersonEntry | null)[] = [];
  for (const group of partnerGroups) {
    const read = readEntry(group);
    if (read.kind === 'error') return read;
    if (read.kind === 'empty') {
      return fail(
        partnerGroups.length === 1
          ? `Write the parents before ${quoted(ARROW)}; use ${quoted(UNKNOWN)} for an unknown parent.`
          : `Missing a name next to ${quoted(PLUS)}.`,
      );
    }
    if (read.kind === 'unknown') {
      partners.push(null);
    } else {
      partners.push(read.entry);
      warnings.push(...read.warnings);
    }
  }

  if (right === null) {
    const [only] = partners;
    if (partners.length === 1 && only) return { kind: 'person', entry: only, warnings };
    if (partners.every((p) => p === null)) {
      return fail(`This line names no one; ${quoted(UNKNOWN)} only stands in for the unknown partner of a named person.`);
    }
    return { kind: 'union', partners, children: [], warnings };
  }

  const childGroups = splitTokens(right, 'comma');
  const children: PersonEntry[] = [];
  for (const group of childGroups) {
    const read = readEntry(group);
    if (read.kind === 'error') return read;
    if (read.kind === 'empty') {
      return fail(
        childGroups.length === 1
          ? `Nothing after ${quoted(ARROW)}. List the children separated by commas, or remove the ${quoted(ARROW)}.`
          : `Missing a child's name between commas.`,
      );
    }
    if (read.kind === 'unknown') {
      return fail(`${quoted(UNKNOWN)} stands for an unknown partner, not a child. Leave unknown children out.`);
    }
    children.push(read.entry);
    warnings.push(...read.warnings);
  }
  return { kind: 'union', partners, children, warnings };
}

/** Reads the value of a `focus:` directive: one or two person entries joined by `+`. */
export function readFocus(tokens: readonly Token[]): FocusSyntax {
  const form = `The focus line takes one name, or two joined by ${quoted(PLUS)}, like ${quoted(EXAMPLES.focusOne)} or ${quoted(EXAMPLES.focusTwo)}.`;
  if (tokens.some((t) => t.kind === 'arrow' || t.kind === 'comma')) return fail(form);
  const groups = splitTokens(tokens, 'plus');
  if (groups.length > MAX_PARTNERS) return fail(form);
  const entries: PersonEntry[] = [];
  const warnings: string[] = [];
  for (const group of groups) {
    const read = readEntry(group);
    if (read.kind === 'error') return read;
    if (read.kind === 'empty') return fail(form);
    if (read.kind === 'unknown') return fail(`The focus must name a person, not ${quoted(UNKNOWN)}.`);
    entries.push(read.entry);
    warnings.push(...read.warnings);
  }
  return { kind: 'focus', entries, warnings };
}

/** Reads a `key: value` line (from its comment-free code), or null when the line is not one. */
export function readDirective(code: string): Directive | null {
  const match = DIRECTIVE_LINE.exec(code);
  if (!match) return null;
  const written = clean(match[1]!);
  return { key: written.toLowerCase(), written, value: match[2]! };
}

/** A `title:` value, trimmed and unwrapped when it is one quoted string; null when empty. */
export function readTitle(value: string): string | null {
  const trimmed = value.trim();
  const title = WHOLLY_QUOTED.exec(trimmed)?.[1]?.trim() ?? trimmed;
  return title === '' ? null : title;
}
