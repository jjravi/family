import { describe, expect, it } from 'vitest';
import { MAX_GENERATIONS, padSlots, pedigree, repeatNumbers, slotWeights } from '../../src/layout/pedigree';
import { buildIndex } from '../../src/model/index';
import { exampleTree } from '../fixtures/example-tree';
import { sampleTree } from '../fixtures/sample-tree';
import { ancestorName, cousinTree, family, fullAncestry } from '../render/trees';

describe('pedigree slot assignment', () => {
  it('puts the first partner as written in slot 2k and the second in 2k + 1', () => {
    const tree = sampleTree();
    const { slots, knownGenerations } = pedigree(buildIndex(tree), 'Mia', MAX_GENERATIONS.rectilinear);
    expect(knownGenerations).toBe(4);
    expect(slots).toEqual([
      ['Mia'],
      ['Sarah', 'Dave Ruiz'],
      ['Mary', 'Tom Park', 'Elena', 'Carlos Ruiz'],
      ['Rose Kim', 'Al Kim', 'Grace Park', 'Sam Park', 'Inés Vega', 'Luis Vega', 'Rita Ruiz', 'Jorge Ruiz'],
    ]);
  });

  it('leaves unknown ancestors null: an unknown partner, a single parent, and missing parents', () => {
    const tree = family(
      [
        [['Mom', null], ['Kid']],
        [['Grandma'], ['Mom']],
      ],
      ['Kid'],
    );
    const { slots } = pedigree(buildIndex(tree), 'Kid', 7);
    expect(slots).toEqual([['Kid'], ['Mom', null], ['Grandma', null, null, null]]);
  });

  it('gives every slot of generation g a unique index below 2^g', () => {
    const tree = family(fullAncestry(6), [ancestorName(1)]);
    const { slots } = pedigree(buildIndex(tree), ancestorName(1), 7);
    slots.forEach((row, g) => {
      expect(row).toHaveLength(2 ** g);
      const people = row.filter((p) => p !== null);
      expect(new Set(people).size).toBe(people.length);
    });
  });

  it('caps the depth and reports that more generations exist', () => {
    const tree = family(fullAncestry(9), [ancestorName(1)]);
    const result = pedigree(buildIndex(tree), ancestorName(1), MAX_GENERATIONS.rectilinear);
    expect(result.slots).toHaveLength(7);
    expect(result.knownGenerations).toBeGreaterThan(7);
    expect(pedigree(buildIndex(tree), ancestorName(1), MAX_GENERATIONS.fan).slots).toHaveLength(6);
  });

  it('pads a shallow side with null slots to the deeper depth', () => {
    const tree = exampleTree();
    const index = buildIndex(tree);
    const sarah = pedigree(index, 'Sarah', 7);
    const dave = pedigree(index, 'Dave Ruiz', 7);
    expect(sarah.knownGenerations).toBe(3);
    expect(dave.knownGenerations).toBe(1);
    expect(padSlots(dave.slots, 3)).toEqual([['Dave Ruiz'], [null, null], [null, null, null, null]]);
  });
});

describe('slot weights and repeats', () => {
  it('counts known persons in each subtree', () => {
    const tree = sampleTree();
    const { slots } = pedigree(buildIndex(tree), 'Mia', 7);
    const weights = slotWeights(slots);
    expect(weights[0]).toEqual([15]);
    expect(weights[1]).toEqual([7, 7]);
    expect(weights[3]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('numbers persons drawn more than once (cousin marriage)', () => {
    const tree = cousinTree();
    const { slots } = pedigree(buildIndex(tree), 'X', 7);
    expect(slots[3]).toEqual(['G1', 'G2', null, null, 'G1', 'G2', null, null]);
    expect([...repeatNumbers([slots])]).toEqual([
      ['G1', 1],
      ['G2', 2],
    ]);
  });

  it('finds repeats across the two sides of a couple', () => {
    const tree = family(
      [
        [['Shared Mom', 'Shared Dad'], ['A', 'B']],
      ],
      ['A', 'B'],
    );
    const index = buildIndex(tree);
    const sides = ['A', 'B'].map((id) => pedigree(index, id, 7).slots);
    expect([...repeatNumbers(sides).keys()]).toEqual(['Shared Mom', 'Shared Dad']);
  });
});
