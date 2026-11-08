import { describe, expect, it } from 'vitest';
import { emptyTree, type Person, type Tree } from '../../src/model/types';
import { posterFilename, posterTitle, slugify } from '../../src/ui/filename';

function person(id: string): Person {
  return { id, name: id.replace(/@\d+$/, ''), birth: null, birthApprox: false, death: null, deathApprox: false, traits: [], sourceLine: 1 };
}

function treeWith(focus: string[], title: string | null): Tree {
  return { ...emptyTree(), persons: new Map(focus.map((id) => [id, person(id)])), focus, title };
}

describe('slugify', () => {
  it('joins lowercase words with dashes and drops a leading "the"', () => {
    expect(slugify('The Kim & Ruiz Family')).toBe('kim-ruiz-family');
    expect(slugify('  Theodore   Park  ')).toBe('theodore-park');
    expect(slugify('The')).toBe('the');
  });

  it('folds accents on Latin letters and keeps other scripts', () => {
    expect(slugify('Familia Núñez–Vega')).toBe('familia-nunez-vega');
    expect(slugify('Ærø Strauß')).toBe('aero-strauss');
    expect(slugify('김씨 가족')).toBe('김씨-가족');
  });

  it('returns an empty slug when nothing usable is left, and caps the length', () => {
    expect(slugify(' *** ')).toBe('');
    expect(slugify(`${'a'.repeat(58)} bcd`)).toBe('a'.repeat(58) + '-b');
    expect(slugify(`${'a'.repeat(59)} bcd`)).toBe('a'.repeat(59));
  });
});

describe('posterFilename', () => {
  it('names downloads from the title and page size', () => {
    expect(posterFilename('The Kim & Ruiz Family', { size: '18x24', orientation: 'portrait' }, 'png')).toBe('kim-ruiz-family-18x24.png');
    expect(posterFilename('The Kim & Ruiz Family', { size: 'a3', orientation: 'landscape' }, 'svg')).toBe('kim-ruiz-family-a3-landscape.svg');
  });

  it('falls back to family-tree without a usable title', () => {
    expect(posterFilename('', { size: '8x10', orientation: 'portrait' }, 'png')).toBe('family-tree-8x10.png');
  });
});

describe('posterTitle', () => {
  it('uses the title directive, else the focus names', () => {
    expect(posterTitle(treeWith(['Sarah', 'Dave Ruiz'], 'The Kim & Ruiz Family'))).toBe('The Kim & Ruiz Family');
    expect(posterTitle(treeWith(['Sarah', 'Dave Ruiz'], null))).toBe('Sarah & Dave Ruiz');
    expect(posterTitle(treeWith(['John Kim@2'], null))).toBe('John Kim');
  });
});
