import { describe, expect, it } from 'vitest';
import { parse } from '../../src/dsl/parse';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import type { Diagnostic, Tree } from '../../src/model/types';
import { person, tree, union } from '../fixtures/build';
import { exampleTree } from '../fixtures/example-tree';
import { sampleTree } from '../fixtures/sample-tree';
import { prng } from './random-tree';

const lines = (...text: string[]): string => text.join('\n');

/** Deep equality plus person key order, which toEqual ignores for Maps. */
function expectTree(actual: Tree, expected: Tree): void {
  expect(actual).toEqual(expected);
  expect([...actual.persons.keys()]).toEqual([...expected.persons.keys()]);
}

const errors = (diagnostics: Diagnostic[]) => diagnostics.filter((d) => d.severity === 'error');
const warnings = (diagnostics: Diagnostic[]) => diagnostics.filter((d) => d.severity === 'warning');

describe.each([
  { label: 'EXAMPLE_DSL', dsl: EXAMPLE_DSL, fixture: exampleTree },
  { label: 'SAMPLE_DSL', dsl: SAMPLE_DSL, fixture: sampleTree },
])('parse($label)', ({ dsl, fixture }) => {
  it('returns the fixture tree, in person order, with no diagnostics', () => {
    const { tree: parsed, diagnostics } = parse(dsl);
    expect(diagnostics).toEqual([]);
    expectTree(parsed, fixture());
  });
});

describe('spec fixtures', () => {
  it('remarriage: the same name is the same person', () => {
    const result = parse(lines('Al Kim 1930 + Rose -> Mary', 'Al Kim + Betty Lee 1940 -> Carl', 'focus: Mary'));
    expect(result.diagnostics).toEqual([]);
    expectTree(
      result.tree,
      tree({
        title: null,
        persons: [person('Al Kim', 1, { birth: 1930 }), person('Rose', 1), person('Mary', 1), person('Betty Lee', 2, { birth: 1940 }), person('Carl', 2)],
        unions: [union('u0', ['Al Kim', 'Rose'], ['Mary'], 1), union('u1', ['Al Kim', 'Betty Lee'], ['Carl'], 2)],
        focus: ['Mary'],
      }),
    );
  });

  it('unknown partner: ? keeps its written position', () => {
    const result = parse(lines('Mary + ? -> Ana 1990', '? + Mary -> Bo', 'focus: Ana'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions).toEqual([union('u0', ['Mary', null], ['Ana'], 1), union('u1', [null, 'Mary'], ['Bo'], 2)]);
  });

  it('single parent: A -> C gives one partner', () => {
    const result = parse(lines('John 1958 -> Leo 1988', 'focus: Leo'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions).toEqual([union('u0', ['John'], ['Leo'], 1)]);
    expect(result.tree.persons.get('Leo')?.birth).toBe(1988);
  });

  it('curly quotes: double and single, in any pairing', () => {
    const result = parse(lines('Rose “kind, passionate” + Al ‘steady, funny’ -> Mary „warm“, Bo ”loud, proud“', 'focus: Mary'));
    expect(result.diagnostics).toEqual([]);
    const traits = Object.fromEntries([...result.tree.persons].map(([id, p]) => [id, p.traits]));
    expect(traits).toEqual({ Rose: ['kind', 'passionate'], Al: ['steady', 'funny'], Mary: ['warm'], Bo: ['loud', 'proud'] });
  });

  it('trailing comments: ignored, but # inside quotes is text', () => {
    const result = parse(
      lines(
        'Rose + Al -> Mary    # comment with "quotes", + and -> arrows',
        '# a whole-line comment: title: nope',
        'Al "#1 dad, funny" -> Bo # real comment',
        'focus: Mary # who the chart centers on',
      ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.title).toBeNull();
    expect(result.tree.persons.get('Al')?.traits).toEqual(['#1 dad', 'funny']);
    expect(result.tree.unions.map((u) => u.children)).toEqual([['Mary'], ['Bo']]);
  });

  it('name collision with @2', () => {
    const result = parse(lines('John Kim 1950 + Ann -> Mary', 'John Kim@2 1980 + Beth -> Tom', 'John Kim@2 -> Leo', 'focus: Mary + Tom'));
    expect(result.diagnostics).toEqual([]);
    expectTree(
      result.tree,
      tree({
        title: null,
        persons: [
          person('John Kim', 1, { birth: 1950 }),
          person('Ann', 1),
          person('Mary', 1),
          person('John Kim', 2, { id: 'John Kim@2', birth: 1980 }),
          person('Beth', 2),
          person('Tom', 2),
          person('Leo', 3),
        ],
        unions: [
          union('u0', ['John Kim', 'Ann'], ['Mary'], 1),
          union('u1', ['John Kim@2', 'Beth'], ['Tom'], 2),
          union('u2', ['John Kim@2'], ['Leo'], 3),
          union('u3', ['Mary', 'Tom'], [], 4, true),
        ],
        focus: ['Mary', 'Tom'],
      }),
    );
  });

  it('name collision disambiguated by birth year', () => {
    const result = parse(
      lines('John Kim 1950 + Ann -> Mary', 'John Kim@2 1980 + Beth -> Tom', 'John Kim 1980 -> Leo', 'John Kim 1950 + Cy -> Sue', 'focus: Mary + Tom'),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions.slice(2, 4)).toEqual([union('u2', ['John Kim@2'], ['Leo'], 3), union('u3', ['John Kim', 'Cy'], ['Sue'], 4)]);
  });

  it('details given on a later mention fill in missing fields', () => {
    const result = parse(lines('Rose + Al -> Mary', 'Rose c1932-2019 "kind" + Ed -> Bo', 'Mary 1955', 'focus: Mary'));
    expect(errors(result.diagnostics)).toEqual([]);
    expect(result.tree.persons.get('Rose')).toEqual(person('Rose', 1, { birth: 1932, birthApprox: true, death: 2019, traits: ['kind'] }));
    expect(result.tree.persons.get('Mary')).toEqual(person('Mary', 1, { birth: 1955 }));
    expect(result.tree.unions).toHaveLength(2);
  });

  it('a child in two unions is an error on the second line', () => {
    const result = parse(lines('Rose + Al -> Mary', 'Ann + Bob -> Mary, Jo', 'focus: Mary'));
    expect(result.diagnostics).toEqual([
      {
        line: 2,
        severity: 'error',
        message:
          '"Mary" is already a child on line 1; a person can be a child in only one union. If these are two different people with the same name, write the other one as "Mary@2".',
      },
    ]);
    expect(result.tree.unions[1]).toEqual(union('u1', ['Ann', 'Bob'], ['Jo'], 2));
  });

  it('missing focus is an error on line 0', () => {
    const result = parse('Rose + Al -> Mary\n');
    expect(result.diagnostics).toEqual([
      {
        line: 0,
        severity: 'error',
        message: 'Add a focus line naming who the chart centers on, like "focus: Rose", or two people joined by "+" for a couple.',
      },
    ]);
    expect(result.tree.focus).toEqual([]);
    expect(result.tree.persons.size).toBe(3);
  });

  it('missing focus in an empty document explains the format', () => {
    for (const dsl of ['', '  \n# only a comment\n```\n```']) {
      const result = parse(dsl);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ line: 0, severity: 'error' });
      expect(result.diagnostics[0]!.message).toMatch(/^Nothing to draw yet\./);
    }
  });

  it('4 traits: warning, the first 3 are kept', () => {
    const result = parse(lines('Rose "kind, passionate, wise, loud" -> Mary', 'focus: Mary'));
    expect(result.tree.persons.get('Rose')?.traits).toEqual(['kind', 'passionate', 'wise']);
    expect(result.diagnostics).toEqual([
      { line: 1, severity: 'warning', message: '"Rose" has 4 traits; only the first 3 are kept (dropped: "loud").' },
    ]);
  });
});

describe('years', () => {
  const yearsOf = (entry: string) => {
    const result = parse(lines(`${entry} -> Kid`, 'focus: Kid'));
    expect(errors(result.diagnostics), entry).toEqual([]);
    const p = [...result.tree.persons.values()][0]!;
    return { name: p.name, birth: p.birth, birthApprox: p.birthApprox, death: p.death, deathApprox: p.deathApprox };
  };

  it.each([
    ['Rose 1932-2019', 1932, false, 2019, false],
    ['Rose 1932', 1932, false, null, false],
    ['Rose 1932-', 1932, false, null, false],
    ['Rose -2019', null, false, 2019, false],
    ['Rose c1932', 1932, true, null, false],
    ['Rose 1932-c2019', 1932, false, 2019, true],
    ['Rose c1932-c2019', 1932, true, 2019, true],
    ['Rose -c2019', null, false, 2019, true],
    ['Rose C.1932', 1932, true, null, false],
    ['Rose ca.1932', 1932, true, null, false],
    ['Rose 1932–2019', 1932, false, 2019, false],
    ['Rose 1932—2019', 1932, false, 2019, false],
    ['Rose 1932 – 2019', 1932, false, 2019, false],
    ['Rose 1932 -2019', 1932, false, 2019, false],
    ['Rose 1932 –', 1932, false, null, false],
    ['Rose – 2019', null, false, 2019, false],
    ['Rose 1932-05-14', 1932, false, null, false],
    ['Rose 1932-05', 1932, false, null, false],
    ['Rose 1932-05-14-2019-03-01', 1932, false, 2019, false],
    ['Rose 1932-05-14–2019-03-01', 1932, false, 2019, false],
    ['Rose 1932-12-2019', 1932, false, 2019, false],
    ['Rose -2019-03-01', null, false, 2019, false],
    ['Rose c1932-05-14', 1932, true, null, false],
    ['Rose (1932-2019)', 1932, false, 2019, false],
    ['Rose [1932 – 2019]', 1932, false, 2019, false],
  ])('%s', (entry, birth, birthApprox, death, deathApprox) => {
    expect(yearsOf(entry)).toEqual({ name: 'Rose', birth, birthApprox, death, deathApprox });
  });

  it('keeps initials and hyphenated names out of the years', () => {
    expect(yearsOf('Mary C 1950')).toMatchObject({ name: 'Mary C', birth: 1950, birthApprox: false });
    expect(yearsOf('Mary C. 1950')).toMatchObject({ name: 'Mary C.', birth: 1950 });
    expect(yearsOf('Mary-Jane 1950-2001')).toMatchObject({ name: 'Mary-Jane', birth: 1950, death: 2001 });
    expect(yearsOf('Anne (Nan) 1950')).toMatchObject({ name: 'Anne (Nan)', birth: 1950 });
  });

  it.each([
    ['Rose 1932/05/14', '"1932/05/14" is not a year format this understands.'],
    ['Rose 19322', '"19322" is not a year format this understands.'],
    ['Rose 1932-13-01', '"1932-13-01" is not a year format this understands.'],
    ['Rose ~1932', '"~1932" is not a year format this understands.'],
    ['Mary 1955 Smith', '"Mary 1955 Smith" has years inside the name. Write the name first, then the years, like "Mary Smith 1955".'],
    ['Al 1930 2001', 'Put a dash between the birth and death years, like "1930-2001".'],
    ['Rose -', `A dash on its own can't be part of a name ("Rose -").`],
  ])('rejects %s', (entry, message) => {
    const lineErrors = errors(parse(lines(`${entry} -> Kid`, 'focus: Kid')).diagnostics).filter((d) => d.line === 1);
    expect(lineErrors).toHaveLength(1);
    expect(lineErrors[0]!.message).toContain(message);
  });

  it('warns when the death year comes before the birth year', () => {
    const result = parse(lines('Rose 1980-1950 -> Kid', 'focus: Kid'));
    expect(result.diagnostics).toEqual([
      { line: 1, severity: 'warning', message: '"Rose" has a death year (1950) before the birth year (1980); check the years.' },
    ]);
  });
});

describe('chatbot formatting', () => {
  const expected = () =>
    tree({
      title: 'Kim',
      persons: [person('Rose Kim', 3, { birth: 1932, death: 2019, traits: ['kind'] }), person('Al', 3), person('Mary', 3)],
      unions: [union('u0', ['Rose Kim', 'Al'], ['Mary'], 3)],
      focus: ['Mary'],
    });

  it('reads a fenced block with the fence lines as blank lines', () => {
    const result = parse('```dsl\ntitle: Kim\nRose Kim 1932-2019 "kind" + Al -> Mary\nfocus: Mary\n```\n');
    expect(result.diagnostics).toEqual([]);
    expectTree(result.tree, tree({ ...expected(), persons: [...expected().persons.values()].map((p) => ({ ...p, sourceLine: 3 })) }));
  });

  it('reads CRLF line endings like LF', () => {
    const lf = 'title: Kim\n\nRose Kim 1932-2019 "kind" + Al -> Mary\nfocus: Mary\n';
    const crlf = parse(lf.replaceAll('\n', '\r\n'));
    expect(crlf).toEqual(parse(lf));
    expect(crlf.diagnostics).toEqual([]);
    expectTree(crlf.tree, expected());
  });

  it('accepts tabs, non-breaking spaces, indentation, and invisible characters', () => {
    const result = parse('Title:\tKim\n\n\t  Rose\u00a0\u00a0Kim\t1932-2019\u00a0"kind" +\tAl\u200b -> Mary\n    FOCUS : Mary');
    expect(result.diagnostics).toEqual([]);
    expectTree(result.tree, expected());
  });

  it('ignores Markdown list markers at the start of a line', () => {
    const result = parse('- title: Kim\n\n1. Rose Kim 1932-2019 "kind" + Al -> Mary\n* focus: Mary');
    expect(result.diagnostics).toEqual([]);
    expectTree(result.tree, expected());
  });

  it.each(['→', '⟶', '–>', '—>'])('reads %s as ->', (arrow) => {
    const result = parse(`title: Kim\n\nRose Kim 1932-2019 "kind" + Al ${arrow} Mary\nfocus: Mary`);
    expect(result.diagnostics).toEqual([]);
    expectTree(result.tree, expected());
  });

  it('reads full-width and ideographic commas between children', () => {
    const result = parse('王伟 + 李娜 -> 王明，王芳、王强\nfocus: 王明');
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions[0]?.children).toEqual(['王明', '王芳', '王强']);
  });

  it('treats NFC and NFD spellings of a name as the same person', () => {
    const result = parse('Ine\u0301s + Al -> Mary\nInés 1931 -> Bo\nfocus: Mary');
    expect(result.diagnostics).toEqual([]);
    expect([...result.tree.persons.keys()]).toEqual(['Inés', 'Al', 'Mary', 'Bo']);
    expect(result.tree.persons.get('Inés')?.birth).toBe(1931);
  });

  it('keeps apostrophes in names: O’Brien, D\'Angelo, Ka‘iulani', () => {
    const result = parse("O’Brien + D'Angelo -> Ka‘iulani 1875, ‘Iolani\nfocus: Ka‘iulani");
    expect(result.diagnostics).toEqual([]);
    expect([...result.tree.persons.keys()]).toEqual(['O’Brien', "D'Angelo", 'Ka‘iulani', '‘Iolani']);
  });

  it('keeps an apostrophe inside single-quoted traits', () => {
    const result = parse('Rose ‘kind, can’t stop’ -> Mary\nfocus: Mary');
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.get('Rose')?.traits).toEqual(['kind', 'can’t stop']);
  });

  it('trims trait items, collapses their spaces, and drops empty ones', () => {
    const result = parse('Rose "  very\t kind ,, , funny,  " -> Mary\nfocus: Mary');
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.get('Rose')?.traits).toEqual(['very kind', 'funny']);
  });

  it('warns about a trait longer than 14 characters and keeps it', () => {
    const result = parse('Rose "extraordinarily kind" -> Mary\nfocus: Mary');
    expect(result.tree.persons.get('Rose')?.traits).toEqual(['extraordinarily kind']);
    expect(result.diagnostics).toEqual([
      { line: 1, severity: 'warning', message: 'The trait "extraordinarily kind" is longer than 14 characters and may not fit on the poster.' },
    ]);
  });

  it('counts trait length in characters, not UTF-16 units', () => {
    expect(parse('Rose "😀😀😀😀😀😀😀😀😀😀😀😀😀😀" -> Mary\nfocus: Mary').diagnostics).toEqual([]);
  });
});

describe('directives', () => {
  it('unwraps a quoted title and keeps # inside it', () => {
    expect(parse('title: "The Kim Family #1"\nA -> B\nfocus: B').tree.title).toBe('The Kim Family #1');
    expect(parse('title: The Kim Family # a comment\nA -> B\nfocus: B').tree.title).toBe('The Kim Family');
    expect(parse('title: Kim: A Family\nA -> B\nfocus: B').tree.title).toBe('Kim: A Family');
  });

  it('uses the first title and warns about later ones; an empty title is ignored', () => {
    const result = parse(lines('title:', 'title: First', 'A -> B', 'title: Second', 'focus: B'));
    expect(result.tree.title).toBe('First');
    expect(result.diagnostics).toEqual([
      { line: 4, severity: 'warning', message: 'Only one title is used: the one on line 2. This line is ignored.' },
    ]);
  });

  it('warns about an unknown directive and ignores the line', () => {
    const result = parse(lines('Layout: fan', 'A -> B', 'focus: B'));
    expect(result.tree.persons.size).toBe(2);
    expect(result.diagnostics).toEqual([
      {
        line: 1,
        severity: 'warning',
        message: 'Unknown directive "Layout:"; this line is ignored. The directives are "title:" and "focus:"; layout and colors are chosen in the options bar.',
      },
    ]);
  });

  it('allows directives anywhere in the file', () => {
    const result = parse(lines('focus: B', 'A -> B', 'title: Late'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree).toMatchObject({ focus: ['B'], title: 'Late' });
  });
});

describe('focus', () => {
  it('creates a new partner on a couple focus line, with an implied union', () => {
    const result = parse(lines('Mary + Tom -> Sarah 1980', 'focus: Sarah + Dave Ruiz 1979 "loyal, curious"'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.get('Dave Ruiz')).toEqual(person('Dave Ruiz', 2, { birth: 1979, traits: ['loyal', 'curious'] }));
    expect([...result.tree.persons.keys()].at(-1)).toBe('Dave Ruiz');
    expect(result.tree.unions.at(-1)).toEqual(union('u1', ['Sarah', 'Dave Ruiz'], [], 2, true));
    expect(result.tree.focus).toEqual(['Sarah', 'Dave Ruiz']);
  });

  it('creates the unknown name even when it comes first, keeping focus order', () => {
    const result = parse(lines('Mary -> Sarah', 'focus: Dave + Sarah'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions.at(-1)).toEqual(union('u1', ['Dave', 'Sarah'], [], 2, true));
  });

  it('adds no implied union when a union line joins the pair, in either order', () => {
    for (const focus of ['focus: Rose + Al', 'focus: Al + Rose']) {
      const result = parse(lines('Rose + Al -> Mary', focus));
      expect(result.diagnostics).toEqual([]);
      expect(result.tree.unions).toEqual([union('u0', ['Rose', 'Al'], ['Mary'], 1)]);
    }
  });

  it('appends an implied union for an unjoined pair, after every union line', () => {
    const result = parse(lines('focus: Mary + Bo', 'Rose -> Mary', 'Tom -> Bo'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions).toEqual([union('u0', ['Rose'], ['Mary'], 2), union('u1', ['Tom'], ['Bo'], 3), union('u2', ['Mary', 'Bo'], [], 1, true)]);
  });

  it('fills missing details from the focus line and warns about conflicting ones', () => {
    const result = parse(lines('Rose 1930 -> Mary', 'focus: Mary 1955 "warm" + Rose 1931'));
    expect(result.tree.persons.get('Mary')).toMatchObject({ birth: 1955, traits: ['warm'] });
    expect(result.tree.persons.get('Rose')?.birth).toBe(1930);
    expect(result.diagnostics).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: '"Rose" already has birth year 1930 (line 1), so 1931 is ignored. If these are two different people with the same name, write the other one as "Rose@2".',
      },
    ]);
  });

  it('reports a single focus name that matches nobody', () => {
    const result = parse(lines('Rose -> Mary', 'focus: Marry'));
    expect(result.tree.focus).toEqual([]);
    expect(result.diagnostics).toEqual([
      { line: 2, severity: 'error', message: 'The focus "Marry" is not in the tree. Check the spelling, or add them to a line above.' },
    ]);
  });

  it('points at earlier errors when the focus was on a skipped line', () => {
    const result = parse(lines('Rose 1932/05/14 -> Kid', 'focus: Kid'));
    expect(result.diagnostics.map((d) => [d.line, d.severity])).toEqual([
      [1, 'error'],
      [2, 'error'],
    ]);
    expect(result.diagnostics[1]!.message).toBe(
      'The focus "Kid" is not in the tree. Check the spelling, or add them to a line above. A line with an error is skipped, so fix those first.',
    );
  });

  it('reports both names of a couple focus when neither matches', () => {
    const result = parse(lines('Rose -> Mary', 'focus: Ann + Bo'));
    expect(errors(result.diagnostics).map((d) => d.message)).toEqual([
      'The focus "Ann" is not in the tree. Check the spelling, or add them to a line above.',
      'The focus "Bo" is not in the tree. Check the spelling, or add them to a line above.',
    ]);
    expect(result.tree.persons.size).toBe(2);
  });

  it('lets a focus line that is the whole tree introduce its people', () => {
    const one = parse('focus: Ann 1950 "kind"');
    expect(one.diagnostics).toEqual([]);
    expect(one.tree.focus).toEqual(['Ann']);
    expect(one.tree.persons.get('Ann')).toMatchObject({ birth: 1950, traits: ['kind'], sourceLine: 1 });
    const couple = parse(lines('title: Us', '# just the two of us', 'focus: Ann + Bo'));
    expect(couple.diagnostics).toEqual([]);
    expect(couple.tree.focus).toEqual(['Ann', 'Bo']);
    expect(couple.tree.unions).toEqual([{ id: 'u0', partners: ['Ann', 'Bo'], children: [], sourceLine: 3, implied: true }]);
    expect(parse('focus: Ann + Ann').diagnostics.map((d) => d.message)).toEqual([
      'The focus names "Ann" twice. Name one person, or two different people joined by "+".',
    ]);
  });

  it.each([
    ['focus: Mary + ?', 'The focus must name a person, not "?".'],
    ['focus: Mary -> Bo', 'The focus line takes one name, or two joined by "+", like "focus: Name" or "focus: Name + Name".'],
    ['focus: Mary, Rose', 'The focus line takes one name, or two joined by "+", like "focus: Name" or "focus: Name + Name".'],
    ['focus:', 'The focus line takes one name, or two joined by "+", like "focus: Name" or "focus: Name + Name".'],
    ['focus: Mary + Rose + Al', 'The focus line takes one name, or two joined by "+", like "focus: Name" or "focus: Name + Name".'],
    ['focus: Mary + Mary', 'The focus names "Mary" twice. Name one person, or two different people joined by "+".'],
  ])('rejects %j', (focus, message) => {
    const result = parse(lines('Rose + Al -> Mary', focus));
    expect(result.diagnostics).toEqual([{ line: 2, severity: 'error', message }]);
    expect(result.tree.focus).toEqual([]);
  });

  it('rejects a second focus line and keeps the first', () => {
    const result = parse(lines('Rose + Al -> Mary', 'focus: Mary', 'focus: Rose'));
    expect(result.tree.focus).toEqual(['Mary']);
    expect(result.diagnostics).toEqual([
      { line: 3, severity: 'error', message: 'Only one focus line is allowed, and line 2 already has one. Remove one of them.' },
    ]);
  });
});

describe('identity', () => {
  it('reads Name@1 as the person with id Name', () => {
    const result = parse(lines('John@2 1980 -> Amy', 'John@1 1950 -> Ben', 'John 1950 + Cat -> Dan', 'focus: Amy + Ben'));
    expect(result.diagnostics).toEqual([]);
    expect([...result.tree.persons.keys()]).toEqual(['John@2', 'Amy', 'John', 'Ben', 'Cat', 'Dan']);
    expect(result.tree.unions[2]?.partners).toEqual(['John', 'Cat']);
  });

  it('accepts spaces around @n', () => {
    const result = parse(lines('John Kim -> Amy', 'John Kim @ 2 1980 -> Ben', 'focus: Amy + Ben'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.get('John Kim@2')).toMatchObject({ name: 'John Kim', birth: 1980 });
  });

  it('matches a lone @n person by plain name', () => {
    const result = parse(lines('Ana@2 1990 -> Bo', 'Ana "kind" -> Cy', 'focus: Bo'));
    expect(result.diagnostics).toEqual([]);
    expect([...result.tree.persons.keys()]).toEqual(['Ana@2', 'Bo', 'Cy']);
    expect(result.tree.persons.get('Ana@2')?.traits).toEqual(['kind']);
  });

  it('requires a birth year or @n once a name is shared', () => {
    const result = parse(lines('John 1950 -> Amy', 'John@2 1980 -> Ben', 'John + Cat -> Dan', 'focus: Amy'));
    expect(errors(result.diagnostics)).toEqual([
      {
        line: 3,
        severity: 'error',
        message: 'There are 2 people named "John": John (born 1950) and John@2 (born 1980). Add a birth year or a number to say which, like "John@2".',
      },
    ]);
    expect(result.tree.unions).toHaveLength(2);
  });

  it('explains a birth year that matches none of the shared names', () => {
    const result = parse(lines('John 1950 -> Amy', 'John@2 -> Ben', 'John 1975 -> Dan', 'focus: Amy'));
    expect(errors(result.diagnostics)[0]?.message).toBe(
      'No "John" was born in 1975; there are John (born 1950) and John@2. Use one of their birth years, or a number like "John@2".',
    );
  });

  it('warns about a conflicting year or traits and keeps the first value', () => {
    const result = parse(lines('Rose 1932 "kind" -> Mary', 'Rose 1933 "warm" -> Bo', 'focus: Mary'));
    expect(result.tree.persons.get('Rose')).toMatchObject({ birth: 1932, traits: ['kind'] });
    expect(result.diagnostics).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: '"Rose" already has birth year 1932 (line 1), so 1933 is ignored. If these are two different people with the same name, write the other one as "Rose@2".',
      },
      { line: 2, severity: 'warning', message: '"Rose" already has the traits "kind" (line 1), so "warm" is ignored.' },
    ]);
  });

  it('does not warn when a later mention repeats the same details', () => {
    expect(parse(lines('Rose 1932 "kind" -> Mary', 'Rose 1932 "kind" -> Bo', 'focus: Mary')).diagnostics).toEqual([]);
  });

  it('lets a line with one person declare or describe them without a union', () => {
    const result = parse(lines('Rose 1932-2019 "kind"', 'Rose + Al -> Mary', 'Al c1930', 'focus: Mary'));
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.unions).toEqual([union('u0', ['Rose', 'Al'], ['Mary'], 2)]);
    expect(result.tree.persons.get('Rose')).toEqual(person('Rose', 1, { birth: 1932, death: 2019, traits: ['kind'] }));
    expect(result.tree.persons.get('Al')).toMatchObject({ birth: 1930, birthApprox: true });
  });
});

describe('structural errors', () => {
  const firstError = (dsl: string) => errors(parse(dsl).diagnostics)[0];

  it('rejects a person partnered with themselves', () => {
    const result = parse(lines('Rose + Rose -> Mary', 'focus: Mary'));
    expect(errors(result.diagnostics)[0]).toEqual({
      line: 1,
      severity: 'error',
      message: '"Rose" is listed as their own partner. If these are two different people with the same name, write the other one as "Rose@2".',
    });
    expect(result.tree.unions).toEqual([]);
  });

  it('rejects a person who is a parent and a child on one line', () => {
    expect(firstError(lines('Rose + Al -> Rose', 'focus: Al'))?.message).toBe(
      '"Rose" is listed as both a parent and a child on this line. If these are two different people with the same name, write the other one as "Rose@2".',
    );
  });

  it('rejects a child listed twice on one line', () => {
    expect(firstError(lines('Rose -> Mary, Mary', 'focus: Mary'))).toEqual({
      line: 1,
      severity: 'error',
      message: '"Mary" is listed twice as a child on this line.',
    });
  });

  it('rejects a child who would become their own ancestor, and leaves the loop out of the tree', () => {
    const result = parse(lines('John Kim 1950 + Ann -> Mary', 'Mary + Tom -> John Kim 1980', 'focus: Mary'));
    expect(errors(result.diagnostics)).toEqual([
      {
        line: 2,
        severity: 'error',
        message: 'Listing "John Kim" as a child here makes them their own ancestor. If these are two different people with the same name, write the other one as "John Kim@2".',
      },
    ]);
    expect(result.tree.unions[1]?.children).toEqual([]);
  });

  it('catches a loop through several generations', () => {
    const result = parse(lines('A + B -> C', 'C + D -> E', 'E + F -> A', 'focus: E'));
    expect(errors(result.diagnostics).map((d) => [d.line, d.message.split('.')[0]])).toEqual([
      [3, 'Listing "A" as a child here makes them their own ancestor'],
    ]);
  });

  it('allows cousins to marry (a repeat, not a loop)', () => {
    const result = parse(lines('G -> P1, P2', 'P1 -> C1', 'P2 -> C2', 'C1 + C2 -> K', 'focus: K'));
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    ['Rose -> Mary -> Ann', 'Use one "->" per line: partners before it, children after it.'],
    ['Rose, Al -> Mary', 'Join two partners with "+", not a comma. Commas separate the children after "->".'],
    ['Mary, John', 'Join two partners with "+", not a comma. Commas separate the children after "->".'],
    ['Rose -> Mary + Tom', `Only children go after "->", separated by commas. Write a child's own partner on a separate line.`],
    ['Rose + Al + Betty -> Mary', 'A couple has at most 2 partners. Write each couple on its own line.'],
    ['-> Mary', 'Write the parents before "->"; use "?" for an unknown parent.'],
    ['Rose + -> Mary', 'Missing a name next to "+".'],
    ['Rose ->', 'Nothing after "->". List the children separated by commas, or remove the "->".'],
    ['Rose -> Mary,, Ann', `Missing a child's name between commas.`],
    ['Rose -> Mary,', `Missing a child's name between commas.`],
    ['Rose -> ?', '"?" stands for an unknown partner, not a child. Leave unknown children out.'],
    ['? 1950 + Al -> Mary', `"?" stands for an unknown partner and can't have years, traits, or a number. Give the person a name instead.`],
    ['?', `This line names no one; "?" only stands in for the unknown partner of a named person.`],
    ['? + ?', `This line names no one; "?" only stands in for the unknown partner of a named person.`],
    ['Robert "Bob" Smith -> Mary', 'Text after the traits: "Smith". Write the name, then the years, then the "traits" last; quotes are only for traits.'],
    ['Rose "kind" "warm" -> Mary', `Write all of a person's traits inside one pair of quotes, like "kind, funny".`],
    ['Rose "kind, warm -> Mary # oops', 'The quote before "kind, warm -> Mary # oops" is never closed.'],
    ['1932-2019 "kind" -> Mary', `Missing a person's name in "1932-2019 "kind"".`],
    ['John@0 -> Mary', 'Numbering starts at 1: "John@1" is the first John, "John@2" the second.'],
    ['john@home -> Mary', '"john@home": "@" is only for numbering people who share a name, like "Nia@2".'],
    ['Rose + Kids: Al -> Mary', `A name can't contain ":" ("Kids: Al"). Directives like "focus:" go on a line of their own.`],
    ['Rose + `Al` -> Mary', 'A name can\'t contain "`" ("`Al`"). Directives like "focus:" go on a line of their own.'],
    ['Rose + 2. Al -> Mary', 'Remove the list marker at the start of "2. Al"; write people without bullets or numbering.'],
  ])('rejects %j', (line, message) => {
    const result = parse(lines(line, 'focus: Mary'));
    expect(errors(result.diagnostics)[0]).toEqual({ line: 1, severity: 'error', message });
  });

  it('drops a single-parent union whose only child was rejected, but keeps a couple', () => {
    const result = parse(lines('Rose + Al -> Mary', 'Ann -> Mary', 'Bo + Cy -> Mary', 'focus: Mary'));
    expect(errors(result.diagnostics).map((d) => d.line)).toEqual([2, 3]);
    expect(result.tree.unions).toEqual([union('u0', ['Rose', 'Al'], ['Mary'], 1), union('u1', ['Bo', 'Cy'], [], 3)]);
    expect(result.tree.persons.has('Ann')).toBe(true);
  });

  it('skips an unparseable line entirely', () => {
    const result = parse(lines('Rose + Al + Betty -> Mary', 'focus: Mary'));
    expect(result.tree.persons.size).toBe(0);
    expect(result.tree.unions).toEqual([]);
  });
});

describe('warnings', () => {
  it('names each person not connected to the focus, at the line that created them, and keeps them', () => {
    const result = parse(lines('A + B -> C', 'X -> Y', 'focus: C'));
    expect(result.diagnostics).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: `"X" isn't connected to the focus (C), so the poster leaves them out. Check the spelling of the names on this line.`,
      },
      {
        line: 2,
        severity: 'warning',
        message: `"Y" isn't connected to the focus (C), so the poster leaves them out. Check the spelling of the names on this line.`,
      },
    ]);
    expect([...result.tree.persons.keys()]).toEqual(['A', 'B', 'C', 'X', 'Y']);
  });

  it('skips the connection check while there are errors', () => {
    const result = parse(lines('A + B -> C', 'X -> Y', 'Q -> C', 'focus: C'));
    expect(result.diagnostics.map((d) => d.severity)).toEqual(['error']);
  });

  it('warns about a couple written on two lines', () => {
    const result = parse(lines('Rose + Al -> Mary', 'Al + Rose -> John', 'focus: Mary'));
    expect(result.diagnostics).toEqual([
      { line: 2, severity: 'warning', message: '"Al" and "Rose" are already a couple on line 1; list all their children on one line.' },
    ]);
    expect(result.tree.unions).toHaveLength(2);
  });

  it('sorts diagnostics by line, document-level first', () => {
    const result = parse(lines('Rose "a, b, c, d" -> Mary', 'Layout: fan', 'Rose 1932 -> Bo', 'Bo, Ann'));
    expect(result.diagnostics.map((d) => d.line)).toEqual([0, 1, 2, 4]);
  });
});

describe('robustness', () => {
  it('never throws on random input and always returns a well-formed tree', () => {
    const alphabet = [...'ab Zé李 +->,?@#"“”‘’()[]:–—→\t\r\n0123456789c.`'];
    const random = prng(2026);
    for (let i = 0; i < 2000; i++) {
      const length = Math.floor(random() * 80);
      const text = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const { tree: t, diagnostics } = parse(text);
      for (const d of diagnostics) {
        expect(d.message.length, text).toBeGreaterThan(0);
        expect(Number.isInteger(d.line) && d.line >= 0, text).toBe(true);
      }
      t.unions.forEach((u, index) => expect(u.id).toBe(`u${index}`));
      for (const id of [...t.unions.flatMap((u) => [...u.partners, ...u.children]), ...t.focus]) {
        if (id !== null) expect(t.persons.has(id), text).toBe(true);
      }
    }
  });

  it('parses a 600-person tree quickly', () => {
    const rows = Array.from({ length: 300 }, (_, i) => `P${i} ${1800 + (i % 200)} "kind, warm" + Q${i} -> P${i + 1}`);
    const dsl = `${rows.join('\n')}\nfocus: P300`;
    const start = performance.now();
    const result = parse(dsl);
    const elapsed = performance.now() - start;
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.size).toBe(601);
    expect(elapsed).toBeLessThan(250);
  });
});
