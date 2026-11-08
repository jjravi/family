import { describe, expect, it } from 'vitest';
import { datesLine, personLabel, posterTitle } from '../../src/layout/labels';
import { person } from '../fixtures/build';
import { exampleTree } from '../fixtures/example-tree';
import { family } from '../render/trees';

const on = { dates: true, traits: true, living: false };

describe('dates line', () => {
  it('formats born-died, born only, died only, and approximate years', () => {
    expect(datesLine(person('A', 1, { birth: 1932, death: 2019 }), false)).toBe('1932 \u2013 2019');
    expect(datesLine(person('A', 1, { birth: 1932 }), false)).toBe('b. 1932');
    expect(datesLine(person('A', 1, { death: 2019 }), false)).toBe('d. 2019');
    expect(datesLine(person('A', 1, { birth: 1927, birthApprox: true, death: 2008 }), false)).toBe('c. 1927 \u2013 2008');
    expect(datesLine(person('A', 1, { birth: 1932, birthApprox: true }), false)).toBe('b. c. 1932');
    expect(datesLine(person('A', 1, { birth: 1930, death: 2001, deathApprox: true }), false)).toBe('1930 \u2013 c. 2001');
    expect(datesLine(person('A', 1), false)).toBeNull();
  });

  it('hides the birth year of living persons with `living`, and only theirs', () => {
    expect(datesLine(person('A', 1, { birth: 1980 }), true)).toBeNull();
    expect(datesLine(person('A', 1, { birth: 1932, death: 2019 }), true)).toBe('1932 \u2013 2019');
    expect(datesLine(person('A', 1, { death: 2019 }), true)).toBe('d. 2019');
  });
});

describe('person label', () => {
  it('shows dates and traits only when toggled on', () => {
    const rose = person('Rose Kim', 4, { birth: 1932, death: 2019, traits: ['kind', 'passionate'] });
    expect(personLabel(rose, on)).toEqual({ name: 'Rose Kim', dates: '1932 \u2013 2019', traits: 'kind \u00b7 passionate' });
    expect(personLabel(rose, { ...on, dates: false, traits: false })).toEqual({ name: 'Rose Kim', dates: null, traits: null });
    expect(personLabel(person('Jin', 5), on).traits).toBeNull();
  });
});

describe('poster title (decision 27)', () => {
  it('uses the tree title when present', () => {
    expect(posterTitle(exampleTree())).toBe('The Kim & Ruiz Family');
  });

  it('uses both surnames when both partners have one, else the names', () => {
    const untitled = (a: string, b: string) => posterTitle(family([[[a, b], []]], [a, b]));
    expect(untitled('Mary Kim', 'Tom Park')).toBe('Kim & Park');
    expect(untitled('Sarah', 'Dave Ruiz')).toBe('Sarah & Dave Ruiz');
    expect(untitled('Rose Kim', 'Al Kim')).toBe('Rose & Al Kim');
  });

  it("uses the person's name for a single root", () => {
    expect(posterTitle(family([[['Ann Lee'], ['Bo']]], ['Ann Lee']))).toBe('Ann Lee');
  });
});
