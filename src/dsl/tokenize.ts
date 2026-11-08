import { ARROW, ARROW_ALIASES, COMMA, COMMA_ALIASES, COMMENT, DOUBLE_QUOTES, PLUS, SINGLE_QUOTES } from './spec';

/** A lexical piece of one DSL line. `quoted` is the text between trait quotes, without them. */
export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'quoted'; text: string; closed: boolean }
  | { kind: 'plus' }
  | { kind: 'arrow' }
  | { kind: 'comma' };

export type SeparatorKind = 'plus' | 'arrow' | 'comma';

export interface ScannedLine {
  /** The line up to its comment, untrimmed. */
  code: string;
  tokens: Token[];
}

const ARROWS = [ARROW, ...ARROW_ALIASES];
const COMMAS: ReadonlySet<string> = new Set([COMMA, ...COMMA_ALIASES]);
const QUOTES: ReadonlySet<string> = new Set(DOUBLE_QUOTES);
const WORD_CHAR = /[\p{L}\p{N}]/u;
const INVISIBLE = /[\u00ad\u200b\u200e\u200f\u2060\ufeff]/g;
const FENCE_LINE = /^\s*`{3,}[^`]*$/;
const LIST_MARKER = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;

/**
 * Splits DSL text into lines on `\n`, dropping each line's trailing `\r`. The
 * text is NFC-normalized and stripped of invisible characters (soft hyphen,
 * zero-width space, direction marks, BOM) so names typed or pasted differently
 * still match.
 */
export function splitLines(dsl: string): string[] {
  return dsl
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** True for a line that is only a Markdown code fence (three or more backticks, optional language tag). */
export function isFenceLine(line: string): boolean {
  return FENCE_LINE.test(line);
}

/** Drops a Markdown list marker (`- `, `* `, `• `, `1. `, `1) `) from the start of a line; no name or directive starts with one. */
export function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER, '');
}

function startsWord(line: string, index: number): boolean {
  return index === 0 || !WORD_CHAR.test(line[index - 1]!);
}

/** Index of the `’` closing a curly single quote opened before `from`, or -1 (also when a double quote comes first). */
function singleQuoteEnd(line: string, from: number): number {
  for (let i = from; i < line.length; i++) {
    const char = line[i]!;
    if (QUOTES.has(char)) return -1;
    if (char !== SINGLE_QUOTES.close) continue;
    const next = line[i + 1];
    if (next === undefined || !WORD_CHAR.test(next)) return i;
  }
  return -1;
}

/**
 * Cuts the comment off a line and splits the rest into tokens. A `#` or
 * separator inside quotes is plain text; an unclosed quote runs to the end of
 * the line.
 */
export function scanLine(line: string): ScannedLine {
  const tokens: Token[] = [];
  let text = '';
  const flush = (): void => {
    if (text !== '') tokens.push({ kind: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < line.length) {
    const char = line[i]!;
    if (char === COMMENT) break;
    if (QUOTES.has(char)) {
      flush();
      let end = i + 1;
      while (end < line.length && !QUOTES.has(line[end]!)) end++;
      const closed = end < line.length;
      tokens.push({ kind: 'quoted', text: line.slice(i + 1, end), closed });
      i = closed ? end + 1 : end;
      continue;
    }
    if (char === SINGLE_QUOTES.open && startsWord(line, i)) {
      const end = singleQuoteEnd(line, i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ kind: 'quoted', text: line.slice(i + 1, end), closed: true });
        i = end + 1;
        continue;
      }
    }
    if (char === PLUS || COMMAS.has(char)) {
      flush();
      tokens.push({ kind: char === PLUS ? 'plus' : 'comma' });
      i++;
      continue;
    }
    const arrow = ARROWS.find((a) => line.startsWith(a, i));
    if (arrow !== undefined) {
      flush();
      tokens.push({ kind: 'arrow' });
      i += arrow.length;
      continue;
    }
    text += char;
    i++;
  }
  flush();
  return { code: line.slice(0, i), tokens };
}

/** Splits tokens into groups around every separator of `kind` (n separators give n + 1 groups). */
export function splitTokens(tokens: readonly Token[], kind: SeparatorKind): Token[][] {
  const groups: Token[][] = [[]];
  for (const token of tokens) {
    if (token.kind === kind) groups.push([]);
    else groups[groups.length - 1]!.push(token);
  }
  return groups;
}

/** Splits a trait string's text on commas (any accepted comma). */
export function splitList(text: string): string[] {
  const items: string[] = [];
  let item = '';
  for (const char of text) {
    if (COMMAS.has(char)) {
      items.push(item);
      item = '';
    } else {
      item += char;
    }
  }
  items.push(item);
  return items;
}
