import { describe, expect, it } from 'vitest';
import { format } from '../../src/dsl/format';
import { parse, stripCodeFence } from '../../src/dsl/parse';

describe('stripCodeFence', () => {
  it.each([
    ['```\nA -> B\nfocus: B\n```', 'A -> B\nfocus: B'],
    ['```dsl\nA -> B\n```', 'A -> B'],
    ['``` text\nA -> B\n```', 'A -> B'],
    ['\n\n  ```dsl\nA -> B\n  ```  \n\n', 'A -> B'],
    ['````\nA\n```\nB\n````', 'A\n```\nB'],
    ['```\r\nA -> B\r\nfocus: B\r\n```\r\n', 'A -> B\r\nfocus: B'],
    ['```\n\nA -> B\n\n```', '\nA -> B\n'],
    ['```\n```', ''],
  ])('unwraps %j', (text, content) => {
    expect(stripCodeFence(text)).toBe(content);
  });

  it.each([
    'A -> B\nfocus: B',
    'Here is your tree:\n```\nA -> B\n```',
    '```\nA -> B\n```\nLet me know if you need changes.',
    '```\nA -> B',
    '````\nA -> B\n```',
    '```',
    '',
  ])('leaves %j unchanged', (text) => {
    expect(stripCodeFence(text)).toBe(text);
  });

  it('gives text the parser reads like the fenced original, one line higher', () => {
    const fenced = '```dsl\ntitle: T\nA + B -> C\nfocus: C\n```\n';
    const stripped = parse(stripCodeFence(fenced));
    expect(parse(fenced).diagnostics).toEqual([]);
    expect(stripped.diagnostics).toEqual([]);
    expect(format(stripped.tree)).toBe(format(parse(fenced).tree));
    expect(stripped.tree.unions[0]?.sourceLine).toBe(parse(fenced).tree.unions[0]!.sourceLine - 1);
  });
});
