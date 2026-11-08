import { buildIndex } from '../model/index';
import { hasErrors, type Diagnostic, type ParseResult, type Person, type PersonId, type Tree, type Union } from '../model/types';
import { DIRECTIVES, EXAMPLES, PLUS, SUFFIX } from './spec';
import { readDirective, readFocus, readTitle, readUnionLine, type PersonEntry } from './syntax';
import { isFenceLine, scanLine, splitLines, stripListMarker, type Token } from './tokenize';
import { formatYear, type Year } from './years';

const quoted = (text: string): string => `"${text}"`;

/** The id an `@n` reference selects: `Name@1` is `Name`. */
function suffixedId(name: string, index: number): PersonId {
  return index === 1 ? name : `${name}${SUFFIX}${index}`;
}

function entryId(entry: PersonEntry): PersonId {
  return entry.index === null ? entry.name : suffixedId(entry.name, entry.index);
}

type Lookup = { kind: 'found'; person: Person } | { kind: 'none' } | { kind: 'ambiguous'; message: string };

interface FocusLine {
  line: number;
  entries: PersonEntry[];
}

/** Lines that set a person's details, for conflict messages. */
interface DetailLines {
  birth?: number;
  death?: number;
  traits?: number;
}

/** Accumulates persons, unions, and diagnostics line by line (spec "Identity and merging"). */
class TreeBuilder {
  readonly persons = new Map<PersonId, Person>();
  readonly unions: Union[] = [];
  readonly diagnostics: Diagnostic[] = [];
  private readonly byName = new Map<string, Person[]>();
  private readonly parentUnion = new Map<PersonId, Union>();
  /** Partners of a union with children: the only persons who can be someone's ancestor. */
  private readonly hasChildren = new Set<PersonId>();
  private readonly couples = new Map<string, number>();
  private readonly detailLines = new Map<PersonId, DetailLines>();

  error(line: number, message: string): void {
    this.diagnostics.push({ line, severity: 'error', message });
  }

  warn(line: number, message: string): void {
    this.diagnostics.push({ line, severity: 'warning', message });
  }

  /** A union line, or a line naming one person (which creates or describes them but adds no union). */
  addLine(tokens: readonly Token[], line: number): void {
    const syntax = readUnionLine(tokens);
    if (syntax.kind === 'error') return this.error(line, syntax.message);
    for (const warning of syntax.warnings) this.warn(line, warning);
    if (syntax.kind === 'person') {
      this.resolve(syntax.entry, line);
      return;
    }

    const partners = syntax.partners.map((entry) => (entry === null ? null : this.resolve(entry, line)));
    const children = syntax.children.map((entry) => this.resolve(entry, line));
    if (partners.includes(undefined) || children.includes(undefined)) return;
    const [first, second] = partners;
    if (first && first === second) {
      this.error(line, `${quoted(first.id)} is listed as their own partner.${this.sameNameHint(first)}`);
      return;
    }

    const partnerIds = partners.map((p) => p?.id ?? null);
    const union: Union = { id: `u${this.unions.length}`, partners: partnerIds, children: [], sourceLine: line, implied: false };
    for (const child of children) {
      if (child && this.canAddChild(union, child, line)) {
        union.children.push(child.id);
        this.parentUnion.set(child.id, union);
      }
    }
    const isCouple = partnerIds.length === 2 && partnerIds.some((id) => id !== null);
    if (union.children.length === 0 && !isCouple) return;
    this.unions.push(union);
    if (union.children.length > 0) {
      for (const id of partnerIds) if (id !== null) this.hasChildren.add(id);
    }

    if (first && second) {
      const key = [first.id, second.id].sort().join('\n');
      const earlier = this.couples.get(key);
      if (earlier === undefined) {
        this.couples.set(key, line);
      } else {
        this.warn(line, `${quoted(first.id)} and ${quoted(second.id)} are already a couple on line ${earlier}; list all their children on one line.`);
      }
    }
  }

  private canAddChild(union: Union, child: Person, line: number): boolean {
    const id = child.id;
    if (union.children.includes(id)) {
      this.error(line, `${quoted(id)} is listed twice as a child on this line.`);
      return false;
    }
    if (union.partners.includes(id)) {
      this.error(line, `${quoted(id)} is listed as both a parent and a child on this line.${this.sameNameHint(child)}`);
      return false;
    }
    const parents = this.parentUnion.get(id);
    if (parents) {
      this.error(
        line,
        `${quoted(id)} is already a child on line ${parents.sourceLine}; a person can be a child in only one union.${this.sameNameHint(child)}`,
      );
      return false;
    }
    if (this.hasChildren.has(id) && union.partners.some((partner) => partner !== null && this.isAncestor(id, partner))) {
      this.error(line, `Listing ${quoted(id)} as a child here makes them their own ancestor.${this.sameNameHint(child)}`);
      return false;
    }
    return true;
  }

  /** True when `ancestor` is `start` or one of its ancestors. */
  private isAncestor(ancestor: PersonId, start: PersonId): boolean {
    const stack = [start];
    const seen = new Set<PersonId>();
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === ancestor) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const parent of this.parentUnion.get(id)?.partners ?? []) {
        if (parent !== null) stack.push(parent);
      }
    }
    return false;
  }

  /** Suggests the next free `@n`, for a mention that may be a different person with the same name. */
  private sameNameHint(person: Person): string {
    let index = 2;
    while (this.persons.has(suffixedId(person.name, index))) index++;
    return ` If these are two different people with the same name, write the other one as ${quoted(suffixedId(person.name, index))}.`;
  }

  /** The person an entry refers to, without creating anyone. */
  lookup(entry: PersonEntry): Lookup {
    if (entry.index !== null) {
      const person = this.persons.get(entryId(entry));
      return person ? { kind: 'found', person } : { kind: 'none' };
    }
    const named = this.byName.get(entry.name) ?? [];
    if (named.length === 0) return { kind: 'none' };
    if (named.length === 1) return { kind: 'found', person: named[0]! };
    const born = entry.birth?.year;
    const matches = born === undefined ? [] : named.filter((p) => p.birth === born);
    if (matches.length === 1) return { kind: 'found', person: matches[0]! };

    const list = named.map((p) => (p.birth === null ? p.id : `${p.id} (born ${p.birth})`));
    const people = `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
    const example = quoted(`${entry.name}${SUFFIX}2`);
    let message: string;
    if (born === undefined) {
      message = `There are ${named.length} people named ${quoted(entry.name)}: ${people}. Add a birth year or a number to say which, like ${example}.`;
    } else if (matches.length === 0) {
      message = `No ${quoted(entry.name)} was born in ${born}; there are ${people}. Use one of their birth years, or a number like ${example}.`;
    } else {
      message = `More than one ${quoted(entry.name)} was born in ${born}. Use a number to say which, like ${example}.`;
    }
    return { kind: 'ambiguous', message };
  }

  /** Resolves an entry to a person, creating one when it matches nobody; undefined (after an error) when ambiguous. */
  resolve(entry: PersonEntry, line: number): Person | undefined {
    const found = this.lookup(entry);
    if (found.kind === 'ambiguous') {
      this.error(line, found.message);
      return undefined;
    }
    if (found.kind === 'none') return this.create(entry, line);
    this.merge(found.person, entry, line);
    return found.person;
  }

  create(entry: PersonEntry, line: number): Person {
    const person: Person = {
      id: entryId(entry),
      name: entry.name,
      birth: null,
      birthApprox: false,
      death: null,
      deathApprox: false,
      traits: [],
      sourceLine: line,
    };
    this.persons.set(person.id, person);
    const named = this.byName.get(person.name);
    if (named) named.push(person);
    else this.byName.set(person.name, [person]);
    this.merge(person, entry, line);
    return person;
  }

  /** Fills details the person is missing; a different value is a warning, and the first one stays. */
  merge(person: Person, entry: PersonEntry, line: number): void {
    const lines = this.detailLines.get(person.id) ?? {};
    this.detailLines.set(person.id, lines);

    const mergeYear = (field: 'birth' | 'death', value: Year | null): void => {
      if (value === null) return;
      const approx = field === 'birth' ? 'birthApprox' : 'deathApprox';
      const current = person[field];
      if (current === null) {
        person[field] = value.year;
        person[approx] = value.approx;
        lines[field] = line;
      } else if (current !== value.year) {
        const kept = formatYear({ year: current, approx: person[approx] });
        this.warn(
          line,
          `${quoted(person.id)} already has ${field} year ${kept} (line ${lines[field]}), so ${formatYear(value)} is ignored.${this.sameNameHint(person)}`,
        );
      }
    };
    mergeYear('birth', entry.birth);
    mergeYear('death', entry.death);

    const traits = entry.traits;
    if (traits === null || traits.length === 0) return;
    if (person.traits.length === 0) {
      person.traits = traits;
      lines.traits = line;
    } else if (traits.join('\n') !== person.traits.join('\n')) {
      this.warn(
        line,
        `${quoted(person.id)} already has the traits ${quoted(person.traits.join(', '))} (line ${lines.traits}), so ${quoted(traits.join(', '))} is ignored.`,
      );
    }
  }

  /**
   * Resolves the focus names after every other line. An unknown name is an
   * error, except in a couple whose other name resolves, or when the focus line
   * is the whole tree (no persons, no errors): then it creates the person.
   * Returns the focus ids, or [] after an error.
   */
  resolveFocus({ line, entries }: FocusLine): PersonId[] {
    const found = entries.map((entry) => this.lookup(entry));
    let failed = false;
    for (const f of found) {
      if (f.kind === 'ambiguous') {
        this.error(line, f.message);
        failed = true;
      }
    }
    if (failed) return [];

    const alone = this.persons.size === 0 && !hasErrors(this.diagnostics);
    const createOne = entries.length === 2 && found.filter((f) => f.kind === 'none').length === 1;
    const earlierErrors = hasErrors(this.diagnostics) ? ' A line with an error is skipped, so fix those first.' : '';
    const focus: Person[] = [];
    entries.forEach((entry, i) => {
      const f = found[i]!;
      if (f.kind === 'found') {
        this.merge(f.person, entry, line);
        focus.push(f.person);
      } else if (createOne || alone) {
        focus.push(this.persons.get(entryId(entry)) ?? this.create(entry, line));
      } else {
        this.error(line, `The focus ${quoted(entryId(entry))} is not in the tree. Check the spelling, or add them to a line above.${earlierErrors}`);
      }
    });
    if (focus.length !== entries.length) return [];
    if (focus.length === 2 && focus[0] === focus[1]) {
      this.error(line, `The focus names ${quoted(focus[0]!.id)} twice. Name one person, or two different people joined by ${quoted(PLUS)}.`);
      return [];
    }
    return focus.map((p) => p.id);
  }
}

/**
 * Parses family-tree DSL into a Tree plus diagnostics (spec "DSL specification").
 * Pure, deterministic, and never throws.
 *
 * Lines are numbered from 1 by splitting on `\n` (a trailing `\r` is ignored).
 * `#` starts a comment to end of line; blank lines and leading whitespace are ignored.
 *
 * - Directives `key: value`: `title: <text>` (trimmed; the first one wins, later
 *   ones warn) and `focus: A` or `focus: A + B` (couple mode). A second focus
 *   directive is an error.
 * - Union lines: `A + B -> C, D`; `A + B` (no children); `A -> C` (partners `[A]`);
 *   `A + ? -> C` (partners `[A, null]`, written order kept, so `? + A` gives `[null, A]`).
 * - Person entry: `Name [years] ["traits"]`, in that order, separated by spaces.
 *   - Name: words without `+`, `->`, `,`, `"`, `#`; Unicode; case-sensitive; trimmed
 *     with inner whitespace collapsed to one space. An optional `@n` suffix selects
 *     the person with id `Name@n` (n >= 2), creating it if new; `Name@1` means id `Name`.
 *   - years: `1932-2019`, `1932`, `1932-` (living), `-2019` (birth unknown); a `c`
 *     prefix on either year marks it approximate (`c1932`, `1932-c2019`). A full ISO
 *     date (`1932-05-14`) is accepted wherever a year is and keeps only the year.
 *   - traits: one quoted string (straight `"` or curly quotes), split on commas,
 *     trimmed, empty items dropped. More than 3 items: warning, the first 3 are kept.
 *     An item longer than 14 characters: warning, kept as written.
 *
 * Identity: a plain name matching exactly one person is that person; details on a
 * later mention fill fields still missing (null years, empty traits), and a
 * conflicting value is a warning where the first value wins. A name matching
 * several persons must be disambiguated by birth year or `@n` (error otherwise).
 * A name with no match creates a person.
 *
 * Order and ids: lines are processed top to bottom and entries left to right
 * (partners, then children). Persons enter `tree.persons` at first mention with
 * `sourceLine` = that line. Each union line appends one union `u0`, `u1`, ...
 * The focus directive is resolved after all other lines: each focus name resolves
 * like a reference (details on the focus line fill missing fields). A name that
 * matches nobody is an error ("focus not found"), except in a couple focus whose
 * other name resolves: then it creates that person (`sourceLine` = the focus line),
 * which is how `focus: Sarah + Dave Ruiz 1979 "loyal, curious"` introduces Dave Ruiz.
 * A focus line that is the whole tree (no other persons, no errors) creates its
 * persons too, so `focus: Ann` alone draws Ann.
 * When no union line joins the two focus persons (in either order), an implied
 * union is appended last: partners in focus order, no children, `implied: true`,
 * `sourceLine` = the focus line.
 *
 * Errors (block rendering): unparseable line, a person who is a child in a second
 * union, missing focus (line 0), focus not found, ambiguous name, duplicate focus.
 * Warnings (still render): conflicting detail, more than 3 traits, trait over 14
 * characters, duplicate title, and one per person not connected to the focus (at
 * the person's sourceLine). Unconnected persons stay in `tree.persons` so format()
 * keeps them; the poster omits them.
 *
 * With errors, the tree holds what parsed (best effort) and `focus` may be empty.
 * tests/fixtures/{example,sample}-tree.ts give the exact trees for EXAMPLE_DSL and
 * SAMPLE_DSL, each with no diagnostics.
 *
 * Also accepted, because chatbots emit them: CRLF, tabs and non-breaking spaces,
 * code fence lines (read as blank, so line numbers hold), list markers (`- `,
 * `1. `) at the start of a line, `→` for `->`, curly quotes, en and em dashes and
 * spaced dashes in years, years in parentheses, and case-insensitive directive keys. A line naming one person with no `+` or `->`
 * declares or describes that person without adding a union. More errors: a person
 * partnered with themselves, a child listed twice, a child who would become their
 * own ancestor. More warnings: unknown directive, a couple written on two lines,
 * a death year before the birth year. Diagnostics are sorted by line; the
 * unconnected-person warnings are skipped while there are errors.
 */
export function parse(dsl: string): ParseResult {
  const builder = new TreeBuilder();
  let title: { value: string; line: number } | null = null;
  let focusLine = 0;
  let focusEntries: FocusLine | null = null;

  for (const [i, raw] of splitLines(dsl).entries()) {
    const line = i + 1;
    if (isFenceLine(raw)) continue;
    const { code, tokens } = scanLine(stripListMarker(raw));
    if (code.trim() === '') continue;
    const directive = readDirective(code);
    if (directive === null) {
      builder.addLine(tokens, line);
    } else if (directive.key === DIRECTIVES.title) {
      const value = readTitle(directive.value);
      if (value === null) continue;
      if (title === null) title = { value, line };
      else builder.warn(line, `Only one title is used: the one on line ${title.line}. This line is ignored.`);
    } else if (directive.key === DIRECTIVES.focus) {
      if (focusLine !== 0) {
        builder.error(line, `Only one focus line is allowed, and line ${focusLine} already has one. Remove one of them.`);
        continue;
      }
      focusLine = line;
      const syntax = readFocus(scanLine(directive.value).tokens);
      if (syntax.kind === 'error') {
        builder.error(line, syntax.message);
        continue;
      }
      for (const warning of syntax.warnings) builder.warn(line, warning);
      focusEntries = { line, entries: syntax.entries };
    } else {
      builder.warn(
        line,
        `Unknown directive ${quoted(`${directive.written}:`)}; this line is ignored. The directives are "${DIRECTIVES.title}:" and "${DIRECTIVES.focus}:"; layout and colors are chosen in the options bar.`,
      );
    }
  }

  const { persons, unions, diagnostics } = builder;
  let focus: PersonId[] = [];
  if (focusEntries !== null) {
    focus = builder.resolveFocus(focusEntries);
  } else if (focusLine === 0) {
    const first = persons.keys().next().value;
    builder.error(
      0,
      first === undefined
        ? `Nothing to draw yet. Write one line per couple, like ${quoted(EXAMPLES.couple)}, then a focus line, like ${quoted(`${DIRECTIVES.focus}: Child1`)}.`
        : `Add a focus line naming who the chart centers on, like ${quoted(`${DIRECTIVES.focus}: ${first}`)}, or two people joined by ${quoted(PLUS)} for a couple.`,
    );
  }

  const [a, b] = focus;
  if (a !== undefined && b !== undefined && !unions.some((u) => u.partners.includes(a) && u.partners.includes(b))) {
    unions.push({ id: `u${unions.length}`, partners: [a, b], children: [], sourceLine: focusLine, implied: true });
  }

  const tree: Tree = { persons, unions, focus, title: title?.value ?? null };
  if (focus.length > 0 && !hasErrors(diagnostics)) {
    const index = buildIndex(tree);
    const names = focus.join(' + ');
    for (const person of persons.values()) {
      if (index.isConnected(person.id)) continue;
      builder.warn(
        person.sourceLine,
        `${quoted(person.id)} isn't connected to the focus (${names}), so the poster leaves them out. Check the spelling of the names on this line.`,
      );
    }
  }

  diagnostics.sort((x, y) => x.line - y.line);
  return { tree, diagnostics };
}

const FENCED = /^\s*(`{3,})[^`\n]*\n(?:([\s\S]*?)\n)?[ \t]*\1`*\s*$/;

/**
 * Removes one Markdown code fence wrapping the whole text, as chatbots return:
 * optional surrounding whitespace, an opening fence line (three or more backticks
 * plus an optional language tag), the content, and a closing fence line. Returns
 * the content between the fence lines. Returns `text` unchanged when it is not
 * wrapped in a fence (including when prose surrounds the fence).
 */
export function stripCodeFence(text: string): string {
  const match = FENCED.exec(text);
  if (!match) return text;
  const content = match[2] ?? '';
  return content.endsWith('\r') ? content.slice(0, -1) : content;
}
