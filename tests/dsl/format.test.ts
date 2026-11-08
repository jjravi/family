import { describe, expect, it } from 'vitest';
import { format } from '../../src/dsl/format';
import { parse } from '../../src/dsl/parse';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import type { Tree } from '../../src/model/types';
import { person, tree, union } from '../fixtures/build';
import { exampleTree } from '../fixtures/example-tree';
import { sampleTree } from '../fixtures/sample-tree';
import { prng, randomTree } from './random-tree';

/** The tree without sourceLine values (a round trip renumbers lines), with persons as ordered entries. */
function withoutLines(t: Tree) {
  return {
    title: t.title,
    focus: t.focus,
    persons: [...t.persons].map(([id, p]) => [id, { ...p, sourceLine: 0 }]),
    unions: t.unions.map((u) => ({ ...u, sourceLine: 0 })),
  };
}

const errorsOf = (dsl: string) => parse(dsl).diagnostics.filter((d) => d.severity === 'error');

describe('format on the fixtures', () => {
  it('writes the example tree canonically, with details at first appearance', () => {
    expect(format(exampleTree())).toBe(`title: The Kim & Ruiz Family

Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955 "warm, Godly", John 1958
Mary + Tom Park 1952 -> Sarah 1980, Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965
Mary + ? -> Ana 1990
John -> Leo 1988

focus: Sarah + Dave Ruiz 1979 "loyal, curious"
`);
  });

  it('writes the sample tree canonically, with c1927 and no implied union', () => {
    expect(format(sampleTree())).toBe(`title: The Kim & Ruiz Family

Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955 "warm, Godly", John 1958
Mary + Tom Park 1952 "patient, wry" -> Sarah 1980 "brave, curious", Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965
Mary + ? -> Ana 1990
John -> Leo 1988
Grace Park 1929-2015 "gentle, wise" + Sam Park c1927-2008 "bold, generous" -> Tom Park
Inés Vega 1931-2020 "fierce, devout" + Luis Vega 1928-1999 "quiet, kind" -> Elena 1954 "bright, devoted"
Rita Ruiz 1929-2018 "lively, proud" + Jorge Ruiz 1927-2012 "hardy, honest" -> Carlos Ruiz 1951 "witty, loyal"
Elena + Carlos Ruiz -> Dave Ruiz 1979 "loyal, curious", Lucia 1984
Sarah + Dave Ruiz -> Mia 2010 "sunny, artsy", Noah 2013 "playful, kind"

focus: Sarah + Dave Ruiz
`);
  });

  it.each([
    { label: 'example', fixture: exampleTree, dsl: EXAMPLE_DSL },
    { label: 'sample', fixture: sampleTree, dsl: SAMPLE_DSL },
  ])('round-trips the $label tree through parse with no diagnostics', ({ fixture, dsl }) => {
    const reparsed = parse(format(fixture()));
    expect(reparsed.diagnostics).toEqual([]);
    expect(withoutLines(reparsed.tree)).toEqual(withoutLines(fixture()));
    expect(format(parse(dsl).tree)).toBe(format(fixture()));
  });
});

describe('format details', () => {
  it('writes @n on every mention of a shared name, Name@1 for the first person', () => {
    const t = parse(`John Kim 1950 + Ann -> Mary
John Kim@2 1980 + Beth -> Tom
John Kim 1980 -> Leo
focus: Mary + Tom
`).tree;
    expect(format(t)).toBe(`John Kim@1 1950 + Ann -> Mary
John Kim@2 1980 + Beth -> Tom
John Kim@2 -> Leo

focus: Mary + Tom
`);
  });

  it('keeps a suffix id even when nobody else has the name', () => {
    const t = tree({
      title: null,
      persons: [person('Ana', 1, { id: 'Ana@2', birth: 1990 }), person('Bo', 1)],
      unions: [union('u0', ['Ana@2', 'Bo'], [], 1)],
      focus: ['Ana@2'],
    });
    expect(format(t)).toBe('Ana@2 1990 + Bo\n\nfocus: Ana@2\n');
    expect(withoutLines(parse(format(t)).tree)).toEqual(withoutLines(t));
  });

  it('writes approximate, death-only, and old years the parser reads back', () => {
    const t = tree({
      title: null,
      persons: [
        person('A', 1, { birth: 1900, birthApprox: true, death: 1970, deathApprox: true }),
        person('B', 1, { death: 1999 }),
        person('C', 1, { birth: 742 }),
      ],
      unions: [union('u0', ['A', 'B'], ['C'], 1)],
      focus: ['C'],
    });
    expect(format(t)).toBe('A c1900-c1970 + B -1999 -> C 0742\n\nfocus: C\n');
    expect(withoutLines(parse(format(t)).tree)).toEqual(withoutLines(t));
  });

  it('gives people outside every union line a line of their own, in insertion order', () => {
    const dsl = `Lone 1950 "quiet"
A
Second
A + B -> C
focus: C
`;
    const t = parse(dsl).tree;
    expect(format(t)).toBe('Lone 1950 "quiet"\nA\nSecond\nA + B -> C\n\nfocus: C\n');
    expect([...parse(format(t)).tree.persons.keys()]).toEqual(['Lone', 'A', 'Second', 'B', 'C']);
  });

  it('lets the focus line introduce the partner it created, and drops the implied union line', () => {
    const t = parse('Mary -> Sarah\nfocus: Dave 1979 "kind" + Sarah\n').tree;
    expect(t.unions.at(-1)?.implied).toBe(true);
    expect(format(t)).toBe('Mary -> Sarah\n\nfocus: Dave 1979 "kind" + Sarah\n');
  });

  it('writes a single-focus person who is in no union on a line of their own', () => {
    const t = tree({ title: null, persons: [person('Solo', 1, { birth: 2000 })], unions: [], focus: ['Solo'] });
    expect(format(t)).toBe('Solo 2000\n\nfocus: Solo\n');
    expect(withoutLines(parse(format(t)).tree)).toEqual(withoutLines(t));
  });

  it.each(['Family #1', '"Best" family', 'The “Kim” Family', 'A: B', '  spaced  '.trim()])('keeps the title %j', (title) => {
    const t = tree({ title, persons: [person('A', 1)], unions: [union('u0', ['A', null], [], 1)], focus: ['A'] });
    expect(parse(format(t)).tree.title).toBe(title);
  });

  it('quotes a title only when it must', () => {
    const base = { persons: [person('A', 1)], unions: [union('u0', ['A', null], [], 1)], focus: ['A'] };
    expect(format(tree({ ...base, title: 'Family #1' })).split('\n')[0]).toBe('title: "Family #1"');
    expect(format(tree({ ...base, title: 'The Kims' })).split('\n')[0]).toBe('title: The Kims');
  });

  it('formats an empty tree as an empty string', () => {
    expect(format({ persons: new Map(), unions: [], focus: [], title: null })).toBe('');
  });

  it('writes unknown partners as ?, in their written position', () => {
    const t = parse('? + Mary -> Ana\n? -> Bo\n? + ? -> Cy, Di\nfocus: Ana\n').tree;
    expect(format(t)).toBe('? + Mary -> Ana\n? -> Bo\n? + ? -> Cy, Di\n\nfocus: Ana\n');
  });
});

describe('parse(format(parse(x))) equals parse(x)', () => {
  const cases: Record<string, string> = {
    remarriage: 'Al 1930 + Rose -> Mary\nAl + Betty 1940 -> Carl\nfocus: Mary',
    'curly quotes and comments': 'Rose “kind, warm” + Al -> Mary   # note\n# whole-line comment\nfocus: Mary',
    'later details': 'Rose + Al -> Mary\nMary 1955 "warm" + Tom -> Sarah\nRose 1932-2019\nfocus: Sarah',
    'birth-year disambiguation': 'John 1950 -> Amy\nJohn@2 1980 -> Ben\nJohn 1980 + Cat -> Dan\nfocus: Amy',
    'en dashes, ISO dates, fences, CRLF': '```dsl\r\nRose 1932-05-14–2019 + Al c1930 — 2001 → Mary\r\n```\r\nfocus: Mary\r\n',
    'unconnected people': 'A + B -> C\nX + Y -> Z\nfocus: C',
    'Unicode and suffixes': 'Zoë@2 + 李娜 -> Søren\nZoë 1950 -> Ḥasan\nfocus: Søren + Ḥasan',
  };
  it.each(Object.entries(cases))('%s', (_label, dsl) => {
    const first = parse(dsl);
    const second = parse(format(first.tree));
    expect(second.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(withoutLines(second.tree)).toEqual(withoutLines(first.tree));
  });
});

describe('round-trip property on random trees', () => {
  const SEEDS = 600;
  it(`parse(format(tree)) reproduces ${SEEDS} seeded random trees`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const t = randomTree(prng(seed));
      const text = format(t);
      const reparsed = parse(text);
      const context = `seed ${seed}:\n${text}`;
      expect(reparsed.diagnostics.filter((d) => d.severity === 'error'), context).toEqual([]);
      expect(withoutLines(reparsed.tree), context).toEqual(withoutLines(t));
      expect(format(reparsed.tree), context).toBe(text);
    }
  });

  it('generates trees that exercise the tricky cases', () => {
    const trees = Array.from({ length: SEEDS }, (_, i) => randomTree(prng(i + 1)));
    const persons = trees.flatMap((t) => [...t.persons.values()]);
    expect(persons.some((p) => p.id.includes('@'))).toBe(true);
    expect(persons.some((p) => p.birthApprox || p.deathApprox)).toBe(true);
    expect(persons.some((p) => /[^\x00-\x7f]/.test(p.name))).toBe(true);
    expect(trees.some((t) => t.unions.some((u) => u.implied))).toBe(true);
    expect(trees.some((t) => t.unions.some((u) => u.partners.includes(null)))).toBe(true);
    expect(trees.some((t) => t.title?.includes('#'))).toBe(true);
    expect(trees.some((t) => [...t.persons.keys()].some((id) => !t.unions.some((u) => u.partners.includes(id) || u.children.includes(id))))).toBe(true);
  });
});

describe('round-trip property on random DSL text', () => {
  const NAMES = ['Rose', 'Al Kim', 'Mary', 'Zoë', '李娜', 'O’Brien', '‘Iolani', 'Mary C', 'Kai'];
  const YEARS = ['', '', ' 1932', ' c1932-2019', ' -2019', ' 1932 – 2019', ' (1950)', ' 1932-05-14', ' 1932-'];
  const TRAITS = ['', '', ' "kind, warm"', ' “brave”', ' ‘calm, can’t stop’', ' "a, b, c, d"', ' "#1 dad"'];

  function randomDsl(random: () => number): string {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const entry = (): string => `${pick(NAMES)}${random() < 0.15 ? `@${1 + Math.floor(random() * 3)}` : ''}${pick(YEARS)}${pick(TRAITS)}`;
    const lines: string[] = [];
    if (random() < 0.5) lines.push(pick(['title: The Kims', 'title: "Family #1"', 'Title: Kim: Ruiz']));
    for (let i = Math.floor(random() * 8); i >= 0; i--) {
      const partners = random() < 0.2 ? [entry()] : [random() < 0.2 ? '?' : entry(), random() < 0.2 ? '?' : entry()];
      const children = Array.from({ length: Math.floor(random() * 3) }, entry);
      const arrow = pick([' -> ', ' → ']);
      const comment = random() < 0.2 ? '  # note' : '';
      lines.push(`${partners.join(' + ')}${children.length > 0 ? arrow + children.join(', ') : ''}${comment}`);
    }
    lines.push(`focus: ${random() < 0.5 ? entry() : `${entry()} + ${entry()}`}`);
    return lines.join(random() < 0.2 ? '\r\n' : '\n');
  }

  it('parse(format(parse(x).tree)) equals parse(x).tree, errors or not', () => {
    const random = prng(7);
    const CASES = 1500;
    let clean = 0;
    for (let i = 0; i < CASES; i++) {
      const dsl = randomDsl(random);
      const first = parse(dsl);
      const text = format(first.tree);
      const second = parse(text);
      const context = `case ${i}:\n${dsl}\n--- formatted:\n${text}`;
      expect(withoutLines(second.tree), context).toEqual(withoutLines(first.tree));
      expect(format(second.tree), context).toBe(text);
      if (!first.diagnostics.some((d) => d.severity === 'error')) {
        clean++;
        expect(second.diagnostics.filter((d) => d.severity === 'error'), context).toEqual([]);
      }
    }
    expect(clean).toBeGreaterThan(100);
    expect(CASES - clean).toBeGreaterThan(100);
  });
});

describe('format output is valid for the parser', () => {
  it('never produces errors for parse-produced trees with warnings', () => {
    const dsl = 'A "a, b, c, d" + B -> C\nC 1990 + D\nfocus: D';
    expect(errorsOf(format(parse(dsl).tree))).toEqual([]);
  });
});
