import { describe, expect, it } from 'vitest';
import { formatYears, readYears, splitYears } from '../../src/dsl/years';

const y = (year: number, approx = false) => ({ year, approx });

describe('readYears', () => {
  it.each([
    ['1932-2019', { birth: y(1932), death: y(2019) }],
    ['1932', { birth: y(1932), death: null }],
    ['1932-', { birth: y(1932), death: null }],
    ['-2019', { birth: null, death: y(2019) }],
    ['c1932-C.2019', { birth: y(1932, true), death: y(2019, true) }],
    ['ca1932', { birth: y(1932, true), death: null }],
    ['1932‐2019', { birth: y(1932), death: y(2019) }],
    ['1932‒2019', { birth: y(1932), death: y(2019) }],
    ['1932−2019', { birth: y(1932), death: y(2019) }],
    ['1932-02-29–2019-12-31', { birth: y(1932), death: y(2019) }],
    ['(1932)', { birth: y(1932), death: null }],
    ['0742-0814', { birth: y(742), death: y(814) }],
  ])('reads %j', (text, years) => {
    expect(readYears(text)).toEqual(years);
  });

  it.each(['', '-', '--', '193', '19322', '1932--2019', '1932-2019-', 'c', 'c-', '1932-13', '1932-05-32', 'x1932', '(1932', '1932/2019'])(
    'rejects %j',
    (text) => {
      expect(readYears(text)).toBeNull();
    },
  );
});

describe('splitYears', () => {
  it('takes up to three words that meet at a dash', () => {
    expect(splitYears(['Rose', '1932', '–', '2019'])).toEqual({ years: { birth: y(1932), death: y(2019) }, wordCount: 3 });
    expect(splitYears(['Rose', '1932', '-2019'])).toEqual({ years: { birth: y(1932), death: y(2019) }, wordCount: 2 });
    expect(splitYears(['Rose', '1932-', '2019'])).toEqual({ years: { birth: y(1932), death: y(2019) }, wordCount: 2 });
  });

  it('never joins words without a dash between them', () => {
    expect(splitYears(['Mary', 'C', '1950'])).toEqual({ years: { birth: y(1950), death: null }, wordCount: 1 });
    expect(splitYears(['Al', '1930', '2001'])).toEqual({ years: { birth: y(2001), death: null }, wordCount: 1 });
    expect(splitYears(['Mary-Jane'])).toBeNull();
    expect(splitYears([])).toBeNull();
  });
});

describe('formatYears', () => {
  it('writes the canonical forms', () => {
    expect(formatYears({ birth: y(1932), death: y(2019) })).toBe('1932-2019');
    expect(formatYears({ birth: y(1932, true), death: null })).toBe('c1932');
    expect(formatYears({ birth: null, death: y(2019, true) })).toBe('-c2019');
    expect(formatYears({ birth: null, death: null })).toBe('');
    expect(formatYears({ birth: y(742), death: null })).toBe('0742');
  });
});
