import { describe, expect, it } from 'vitest';
import { SAMPLE_DSL } from '../../src/dsl/sample';
import { hasFocusLine, isPristineSample, isWholeTree, lineCount, lineRange, treeFromReply, unfence } from '../../src/ui/editor-text';
import { promptMode } from '../../src/ui/prompt';

describe('lineRange', () => {
  const text = 'one\ntwo\n\nfour';

  it('finds the offsets of a 1-based line, without its newline', () => {
    expect(lineRange(text, 1)).toEqual({ start: 0, end: 3 });
    expect(lineRange(text, 2)).toEqual({ start: 4, end: 7 });
    expect(lineRange(text, 3)).toEqual({ start: 8, end: 8 });
    expect(lineRange(text, 4)).toEqual({ start: 9, end: 13 });
  });

  it('returns null outside the text', () => {
    expect(lineRange(text, 0)).toBeNull();
    expect(lineRange(text, 5)).toBeNull();
  });
});

describe('lineCount', () => {
  it('counts lines the way the parser numbers them', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a\nb\n')).toBe(3);
  });
});

describe('unfence (fenced paste)', () => {
  it('strips a code fence wrapping a chatbot reply', () => {
    expect(unfence('```\nA + B -> C\nfocus: C\n```')).toBe('A + B -> C\nfocus: C');
    expect(unfence('\n```text\nfocus: A\n```\n')).toBe('focus: A');
  });

  it('leaves unfenced text and fences inside prose alone', () => {
    expect(unfence('focus: A')).toBeNull();
    expect(unfence('Here you go:\n```\nfocus: A\n```')).toBeNull();
  });
});

describe('prompt mode', () => {
  it('asks for a new tree while the editor is empty or holds the untouched sample', () => {
    expect(isPristineSample(SAMPLE_DSL)).toBe(true);
    expect(promptMode('')).toBe('create');
    expect(promptMode(' \n')).toBe('create');
    expect(promptMode(SAMPLE_DSL)).toBe('create');
  });

  it('asks for an edit once the editor holds the user’s own tree', () => {
    expect(promptMode(`${SAMPLE_DSL}# mine\n`)).toBe('edit');
    expect(promptMode('A -> B\nfocus: B')).toBe('edit');
  });
});

describe('treeFromReply', () => {
  const tree = 'Ann + Bo -> Cy\nfocus: Cy';

  it('takes the first code block out of a chatty reply', () => {
    expect(treeFromReply(`Here is your tree:\n\n\`\`\`text\n${tree}\n\`\`\`\n\nWant any changes?`)).toBe(tree);
    expect(treeFromReply(`\`\`\`\n${tree}\n\`\`\`\n\`\`\`\nsecond\n\`\`\``)).toBe(tree);
  });

  it('accepts longer fences and an empty block', () => {
    expect(treeFromReply(`\`\`\`\`\n${tree}\n\`\`\`\``)).toBe(tree);
    expect(treeFromReply('```\n```')).toBe('');
  });

  it('returns unfenced text unchanged', () => {
    expect(treeFromReply(`${tree}\n`)).toBe(`${tree}\n`);
    expect(treeFromReply('```\nunclosed')).toBe('```\nunclosed');
  });
});

describe('whole trees', () => {
  it('finds a focus line, in any case and indentation', () => {
    expect(hasFocusLine('A -> B\n  Focus : B')).toBe(true);
    expect(hasFocusLine('A -> B # focus: B later')).toBe(false);
  });

  it('is a focus line plus at least one line of people, fenced or not', () => {
    expect(isWholeTree('title: T\nAnn + Bo -> Cy\nfocus: Cy')).toBe(true);
    expect(isWholeTree('Sure!\n```\nAnn -> Cy\nfocus: Cy\n```')).toBe(true);
  });

  it('reads bulleted and numbered replies the way the parser does', () => {
    expect(hasFocusLine('- Ann -> Cy\n- focus: Cy')).toBe(true);
    expect(isWholeTree('1. Ann + Bo -> Cy\n2. focus: Cy')).toBe(true);
  });

  it('is not a lone focus or title line, or people without a focus', () => {
    expect(isWholeTree('focus: Mia')).toBe(false);
    expect(isWholeTree('title: T\n\nfocus: Mia # me\n')).toBe(false);
    expect(isWholeTree('Ann + Bo -> Cy')).toBe(false);
  });
});
