import { parse } from '../../src/dsl/parse';
import type { Person, PersonId, Tree, Union } from '../../src/model/types';
import { exampleTree } from '../fixtures/example-tree';
import { person, tree, union } from '../fixtures/build';
import { sampleTree } from '../fixtures/sample-tree';

/** The sample tree with a different focus (the parser's tree for the same DSL with another `focus:` line). */
export function refocus(t: Tree, focus: PersonId[]): Tree {
  return { ...t, focus };
}

/** Builds a tree from union specs `[partners, children]`; every name becomes a person with a birth year. */
export function family(specs: [(string | null)[], string[]][], focus: PersonId[], title: string | null = null): Tree {
  const persons: Person[] = [];
  const seen = new Set<string>();
  const add = (name: string | null, line: number) => {
    if (name === null || seen.has(name)) return;
    seen.add(name);
    persons.push(person(name, line, { birth: 1900 + persons.length }));
  };
  const unions: Union[] = specs.map(([partners, children], i) => {
    partners.forEach((p) => add(p, i + 1));
    children.forEach((c) => add(c, i + 1));
    return union(`u${i}`, partners, children, i + 1);
  });
  for (const id of focus) add(id, specs.length + 1);
  if (focus.length === 2 && !unions.some((u) => focus.every((f) => u.partners.includes(f)))) {
    unions.push(union(`u${unions.length}`, [...focus], [], specs.length + 1, true));
  }
  return tree({ title, persons, unions, focus });
}

const GIVEN = ['Ada', 'Ben', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jude', 'Kai', 'Lena', 'Max', 'Nia', 'Otto', 'Pia'];
const SURNAMES = ['Abbott', 'Baker', 'Castillo', 'Dunn', 'Ellis', 'Fischer', 'Garcia', 'Hart', 'Ivanova', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreau'];

/** A unique, realistic name for ahnentafel number n (1 = the root). */
export function ancestorName(n: number): string {
  const period = GIVEN.length * SURNAMES.length;
  const base = `${GIVEN[n % GIVEN.length]} ${SURNAMES[Math.floor(n / GIVEN.length) % SURNAMES.length]}`;
  return n < period ? base : `${base} ${'I'.repeat(Math.floor(n / period) + 1)}`;
}

/** A complete ancestry `generations` deep (focus included) above ahnentafel person 1, named by ancestorName(). */
export function fullAncestry(generations: number): [(string | null)[], string[]][] {
  const specs: [(string | null)[], string[]][] = [];
  const grow = (n: number, depth: number) => {
    if (depth + 1 >= generations) return;
    specs.push([[ancestorName(2 * n), ancestorName(2 * n + 1)], [ancestorName(n)]]);
    grow(2 * n, depth + 1);
    grow(2 * n + 1, depth + 1);
  };
  grow(1, 0);
  return specs;
}

/** Cousin marriage: X's parents are first cousins, so X's great-grandparents G1 and G2 appear twice. */
export function cousinTree(): Tree {
  return family(
    [
      [['G1', 'G2'], ['C1', 'C2']],
      [['C1', 'S1'], ['P1']],
      [['C2', 'S2'], ['P2']],
      [['P1', 'P2'], ['X']],
    ],
    ['X'],
  );
}

/** A couple whose two ancestries have the same shape (three full generations each, one gap). */
export function mirroredCouple(): Tree {
  const side = (p: string): [(string | null)[], string[]][] => [
    [[`${p} Mother`, `${p} Father`], [p]],
    [[`${p} Gran A`, `${p} Gran B`], [`${p} Mother`]],
    [[`${p} Gran C`, null], [`${p} Father`]],
  ];
  return family([...side('Ann'), ...side('Bob'), [['Ann', 'Bob'], ['Kid One', 'Kid Two']]], ['Ann', 'Bob']);
}

/** Three generations of descendants with remarriage, an unknown partner, and a single parent. */
export function descendants(): Tree {
  return family(
    [
      [['Root Person', 'First Spouse'], ['Alma', 'Bruno', 'Cora']],
      [['Root Person', 'Second Spouse'], ['Dov']],
      [['Alma', 'Ezra'], ['Fay', 'Gus']],
      [['Bruno', null], ['Hal']],
      [['Cora'], ['Ida', 'Jon', 'Kit']],
      [['Fay', 'Lev'], ['Mo']],
    ],
    ['Root Person'],
  );
}

/** A person with `n` children who each have `m` children: a wide descendant chart. */
export function wideDescendants(n: number, m: number): Tree {
  const specs: [(string | null)[], string[]][] = [];
  const kids = Array.from({ length: n }, (_, i) => `Child Number ${i + 1}`);
  specs.push([['Wide Root', 'Wide Spouse'], kids]);
  kids.forEach((kid, i) => specs.push([[kid], Array.from({ length: m }, (_, j) => `Grandchild ${i + 1}-${j + 1}`)]));
  return family(specs, ['Wide Root']);
}

/** 102 people over four generations: a couple, five married children, twenty married grandchildren, and their fifty children. */
export function hundredDescendants(): Tree {
  const specs: [(string | null)[], string[]][] = [];
  const children = Array.from({ length: 5 }, (_, i) => `${GIVEN[i]} ${SURNAMES[0]}`);
  specs.push([[`Root ${SURNAMES[0]}`, `Root ${SURNAMES[1]}`], children]);
  children.forEach((child, i) => {
    const grandchildren = Array.from({ length: 4 }, (_, j) => `${GIVEN[(i * 4 + j) % GIVEN.length]} ${SURNAMES[0]} ${i + 1}-${j + 1}`);
    specs.push([[child, `Spouse ${SURNAMES[(i + 2) % SURNAMES.length]}`], grandchildren]);
    grandchildren.forEach((grandchild, j) => {
      const kids = Array.from({ length: (i * 4 + j) % 2 === 0 ? 2 : 3 }, (_, k) => `Kid ${i + 1}-${j + 1}-${k + 1}`);
      specs.push([[grandchild, `Partner ${i + 1}-${j + 1}`], kids]);
    });
  });
  return family(specs, [`Root ${SURNAMES[0]}`]);
}

/** Shared test trees by name. */
export const NAMED_TREES: Readonly<Record<string, () => Tree>> = {
  sample: sampleTree,
  example: exampleTree,
  deep6: () => family(fullAncestry(6), [ancestorName(1)], 'Six Generations'),
  deep7: () => family(fullAncestry(7), [ancestorName(1)], 'Seven Generations'),
  deep8: () => family(fullAncestry(8), [ancestorName(1)], 'Eight Generations'),
  wide: () => wideDescendants(6, 4),
  nulls: () => parse('? -> Cleo 1950\n? + ? -> Dan 1952\nCleo + Dan -> Eve 1980\nEve + ? -> Fay 2005\nfocus: Fay\n').tree,
};
