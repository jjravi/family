import type { Person, PersonId, Tree, Union } from '../../src/model/types';

export interface PersonDetails {
  /** Defaults to the name (first person with that name). */
  id?: PersonId;
  birth?: number;
  birthApprox?: boolean;
  death?: number;
  deathApprox?: boolean;
  traits?: string[];
}

/** A Person; omitted details are null, false, or empty. */
export function person(name: string, sourceLine: number, details: PersonDetails = {}): Person {
  return {
    id: details.id ?? name,
    name,
    birth: details.birth ?? null,
    birthApprox: details.birthApprox ?? false,
    death: details.death ?? null,
    deathApprox: details.deathApprox ?? false,
    traits: details.traits ?? [],
    sourceLine,
  };
}

export function union(
  id: string,
  partners: (PersonId | null)[],
  children: PersonId[],
  sourceLine: number,
  implied = false,
): Union {
  return { id, partners, children, sourceLine, implied };
}

/** A Tree whose persons Map keeps the given order. */
export function tree(parts: { title: string | null; persons: Person[]; unions: Union[]; focus: PersonId[] }): Tree {
  return {
    persons: new Map(parts.persons.map((p) => [p.id, p])),
    unions: parts.unions,
    focus: parts.focus,
    title: parts.title,
  };
}
