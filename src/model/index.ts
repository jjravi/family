import type { PersonId, Tree, Union } from './types';

/** Derived lookups, built once per parse. Layout reads these, never the DSL text. */
export interface TreeIndex {
  /** The union where `id` is a child (the first in DSL order; a second one is a parse error), or null. */
  parentsOf(id: PersonId): Union | null;
  /** Unions where `id` is a partner, in DSL order. */
  unionsOf(id: PersonId): readonly Union[];
  /** Children of the union in written order; empty for an unknown union id. */
  childrenOf(unionId: string): readonly PersonId[];
  /**
   * Generation relative to the focus: focus persons are 0, partners share a
   * generation, parents are +1, children -1. Null when not connected to the focus.
   * Computed by BFS from the focus persons in focus order; when non-tree structure
   * (e.g. cousin marriage) reaches a person by several paths, the first visit wins.
   */
  generation(id: PersonId): number | null;
  /** True when `id` is reachable from the focus over union edges (focus persons included). */
  isConnected(id: PersonId): boolean;
  /** Every person reachable from the focus, in BFS visit order. */
  readonly connected: ReadonlySet<PersonId>;
}

const EMPTY: readonly never[] = Object.freeze([]);

export function buildIndex(tree: Tree): TreeIndex {
  const unionById = new Map<string, Union>();
  const parentUnion = new Map<PersonId, Union>();
  const partnerUnions = new Map<PersonId, Union[]>();

  for (const union of tree.unions) {
    unionById.set(union.id, union);
    for (const child of union.children) {
      if (!parentUnion.has(child)) parentUnion.set(child, union);
    }
    for (const partner of union.partners) {
      if (partner === null) continue;
      const list = partnerUnions.get(partner);
      if (!list) partnerUnions.set(partner, [union]);
      else if (!list.includes(union)) list.push(union);
    }
  }

  const generations = new Map<PersonId, number>();
  const queue: PersonId[] = [];
  const visit = (id: PersonId | null, generation: number): void => {
    if (id === null || generations.has(id) || !tree.persons.has(id)) return;
    generations.set(id, generation);
    queue.push(id);
  };

  for (const id of tree.focus) visit(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const generation = generations.get(id)!;
    const parents = parentUnion.get(id);
    if (parents) {
      for (const partner of parents.partners) visit(partner, generation + 1);
      for (const sibling of parents.children) visit(sibling, generation);
    }
    for (const union of partnerUnions.get(id) ?? EMPTY) {
      for (const partner of union.partners) visit(partner, generation);
      for (const child of union.children) visit(child, generation - 1);
    }
  }

  const connected: ReadonlySet<PersonId> = new Set(queue);

  return {
    parentsOf: (id) => parentUnion.get(id) ?? null,
    unionsOf: (id) => partnerUnions.get(id) ?? EMPTY,
    childrenOf: (unionId) => unionById.get(unionId)?.children ?? EMPTY,
    generation: (id) => generations.get(id) ?? null,
    isConnected: (id) => generations.has(id),
    connected,
  };
}
