import { describe, expect, it } from 'vitest';
import { emptyTree, hasErrors, isLiving } from '../../src/model/types';
import { person } from '../fixtures/build';

describe('isLiving', () => {
  it('is true only with a birth year and no death year', () => {
    expect(isLiving(person('A', 1, { birth: 1950 }))).toBe(true);
    expect(isLiving(person('A', 1, { birth: 1950, death: 2001 }))).toBe(false);
    expect(isLiving(person('A', 1, { death: 2001 }))).toBe(false);
    expect(isLiving(person('A', 1))).toBe(false);
  });
});

describe('hasErrors', () => {
  it('ignores warnings', () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([{ line: 3, severity: 'warning', message: 'w' }])).toBe(false);
    expect(hasErrors([{ line: 3, severity: 'warning', message: 'w' }, { line: 0, severity: 'error', message: 'e' }])).toBe(true);
  });
});

describe('emptyTree', () => {
  it('returns a fresh empty tree each time', () => {
    const a = emptyTree();
    expect(a).toEqual({ persons: new Map(), unions: [], focus: [], title: null });
    a.unions.push({ id: 'u0', partners: [], children: [], sourceLine: 1, implied: false });
    expect(emptyTree().unions).toEqual([]);
  });
});
