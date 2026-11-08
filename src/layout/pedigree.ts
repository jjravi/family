import type { TreeIndex } from '../model/index';
import type { PersonId } from '../model/types';

/** Generation caps (focus generation included): 7 for rectilinear pedigrees (127 slots), 6 for fans. */
export const MAX_GENERATIONS = { rectilinear: 7, fan: 6 } as const;

/**
 * An ancestor pedigree as arithmetic slots: `slots[g]` has 2^g entries, the
 * focus alone in generation 0. Slot k's parents are slots 2k (first partner as
 * written) and 2k + 1 (second partner); unknown ancestors are null.
 */
export interface Pedigree {
  slots: (PersonId | null)[][];
  /** Generations holding at least one known person, before any cap (focus included). */
  knownGenerations: number;
}

/** Slot assignment for `focus`, `maxGenerations` deep at most (always at least the focus). */
export function pedigree(index: TreeIndex, focus: PersonId, maxGenerations: number): Pedigree {
  const slots: (PersonId | null)[][] = [[focus]];
  let knownGenerations = 1;
  // One generation past the cap is walked to learn whether the cap cut anything.
  for (let g = 1; g <= maxGenerations; g++) {
    const previous = slots[g - 1]!;
    const row: (PersonId | null)[] = new Array<PersonId | null>(2 ** g).fill(null);
    let known = false;
    previous.forEach((person, k) => {
      if (person === null) return;
      const partners = index.parentsOf(person)?.partners ?? [];
      row[2 * k] = partners[0] ?? null;
      row[2 * k + 1] = partners[1] ?? null;
      known ||= row[2 * k] !== null || row[2 * k + 1] !== null;
    });
    if (!known) break;
    knownGenerations = g + 1;
    if (g < maxGenerations) slots.push(row);
  }
  return { slots, knownGenerations };
}

/** Pads (or trims) slots to exactly `generations` rows, filling missing ancestors with null. */
export function padSlots(slots: (PersonId | null)[][], generations: number): (PersonId | null)[][] {
  const padded: (PersonId | null)[][] = [];
  for (let g = 0; g < generations; g++) {
    padded.push(slots[g] ? [...slots[g]!] : new Array<PersonId | null>(2 ** g).fill(null));
  }
  return padded;
}

/** Subtree sizes: weights[g][k] = known persons in slot k of generation g and all its ancestors. */
export function slotWeights(slots: (PersonId | null)[][]): number[][] {
  const weights = slots.map((row) => row.map(() => 0));
  for (let g = slots.length - 1; g >= 0; g--) {
    slots[g]!.forEach((person, k) => {
      const above = weights[g + 1];
      weights[g]![k] = (person === null ? 0 : 1) + (above ? above[2 * k]! + above[2 * k + 1]! : 0);
    });
  }
  return weights;
}

/**
 * "See also" numbers for persons drawn more than once, numbered 1, 2, ... in
 * the order their first occurrence is visited (generation by generation, side by side).
 */
export function repeatNumbers(sides: readonly (PersonId | null)[][][]): Map<PersonId, number> {
  const counts = new Map<PersonId, number>();
  const order: PersonId[] = [];
  const generations = Math.max(...sides.map((s) => s.length));
  for (let g = 0; g < generations; g++) {
    for (const side of sides) {
      for (const person of side[g] ?? []) {
        if (person === null) continue;
        if (!counts.has(person)) order.push(person);
        counts.set(person, (counts.get(person) ?? 0) + 1);
      }
    }
  }
  const numbers = new Map<PersonId, number>();
  for (const person of order) if (counts.get(person)! > 1) numbers.set(person, numbers.size + 1);
  return numbers;
}
