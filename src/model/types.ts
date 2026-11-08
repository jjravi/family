/**
 * Identifies a person. Equals the display name for the first person with that
 * name, and `${name}@${n}` for the n-th distinct person sharing it (n >= 2),
 * matching the DSL's `Name@n` disambiguation suffix.
 */
export type PersonId = string;

/** One person, merged from every mention in the DSL. */
export interface Person {
  id: PersonId;
  /** Display name as written in the DSL, without any `@n` suffix. */
  name: string;
  /** Birth year, or null when unknown. */
  birth: number | null;
  /** True when the birth year was written approximate (`c1932`, shown as "c. 1932"). */
  birthApprox: boolean;
  /** Death year, or null when unknown or living. */
  death: number | null;
  /** True when the death year was written approximate (`1932-c2019`). */
  deathApprox: boolean;
  /** 0-3 short words or phrases, in written order. Display is optional (style toggle). */
  traits: string[];
  /** 1-based DSL line that created this person (its first mention). */
  sourceLine: number;
}

/**
 * A partnership with 0-2 partners and any number of children. One abstraction
 * covers marriage, remarriage, half-siblings, single parents, and unknown partners.
 */
export interface Union {
  /** `u0`, `u1`, ... in creation order (DSL order; an implied focus union comes last). */
  id: string;
  /**
   * 0-2 entries in written order. `null` is an unknown partner written `?`
   * (`A + ? -> C` gives `[A, null]`); a single-parent line `A -> C` gives `[A]`.
   */
  partners: (PersonId | null)[];
  /** Children in written order, which is birth order on the print. */
  children: PersonId[];
  /** 1-based DSL line of the union line (the focus line when `implied`). */
  sourceLine: number;
  /**
   * True when the union was created by a `focus: A + B` directive because no
   * union line joins that pair (in either order). Implied unions have no children.
   */
  implied: boolean;
}

/** The parsed family. Every other representation derives from the DSL, then from this. */
export interface Tree {
  /** All persons; Map insertion order is first-mention order. */
  persons: Map<PersonId, Person>;
  /** All unions in creation order (index i has id `u${i}`). */
  unions: Union[];
  /** 1 id = single root, 2 ids = couple mode. Empty only when an error diagnostic exists. */
  focus: PersonId[];
  /** From the `title:` directive, trimmed; null when absent. */
  title: string | null;
}

export type Severity = 'error' | 'warning';

/** A parser message. Errors block rendering; warnings still render. */
export interface Diagnostic {
  /** 1-based DSL line; 0 refers to the whole document (e.g. missing focus). */
  line: number;
  severity: Severity;
  message: string;
}

export interface ParseResult {
  tree: Tree;
  diagnostics: Diagnostic[];
}

/** Living is implied when a birth year is known and no death year is given. */
export function isLiving(person: Person): boolean {
  return person.birth !== null && person.death === null;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** A fresh tree with no persons, unions, focus, or title. */
export function emptyTree(): Tree {
  return { persons: new Map(), unions: [], focus: [], title: null };
}
