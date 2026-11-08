import { describe, expect, it } from 'vitest';
import { format } from '../../src/dsl/format';
import { parse } from '../../src/dsl/parse';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import {
  APPROX,
  ARROW,
  ARROW_ALIASES,
  COMMA,
  COMMA_ALIASES,
  DASH,
  DASH_ALIASES,
  DIRECTIVES,
  DOUBLE_QUOTES,
  EXAMPLES,
  MAX_TRAIT_LENGTH,
  MAX_TRAITS,
  PLUS,
  PROMPT_EXAMPLE,
  QUOTE,
  SUFFIX,
  UNKNOWN,
} from '../../src/dsl/spec';
import { readFocus } from '../../src/dsl/syntax';
import { scanLine } from '../../src/dsl/tokenize';

const errors = (dsl: string) => parse(dsl).diagnostics.filter((d) => d.severity === 'error');

describe('PROMPT_EXAMPLE', () => {
  it('parses with zero diagnostics', () => {
    const { tree, diagnostics } = parse(PROMPT_EXAMPLE);
    expect(diagnostics).toEqual([]);
    expect(tree.focus).toEqual(['Nia']);
    expect(tree.persons.size).toBe(6);
  });

  it('is canonical: format() reproduces it exactly', () => {
    expect(format(parse(PROMPT_EXAMPLE).tree)).toBe(PROMPT_EXAMPLE);
  });

  it('shows the constructs the rules describe', () => {
    const { tree } = parse(PROMPT_EXAMPLE);
    const persons = [...tree.persons.values()];
    expect(tree.title).not.toBeNull();
    expect(tree.unions.some((u) => u.partners.includes(null))).toBe(true);
    expect(tree.unions.some((u) => u.partners.length === 1)).toBe(true);
    expect(persons.some((p) => p.birthApprox)).toBe(true);
    expect(persons.some((p) => p.traits.length > 1)).toBe(true);
  });

  it('shares no names with the spec example or the sample, nor do the quoted snippets', () => {
    const quoted = [PROMPT_EXAMPLE, `${EXAMPLES.person}\n${EXAMPLES.unknownPartner}\n${EXAMPLES.sameName}`];
    const promptWords = new Set(quoted.flatMap((dsl) => [...parse(dsl).tree.persons.values()].flatMap((p) => p.name.split(' '))));
    expect(promptWords).toContain('Ngozi');
    for (const dsl of [EXAMPLE_DSL, SAMPLE_DSL]) {
      for (const p of parse(dsl).tree.persons.values()) {
        for (const word of p.name.split(' ')) expect(promptWords.has(word), word).toBe(false);
      }
    }
  });
});

describe('EXAMPLES (quoted by the prompt)', () => {
  it('uses the token constants', () => {
    expect(EXAMPLES.couple).toBe(`Partner A ${PLUS} Partner B ${ARROW} Child1${COMMA} Child2`);
    expect(EXAMPLES.unknownPartner).toContain(` ${UNKNOWN} `);
    expect(EXAMPLES.sameName).toContain(SUFFIX);
    expect(EXAMPLES.person).toContain(QUOTE);
    expect(EXAMPLES.title.startsWith(`${DIRECTIVES.title}:`)).toBe(true);
    expect(EXAMPLES.focusTwo.startsWith(`${DIRECTIVES.focus}:`)).toBe(true);
  });

  it.each([
    ['couple', `${EXAMPLES.couple}\nfocus: Child1`],
    ['unknownPartner', `${EXAMPLES.unknownPartner}\nfocus: Nia`],
    ['singleParent', `${EXAMPLES.singleParent}\nfocus: Child`],
    ['childless', `${EXAMPLES.childless}\nfocus: Partner A`],
    ['person', `${EXAMPLES.person} -> Kid\nfocus: Kid`],
    ['sameName', `${EXAMPLES.sameName.split(SUFFIX)[0]} -> A\n${EXAMPLES.sameName} -> B\nfocus: A + B`],
    ['title', `${EXAMPLES.title}\nA -> B\nfocus: B`],
    ['focusOne', `Name -> Kid\n${EXAMPLES.focusOne}`],
  ])('%s parses with zero diagnostics', (_label, dsl) => {
    expect(parse(dsl).diagnostics).toEqual([]);
  });

  it('focusTwo is a two-name focus line', () => {
    const value = EXAMPLES.focusTwo.slice(EXAMPLES.focusTwo.indexOf(':') + 1);
    expect(readFocus(scanLine(value).tokens)).toMatchObject({ kind: 'focus', entries: [{ name: 'Name' }, { name: 'Name' }] });
  });

  it.each([
    [EXAMPLES.bornDied, { birth: 1931, death: 2015, birthApprox: false }],
    [EXAMPLES.born, { birth: 1931, death: null, birthApprox: false }],
    [EXAMPLES.died, { birth: null, death: 2015, birthApprox: false }],
    [EXAMPLES.approximate, { birth: 1931, death: null, birthApprox: true }],
  ])('the year form %j means what the prompt says', (years, expected) => {
    const result = parse(`Rose ${years} -> Kid\nfocus: Kid`);
    expect(result.diagnostics).toEqual([]);
    expect(result.tree.persons.get('Rose')).toMatchObject(expected);
  });
});

describe('token constants', () => {
  it('accepts every arrow alias', () => {
    for (const arrow of ARROW_ALIASES) expect(errors(`A ${arrow} B\nfocus: B`), arrow).toEqual([]);
  });

  it('accepts every comma alias between children and inside traits', () => {
    for (const comma of COMMA_ALIASES) {
      const { tree, diagnostics } = parse(`A "x${comma} y" -> B${comma} C\nfocus: B`);
      expect(diagnostics, comma).toEqual([]);
      expect(tree.persons.get('A')?.traits).toEqual(['x', 'y']);
      expect(tree.unions[0]?.children).toEqual(['B', 'C']);
    }
  });

  it('accepts every double quote', () => {
    for (const quote of DOUBLE_QUOTES) {
      expect(parse(`A ${quote}kind${quote} -> B\nfocus: B`).tree.persons.get('A')?.traits, quote).toEqual(['kind']);
    }
  });

  it('accepts every dash alias between years, and the approximate prefix', () => {
    for (const dash of [DASH, ...DASH_ALIASES]) {
      expect(parse(`A ${APPROX}1932${dash}2019 -> B\nfocus: B`).tree.persons.get('A'), dash).toMatchObject({
        birth: 1932,
        birthApprox: true,
        death: 2019,
      });
    }
  });

  it(`warns past ${MAX_TRAITS} traits and past ${MAX_TRAIT_LENGTH} characters, not at the limits`, () => {
    const atLimit = Array.from({ length: MAX_TRAITS }, (_, i) => `${'x'.repeat(MAX_TRAIT_LENGTH - 1)}${i}`).join(', ');
    expect(parse(`A "${atLimit}" -> B\nfocus: B`).diagnostics).toEqual([]);
    expect(parse(`A "${atLimit}, more" -> B\nfocus: B`).diagnostics).toHaveLength(1);
    expect(parse(`A "${'x'.repeat(MAX_TRAIT_LENGTH + 1)}" -> B\nfocus: B`).diagnostics).toHaveLength(1);
  });
});
