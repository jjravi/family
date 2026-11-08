import { describe, expect, it } from 'vitest';
import { isFenceLine, scanLine, splitList, splitLines, splitTokens, stripListMarker, type Token } from '../../src/dsl/tokenize';

const kinds = (tokens: Token[]) => tokens.map((t) => (t.kind === 'text' ? t.text : t.kind === 'quoted' ? `"${t.text}"` : t.kind));

describe('scanLine', () => {
  it('splits a union line into text, quoted traits, and separators', () => {
    expect(scanLine('Rose "kind, warm" + Al -> Mary, Jo').tokens).toEqual([
      { kind: 'text', text: 'Rose ' },
      { kind: 'quoted', text: 'kind, warm', closed: true },
      { kind: 'text', text: ' ' },
      { kind: 'plus' },
      { kind: 'text', text: ' Al ' },
      { kind: 'arrow' },
      { kind: 'text', text: ' Mary' },
      { kind: 'comma' },
      { kind: 'text', text: ' Jo' },
    ]);
  });

  it('cuts the comment at the first # outside quotes', () => {
    expect(scanLine('A + B   # note -> x').code).toBe('A + B   ');
    expect(scanLine('A "x # y, z" # note').code).toBe('A "x # y, z" ');
    expect(scanLine('# only a comment').code).toBe('');
    expect(scanLine('A "#1 dad"').tokens).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'quoted', text: '#1 dad', closed: true },
    ]);
  });

  it('reads every arrow spelling as an arrow and leaves year dashes in the text', () => {
    for (const arrow of ['->', '→', '⟶', '–>', '—>']) {
      expect(kinds(scanLine(`A 1932-2019 ${arrow} B`).tokens)).toEqual(['A 1932-2019 ', 'arrow', ' B']);
    }
    expect(kinds(scanLine('A 1932–2019').tokens)).toEqual(['A 1932–2019']);
  });

  it('reads full-width, ideographic, and Arabic commas as commas', () => {
    expect(kinds(scanLine('A，B、C،D').tokens)).toEqual(['A', 'comma', 'B', 'comma', 'C', 'comma', 'D']);
  });

  it('lets any double quote close any other', () => {
    for (const [open, close] of [['"', '"'], ['“', '”'], ['„', '“'], ['”', '“'], ['"', '”']]) {
      expect(kinds(scanLine(`A ${open}kind${close}`).tokens)).toEqual(['A ', '"kind"']);
    }
  });

  it('runs an unclosed quote to the end of the line, swallowing any #', () => {
    const line = 'A "kind # not a comment';
    expect(scanLine(line)).toEqual({
      code: line,
      tokens: [
        { kind: 'text', text: 'A ' },
        { kind: 'quoted', text: 'kind # not a comment', closed: false },
      ],
    });
  });

  it('opens a curly single quote only at a word start, and closes it only before a non-letter', () => {
    expect(kinds(scanLine('Rose ‘kind, can’t stop’ + Al').tokens)).toEqual(['Rose ', '"kind, can’t stop"', ' ', 'plus', ' Al']);
    expect(kinds(scanLine('Ka‘iulani + O’Brien').tokens)).toEqual(['Ka‘iulani ', 'plus', ' O’Brien']);
    expect(kinds(scanLine('‘Iolani + Mary').tokens)).toEqual(['‘Iolani ', 'plus', ' Mary']);
  });

  it('never closes a curly single quote inside a later double-quoted trait', () => {
    expect(kinds(scanLine('‘Iolani + Kai -> Mia "James’ dog"').tokens)).toEqual([
      '‘Iolani ',
      'plus',
      ' Kai ',
      'arrow',
      ' Mia ',
      '"James’ dog"',
    ]);
  });
});

describe('splitLines', () => {
  it('splits on \\n and drops a trailing \\r, keeping blank lines', () => {
    expect(splitLines('a\r\n\r\nb\nc\r')).toEqual(['a', '', 'b', 'c']);
  });

  it('NFC-normalizes and removes invisible characters', () => {
    expect(splitLines('Ine\u0301s\u200b Kim\u00ad\ufeff')).toEqual(['Inés Kim']);
  });
});

describe('isFenceLine', () => {
  it.each(['```', '```dsl', '  ```text  ', '````', '``` plain text'])('accepts %j', (line) => {
    expect(isFenceLine(line)).toBe(true);
  });

  it.each(['``', '`code`', 'Rose ``` Al', '```a```', 'A -> B'])('rejects %j', (line) => {
    expect(isFenceLine(line)).toBe(false);
  });
});

describe('stripListMarker', () => {
  it.each([
    ['- A + B', 'A + B'],
    ['  * A', 'A'],
    ['• A', 'A'],
    ['1. A', 'A'],
    ['12) focus: A', 'focus: A'],
  ])('strips %j', (line, rest) => {
    expect(stripListMarker(line)).toBe(rest);
  });

  it.each(['-> A', '-2019 A', '*A', '1.A', '1932. A', 'A - B'])('keeps %j', (line) => {
    expect(stripListMarker(line)).toBe(line);
  });
});

describe('splitTokens and splitList', () => {
  it('splits around separators, giving n + 1 groups', () => {
    const tokens = scanLine('A + + B').tokens;
    expect(splitTokens(tokens, 'plus').map(kinds)).toEqual([['A '], [' '], [' B']]);
    expect(splitTokens([], 'comma')).toEqual([[]]);
  });

  it('splits trait text on every accepted comma', () => {
    expect(splitList('a, b，c、d،e')).toEqual(['a', ' b', 'c', 'd', 'e']);
    expect(splitList('')).toEqual(['']);
  });
});
