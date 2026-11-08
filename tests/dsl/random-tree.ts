import type { Person, PersonId, Tree, Union } from '../../src/model/types';

/** Mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Names the DSL can carry: Unicode, apostrophes, hyphens, initials, nicknames in parentheses. */
const NAMES = [
  'Rose Kim', 'Al', 'Mary', 'John', 'Inés Vega', 'Zoë', 'José María', '李娜', 'Nguyễn Văn An', 'Σοφία',
  'O’Brien', "D'Angelo", 'Mary-Jane', 'Ka‘iulani', 'Ólafur', 'Ana', 'Dr. Lee', 'J. R. Smith', 'Anne (Nan)',
  'محمد', 'Владимир', 'Søren', 'Ḥasan', 'Mary C', 'Kim 2nd', '‘Iolani',
].map((name) => name.normalize('NFC'));

/** Up to 14 characters each; `#` and curly apostrophes are legal inside quotes. */
const TRAITS = ['kind', 'brave', 'funny', 'quiet', 'warm', 'Godly', 'witty', 'curious', 'très drôle', 'sabio', '温柔', '#1 dad', 'won’t quit', 'James’ dog'];

/** Titles parse() can return, including ones format() must quote to keep. */
const TITLES = [null, 'The Kim Family', 'Familia Pérez', 'Kim & Ruiz', 'Family #1', '"Best" family', 'The “Kim” Family', '李家', 'A: B'];

interface Generator {
  persons: Map<PersonId, Person>;
  unions: Union[];
  parents: Map<PersonId, Union>;
  random: () => number;
}

const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (random: () => number, p: number): boolean => random() < p;

function newPerson(g: Generator, line: number): Person {
  const { random, persons } = g;
  const name = pick(random, NAMES);
  const named = [...persons.values()].filter((p) => p.name === name);
  let id = name;
  if (persons.has(name) || (named.length > 0 && chance(random, 0.5)) || chance(random, 0.05)) {
    let index = 2;
    while (persons.has(`${name}@${index}`)) index++;
    id = `${name}@${index}`;
  }
  const birth = chance(random, 0.7) ? 1800 + Math.floor(random() * 220) : null;
  const death = chance(random, birth === null ? 0.15 : 0.4) ? (birth ?? 1800) + Math.floor(random() * 100) : null;
  const traits = chance(random, 0.5) ? [...new Set([pick(random, TRAITS), pick(random, TRAITS), pick(random, TRAITS)])].slice(0, 1 + Math.floor(random() * 3)) : [];
  const person: Person = {
    id,
    name,
    birth,
    birthApprox: birth !== null && chance(random, 0.15),
    death,
    deathApprox: death !== null && chance(random, 0.15),
    traits,
    sourceLine: line,
  };
  persons.set(id, person);
  return person;
}

function isAncestorOrSelf(g: Generator, ancestor: PersonId, start: PersonId): boolean {
  if (ancestor === start) return true;
  return (g.parents.get(start)?.partners ?? []).some((p) => p !== null && isAncestorOrSelf(g, ancestor, p));
}

function addUnion(g: Generator, line: number): void {
  const { random, persons, unions } = g;
  const shape = pick(random, ['couple', 'couple', 'couple', 'unknown-right', 'unknown-left', 'single', 'unknown', 'two-unknown'] as const);
  const existing = (): PersonId | null => (persons.size > 0 && chance(random, 0.6) ? pick(random, [...persons.keys()]) : null);
  const partner = (): PersonId => existing() ?? newPerson(g, line).id;

  let partners: (PersonId | null)[];
  if (shape === 'couple') {
    const a = partner();
    let b = existing();
    if (b === null || b === a || unions.some((u) => u.partners.includes(a) && u.partners.includes(b))) b = newPerson(g, line).id;
    partners = [a, b];
  } else if (shape === 'unknown-right') partners = [partner(), null];
  else if (shape === 'unknown-left') partners = [null, partner()];
  else if (shape === 'single') partners = [partner()];
  else if (shape === 'unknown') partners = [null];
  else partners = [null, null];

  const needsChild = shape === 'single' || shape === 'unknown' || shape === 'two-unknown';
  const count = Math.max(needsChild ? 1 : 0, Math.floor(random() * 4));
  const children: PersonId[] = [];
  for (let i = 0; i < count; i++) {
    const adoptable = [...persons.keys()].filter(
      (id) =>
        !g.parents.has(id) &&
        !children.includes(id) &&
        !partners.some((p) => p !== null && isAncestorOrSelf(g, id, p)),
    );
    const child = adoptable.length > 0 && chance(random, 0.3) ? pick(random, adoptable) : newPerson(g, line).id;
    children.push(child);
  }
  const union: Union = { id: `u${unions.length}`, partners, children, sourceLine: line, implied: false };
  for (const child of children) g.parents.set(child, union);
  unions.push(union);
}

/**
 * A random tree shaped like parse() output: persons in first-mention order,
 * at most one parent union each, no ancestor loops, `@n` ids for repeated
 * names, optional people on lines of their own, and a focus resolved last
 * (sometimes creating a partner, with the implied union).
 */
export function randomTree(random: () => number): Tree {
  const g: Generator = { persons: new Map(), unions: [], parents: new Map(), random };
  const steps = 1 + Math.floor(random() * 10);
  for (let line = 1; line <= steps; line++) {
    if (chance(random, 0.12)) newPerson(g, line);
    else addUnion(g, line);
  }

  const focusLine = steps + 1;
  const first = pick(random, [...g.persons.keys()]);
  const focus = [first];
  if (chance(random, 0.6)) {
    const others = [...g.persons.keys()].filter((id) => id !== first);
    focus.push(others.length > 0 && chance(random, 0.6) ? pick(random, others) : newPerson(g, focusLine).id);
  }
  const [a, b] = focus;
  if (b !== undefined && !g.unions.some((u) => u.partners.includes(a!) && u.partners.includes(b))) {
    g.unions.push({ id: `u${g.unions.length}`, partners: [a!, b], children: [], sourceLine: focusLine, implied: true });
  }
  return { persons: g.persons, unions: g.unions, focus, title: pick(random, TITLES) };
}
