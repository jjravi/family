import { stripCodeFence } from '../dsl/parse';
import { SAMPLE_DSL } from '../dsl/sample';
import { COMMENT, DIRECTIVES } from '../dsl/spec';
import { isFenceLine, splitLines, stripListMarker } from '../dsl/tokenize';

const FOCUS_LINE = new RegExp(`^${DIRECTIVES.focus}\\s*:`, 'i');
const DIRECTIVE_LINE = /^[A-Za-z]+\s*:/;
const FENCED_BLOCK = /^[ \t]*(`{3,})[^`\n]*\n([\s\S]*?)^[ \t]*\1`*[ \t]*$/m;

/** Character offsets of line `line` (1-based) in `text`, without its newline; null when out of range. */
export function lineRange(text: string, line: number): { start: number; end: number } | null {
  if (!Number.isInteger(line) || line < 1) return null;
  let start = 0;
  for (let current = 1; current < line; current++) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) return null;
    start = newline + 1;
  }
  const newline = text.indexOf('\n', start);
  return { start, end: newline === -1 ? text.length : newline };
}

/** Number of lines as the parser counts them (split on `\n`). */
export function lineCount(text: string): number {
  let count = 1;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) count++;
  return count;
}

/** True while the editor holds the untouched sample, which a paste replaces rather than joins. */
export function isPristineSample(text: string): boolean {
  return text === SAMPLE_DSL;
}

/** The text inside a Markdown code fence wrapping all of `text` (as chatbots reply), or null when it is not fenced. */
export function unfence(text: string): string | null {
  const stripped = stripCodeFence(text);
  return stripped === text ? null : stripped;
}

/** The tree in a chatbot reply: its first fenced code block when it has one (replies often wrap it in prose), else the text as is. */
export function treeFromReply(text: string): string {
  const block = FENCED_BLOCK.exec(text);
  return block ? block[2]!.replace(/\s+$/, '') : text;
}

/** The lines the parser reads: no fences, list markers, comments, or blank lines. */
function contentLines(text: string): string[] {
  return splitLines(text)
    .filter((line) => !isFenceLine(line))
    .map((line) => stripListMarker(line).split(COMMENT, 1)[0]!.trim())
    .filter((line) => line !== '');
}

export function hasFocusLine(text: string): boolean {
  return contentLines(text).some((line) => FOCUS_LINE.test(line));
}

/**
 * True when `text` is a complete tree (a `focus:` line plus at least one line
 * of people), as a chatbot reply is. Pasting one over a tree replaces it, since
 * joining two trees can only produce duplicate people and two focus lines.
 */
export function isWholeTree(text: string): boolean {
  const lines = contentLines(treeFromReply(text));
  return lines.some((line) => FOCUS_LINE.test(line)) && lines.some((line) => !DIRECTIVE_LINE.test(line));
}
