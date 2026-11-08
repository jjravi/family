import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/model/index';
import { exampleTree } from '../fixtures/example-tree';
import { person, tree, union } from '../fixtures/build';
import { sampleTree } from '../fixtures/sample-tree';

describe('buildIndex on the example tree', () => {
  const t = exampleTree();
  const index = buildIndex(t);
  const ids = (unions: readonly { id: string }[]) => unions.map((u) => u.id);

  it('finds the parent union of a child, or null', () => {
    expect(index.parentsOf('Sarah')?.id).toBe('u1');
    expect(index.parentsOf('Carl')?.id).toBe('u2');
    expect(index.parentsOf('Rose Kim')).toBeNull();
    expect(index.parentsOf('Nobody')).toBeNull();
  });

  it('lists partner unions in DSL order, implied union included', () => {
    expect(ids(index.unionsOf('Mary'))).toEqual(['u1', 'u3']);
    expect(ids(index.unionsOf('Al Kim'))).toEqual(['u0', 'u2']);
    expect(ids(index.unionsOf('Sarah'))).toEqual(['u5']);
    expect(ids(index.unionsOf('John'))).toEqual(['u4']);
    expect(index.unionsOf('Leo')).toEqual([]);
  });

  it('returns children in written order', () => {
    expect(index.childrenOf('u0')).toEqual(['Mary', 'John']);
    expect(index.childrenOf('u5')).toEqual([]);
    expect(index.childrenOf('u99')).toEqual([]);
  });

  it('computes generations relative to the focus', () => {
    const expected: Record<string, number> = {
      'Rose Kim': 2, 'Al Kim': 2, 'Betty Lee': 2,
      Mary: 1, John: 1, 'Tom Park': 1, Carl: 1,
      Sarah: 0, 'Dave Ruiz': 0, Jin: 0, Ana: 0, Leo: 0,
    };
    for (const [id, generation] of Object.entries(expected)) expect(index.generation(id), id).toBe(generation);
    expect(index.generation('Nobody')).toBeNull();
  });

  it('connects every person, in BFS order from the focus', () => {
    expect(index.connected.size).toBe(t.persons.size);
    expect([...index.connected].slice(0, 2)).toEqual(['Sarah', 'Dave Ruiz']);
    expect(index.isConnected('Leo')).toBe(true);
    expect(index.isConnected('Nobody')).toBe(false);
  });
});

describe('buildIndex on the sample tree', () => {
  it('reaches both grandparent generations and the couple children', () => {
    const index = buildIndex(sampleTree());
    for (const id of ['Rose Kim', 'Al Kim', 'Grace Park', 'Sam Park', 'Inés Vega', 'Luis Vega', 'Rita Ruiz', 'Jorge Ruiz']) {
      expect(index.generation(id), id).toBe(2);
    }
    for (const id of ['Mary', 'Tom Park', 'Elena', 'Carlos Ruiz']) expect(index.generation(id), id).toBe(1);
    expect(index.generation('Lucia')).toBe(0);
    expect(index.generation('Mia')).toBe(-1);
    expect(index.generation('Noah')).toBe(-1);
  });
});

describe('buildIndex edge cases', () => {
  it('leaves persons outside the focus component unconnected', () => {
    const t = tree({
      title: null,
      persons: [person('A', 1), person('B', 1), person('C', 1), person('X', 2), person('Y', 2)],
      unions: [union('u0', ['A', null], ['B', 'C'], 1), union('u1', ['X'], ['Y'], 2)],
      focus: ['B'],
    });
    const index = buildIndex(t);
    expect([...index.connected]).toEqual(['B', 'A', 'C']);
    expect(index.generation('A')).toBe(1);
    expect(index.generation('C')).toBe(0);
    expect(index.generation('X')).toBeNull();
    expect(index.isConnected('Y')).toBe(false);
    expect(index.unionsOf('A').map((u) => u.id)).toEqual(['u0']);
  });

  it('connects nobody when the focus is empty or unknown', () => {
    const t = tree({ title: null, persons: [person('A', 1)], unions: [union('u0', ['A'], [], 1)], focus: [] });
    expect(buildIndex(t).connected.size).toBe(0);
    expect(buildIndex({ ...t, focus: ['Ghost'] }).connected.size).toBe(0);
  });

  it('keeps the first generation reached when cousins marry (deterministic)', () => {
    const t = tree({
      title: null,
      persons: ['G', 'P1', 'P2', 'C1', 'Q', 'C2', 'K'].map((name) => person(name, 1)),
      unions: [
        union('u0', ['G'], ['P1', 'P2'], 1),
        union('u1', ['P1'], ['C1'], 2),
        union('u2', ['P2'], ['Q'], 3),
        union('u3', ['Q'], ['C2'], 4),
        union('u4', ['C1', 'C2'], ['K'], 5),
      ],
      focus: ['K'],
    });
    const index = buildIndex(t);
    expect(index.generation('C1')).toBe(1);
    expect(index.generation('C2')).toBe(1);
    expect(index.generation('Q')).toBe(2);
    expect(index.generation('P2')).toBe(2);
    expect(index.generation('G')).toBe(3);
    expect(buildIndex(t).generation('P2')).toBe(index.generation('P2'));
  });
});
