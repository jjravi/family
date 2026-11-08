/**
 * DSL tokens, limits, and examples: the one source the tokenizer, parser,
 * format(), and prompt builder share, so the prompt can never describe a
 * grammar the parser does not accept (spec "Spec drift").
 */

/** Joins the two partners of a union: `A + B`. */
export const PLUS = '+';
/** Separates the partners from the children: `A + B -> C`. */
export const ARROW = '->';
/** Arrows chatbots and editors substitute for `->`, read as `->`. */
export const ARROW_ALIASES: readonly string[] = ['→', '⟶', '–>', '—>'];
/** Separates children, and the items of a trait string. */
export const COMMA = ',';
/** Full-width, ideographic, and Arabic commas, read as `,`. */
export const COMMA_ALIASES: readonly string[] = ['，', '、', '،'];
/** An unknown partner: `A + ? -> C`. */
export const UNKNOWN = '?';
/** `Name@2` is the second person sharing a name, `Name@3` the third; `Name@1` is the first (id `Name`). */
export const SUFFIX = '@';
/** Starts a comment that runs to the end of the line, except inside quotes. */
export const COMMENT = '#';
/** The quote format() writes and the prompt asks for. */
export const QUOTE = '"';
/** Open or close a trait string; any of them closes any other, since chatbots and phone keyboards mix them. */
export const DOUBLE_QUOTES: readonly string[] = ['"', '“', '”', '„'];
/**
 * Curly single quotes also delimit a trait string. `‘` opens only at the start
 * of a word and `’` closes only where no letter or digit follows, so both stay
 * apostrophes inside names like Ka‘iulani and O’Brien.
 */
export const SINGLE_QUOTES = { open: '‘', close: '’' } as const;
/** The dash between two years, as format() writes it. */
export const DASH = '-';
/** Read as DASH between years: hyphens, figure, en, and em dashes, and minus. */
export const DASH_ALIASES: readonly string[] = ['‐', '‑', '‒', '–', '—', '−'];
/** Marks an approximate year: `c1932`. `c.`, `ca`, and `ca.` (any case) are read the same. */
export const APPROX = 'c';
/**
 * One year: four digits, or a full ISO date whose month and day are dropped
 * (`1932-05-14`), optionally approximate. Capture groups: approximate prefix, year.
 */
export const YEAR_PATTERN = `(${APPROX}a?\\.?)?(\\d{4})(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\\d|3[01]))?)?`;
/** Directive keys (`key: value`), matched case-insensitively. */
export const DIRECTIVES = { title: 'title', focus: 'focus' } as const;
export const MAX_PARTNERS = 2;
export const MAX_TRAITS = 3;
/** Longest trait, in characters, that fits a fan slot; longer ones are kept with a warning. */
export const MAX_TRAIT_LENGTH = 14;

/** DSL snippets the prompt quotes; tests/dsl/spec.test.ts parses each one. */
export const EXAMPLES = {
  couple: `Partner A ${PLUS} Partner B ${ARROW} Child1${COMMA} Child2`,
  person: `Ngozi Okafor 1931${DASH}2015 ${QUOTE}calm${COMMA} thrifty${QUOTE}`,
  bornDied: `1931${DASH}2015`,
  born: '1931',
  died: `${DASH}2015`,
  approximate: `${APPROX}1931`,
  unknownPartner: `Ada ${PLUS} ${UNKNOWN} ${ARROW} Nia`,
  singleParent: `Name ${ARROW} Child`,
  childless: `Partner A ${PLUS} Partner B`,
  sameName: `Nia${SUFFIX}2`,
  title: `${DIRECTIVES.title}: The Okafor Family`,
  focusOne: `${DIRECTIVES.focus}: Name`,
  focusTwo: `${DIRECTIVES.focus}: Name ${PLUS} Name`,
} as const;

/**
 * The short tree the prompt shows. Canonical (format() reproduces it), parses
 * with no diagnostics, and shares no names with the spec's example (whose
 * Rose, Al, Mary, and John are typical user input), so chatbots have nothing
 * to copy into the user's family.
 */
export const PROMPT_EXAMPLE = `title: The Okafor Family

Ngozi Okafor 1931-2015 "calm, thrifty" + Emeka Okafor c1928-1999 -> Ada 1956, Obi 1960 "cheerful, handy"
Ada + ? -> Nia 1984
Obi -> Kofi 1990

focus: Nia
`;
