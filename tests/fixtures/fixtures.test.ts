import { describe, expect, it } from 'vitest';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import { buildIndex } from '../../src/model/index';
import type { Person, PersonId, Tree, Union } from '../../src/model/types';
import { exampleTree } from './example-tree';
import { sampleTree } from './sample-tree';

/** Derives a tree from the plain constructs the two constants use (no `@n`, no conflicts, focus last). */
function happyPathOracle(dsl: string): Tree {
  const persons = new Map<PersonId, Person>();
  const unions: Union[] = [];
  let title: string | null = null;
  let focus: { line: number; text: string } | null = null;

  const mention = (entry: string, line: number): PersonId => {
    let rest = entry.trim();
    let traits: string[] = [];
    const quoted = /\s*"([^"]*)"$/.exec(rest);
    if (quoted) {
      traits = quoted[1]!.split(',').map((t) => t.trim()).filter(Boolean);
      rest = rest.slice(0, quoted.index);
    }
    const years = /\s+(c?)(\d{4})?(?:-(c?)(\d{4})?)?$/.exec(rest);
    const name = years && (years[2] || years[4]) ? rest.slice(0, years.index) : rest;
    let p = persons.get(name);
    if (!p) {
      p = { id: name, name, birth: null, birthApprox: false, death: null, deathApprox: false, traits: [], sourceLine: line };
      persons.set(name, p);
    }
    if (years?.[2] && p.birth === null) [p.birth, p.birthApprox] = [Number(years[2]), years[1] === 'c'];
    if (years?.[4] && p.death === null) [p.death, p.deathApprox] = [Number(years[4]), years[3] === 'c'];
    if (traits.length > 0 && p.traits.length === 0) p.traits = traits;
    return p.id;
  };
  const splitEntries = (text: string, separator: string): string[] => text.match(new RegExp(`(?:"[^"]*"|[^"${separator}])+`, 'g')) ?? [];

  dsl.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/#.*$/, '').trim();
    const directive = /^(title|focus):\s*(.*)$/.exec(text);
    if (!text) return;
    if (directive?.[1] === 'title') title = directive[2]!;
    else if (directive) focus = { line, text: directive[2]! };
    else {
      const [left, right = ''] = text.split('->');
      const partners = splitEntries(left!, '+').map((e) => (e.trim() === '?' ? null : mention(e, line)));
      const children = splitEntries(right, ',').map((e) => mention(e, line));
      unions.push({ id: `u${unions.length}`, partners, children, sourceLine: line, implied: false });
    }
  });

  const { line, text } = focus!;
  const ids = splitEntries(text, '+').map((e) => mention(e, line));
  const joined = unions.some((u) => ids.every((id) => u.partners.includes(id)));
  if (ids.length === 2 && !joined) {
    unions.push({ id: `u${unions.length}`, partners: ids, children: [], sourceLine: line, implied: true });
  }
  return { persons, unions, focus: ids, title };
}

const cases = [
  { label: 'example', dsl: EXAMPLE_DSL, fixture: exampleTree },
  { label: 'sample', dsl: SAMPLE_DSL, fixture: sampleTree },
];

describe.each(cases)('$label fixture', ({ dsl, fixture }) => {
  const lines = dsl.split('\n');

  it('matches an independent derivation from the DSL text, in order', () => {
    const derived = happyPathOracle(dsl);
    const expected = fixture();
    expect(derived).toEqual(expected);
    expect([...derived.persons.keys()]).toEqual([...expected.persons.keys()]);
    expect(derived.unions.map((u) => u.id)).toEqual(expected.unions.map((u) => u.id));
  });

  it('is internally consistent', () => {
    const tree = fixture();
    const childOf = new Map<PersonId, string>();
    tree.unions.forEach((u, i) => {
      expect(u.id).toBe(`u${i}`);
      expect(u.partners.length).toBeLessThanOrEqual(2);
      for (const id of [...u.partners, ...u.children]) {
        if (id !== null) expect(tree.persons.has(id), id).toBe(true);
      }
      for (const child of u.children) {
        expect(childOf.has(child), `${child} is a child twice`).toBe(false);
        childOf.set(child, u.id);
      }
    });
    for (const [id, p] of tree.persons) {
      expect(p.id).toBe(id);
      expect(p.traits.length).toBeLessThanOrEqual(3);
      for (const trait of p.traits) expect(trait.length).toBeLessThanOrEqual(14);
      expect(lines[p.sourceLine - 1], `${id} on line ${p.sourceLine}`).toContain(p.name);
    }
    expect(tree.focus.every((id) => tree.persons.has(id))).toBe(true);
    expect(buildIndex(tree).connected.size).toBe(tree.persons.size);
  });

  it('returns fresh objects on every call', () => {
    const first = fixture();
    first.persons.get('Mary')!.traits.push('changed');
    first.unions.pop();
    first.persons.clear();
    expect(fixture()).toEqual(happyPathOracle(dsl));
  });
});

describe('EXAMPLE_DSL', () => {
  it('starts with the title on line 1 and has the focus on line 10', () => {
    const lines = EXAMPLE_DSL.split('\n');
    expect(lines[0]).toBe('title: The Kim & Ruiz Family');
    expect(lines[9]).toBe('focus: Sarah + Dave Ruiz 1979 "loyal, curious"');
    expect(EXAMPLE_DSL.endsWith('"\n')).toBe(true);
  });
});

describe('SAMPLE_DSL', () => {
  const tree = sampleTree();
  const index = buildIndex(tree);
  const parentsOf = (id: PersonId): PersonId[] => (index.parentsOf(id)?.partners ?? []).filter((p) => p !== null);

  it('keeps the example lines and ends with the couple focus line', () => {
    const exampleUnionLines = EXAMPLE_DSL.split('\n').slice(0, 8).join('\n');
    expect(SAMPLE_DSL.startsWith(exampleUnionLines)).toBe(true);
    expect(SAMPLE_DSL.trimEnd().split('\n').at(-1)).toBe('focus: Sarah + Dave Ruiz');
    expect(SAMPLE_DSL).not.toMatch(/[\u201c\u201d]/);
  });

  it('gives both focus people two parents and four grandparents', () => {
    for (const focus of tree.focus) {
      const parents = parentsOf(focus);
      expect(parents).toHaveLength(2);
      expect(parents.flatMap(parentsOf)).toHaveLength(4);
    }
  });

  it('gives the couple two children, dates on everyone, and traits on most', () => {
    const couple = tree.unions.find((u) => u.partners.join() === 'Sarah,Dave Ruiz' && !u.implied);
    expect(couple?.children).toHaveLength(2);
    const persons = [...tree.persons.values()];
    expect(persons.every((p) => p.birth !== null)).toBe(true);
    const withTraits = persons.filter((p) => p.traits.length > 0);
    expect(withTraits.length).toBeGreaterThan(persons.length / 2);
    expect(withTraits.every((p) => p.traits.length === 2)).toBe(true);
  });
});
