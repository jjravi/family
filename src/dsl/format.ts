import type { Person, PersonId, Tree, Union } from '../model/types';
import { ARROW, COMMA, DIRECTIVES, PLUS, QUOTE, SUFFIX, UNKNOWN } from './spec';
import { readDirective, readTitle } from './syntax';
import { scanLine } from './tokenize';
import { formatYears } from './years';

const SUFFIXED_ID = new RegExp(`^(.*)${SUFFIX}([1-9]\\d*)$`, 's');

/** The title as the parser reads it back from `title: <text>`. */
function titleReadBack(text: string): string | null {
  const directive = readDirective(scanLine(`${DIRECTIVES.title}: ${text}`).code);
  return directive ? readTitle(directive.value) : null;
}

/** The title text to write: as is, or quoted when a `#` or surrounding quotes would otherwise change it. */
function titleText(title: string): string {
  const wrapped = `${QUOTE}${title}${QUOTE}`;
  return [title, wrapped].find((text) => titleReadBack(text) === title) ?? title;
}

/** Writes person entries, adding years and traits only at a person's first appearance. */
class EntryWriter {
  private readonly tree: Tree;
  private readonly written = new Set<PersonId>();
  private readonly sharedNames = new Set<string>();

  constructor(tree: Tree) {
    this.tree = tree;
    const seen = new Set<string>();
    for (const { name } of tree.persons.values()) {
      if (seen.has(name)) this.sharedNames.add(name);
      seen.add(name);
    }
  }

  isWritten(id: PersonId): boolean {
    return this.written.has(id);
  }

  /** Persons a union line would introduce, in the order it mentions them. */
  newIn(union: Union): PersonId[] {
    const ids = [...union.partners, ...union.children].filter(
      (id): id is PersonId => id !== null && this.tree.persons.has(id) && !this.written.has(id),
    );
    return [...new Set(ids)];
  }

  /** `Name`, or `Name@n` when the name is shared or the id carries a suffix. */
  private reference(person: Person): string {
    if (person.id === person.name) {
      return this.sharedNames.has(person.name) ? `${person.name}${SUFFIX}1` : person.name;
    }
    const suffixed = SUFFIXED_ID.exec(person.id);
    return suffixed && suffixed[1] === person.name ? person.id : person.name;
  }

  entry(id: PersonId): string {
    const person = this.tree.persons.get(id);
    if (!person) return id;
    const reference = this.reference(person);
    if (this.written.has(id)) return reference;
    this.written.add(id);
    const birth = person.birth === null ? null : { year: person.birth, approx: person.birthApprox };
    const death = person.death === null ? null : { year: person.death, approx: person.deathApprox };
    const years = formatYears({ birth, death });
    const traits = person.traits.length > 0 ? `${QUOTE}${person.traits.join(`${COMMA} `)}${QUOTE}` : '';
    return [reference, years, traits].filter((part) => part !== '').join(' ');
  }

  union(union: Union): string {
    const partners = union.partners.map((id) => (id === null ? UNKNOWN : this.entry(id)));
    const left = partners.length > 0 ? partners.join(` ${PLUS} `) : UNKNOWN;
    if (union.children.length === 0) return left;
    return `${left} ${ARROW} ${union.children.map((id) => this.entry(id)).join(`${COMMA} `)}`;
  }
}

/**
 * Canonical DSL for a tree, used by the editor's Tidy button. Output: `title:`
 * first (when set), then one line per non-implied union in `tree.unions` order,
 * then the `focus:` line, ending with a newline. Each person's years and traits
 * are written once, at their first appearance in the output (so a person created
 * by the focus line gets details on the `focus:` line); `?` is an unknown partner;
 * an approximate year is written `c1932`. Whenever a name is shared by several
 * persons, every reference carries `@n` (`Name@1` for id `Name`). Comments and
 * blank lines are not preserved.
 *
 * Contract: `parse(format(parse(x).tree)).tree` equals `parse(x).tree` (persons
 * in the same insertion order, same union ids) except for `sourceLine` values.
 *
 * Blank lines separate the title, the union lines, and the focus line. A person
 * who comes before a union line's other new persons in insertion order (or is in
 * no union line) gets a line of their own, so the order survives re-parsing. Ids
 * with a suffix (`Ana@2`) are always written with it. An empty tree formats to ''.
 */
export function format(tree: Tree): string {
  const writer = new EntryWriter(tree);
  const order = [...tree.persons.keys()];
  let cursor = 0;
  /** The next `count` persons, in insertion order, that the output has not introduced yet. */
  const upcoming = (count: number): PersonId[] => {
    while (cursor < order.length && writer.isWritten(order[cursor]!)) cursor++;
    const ids: PersonId[] = [];
    for (let i = cursor; i < order.length && ids.length < count; i++) {
      if (!writer.isWritten(order[i]!)) ids.push(order[i]!);
    }
    return ids;
  };

  const body: string[] = [];
  for (const union of tree.unions) {
    if (union.implied) continue;
    for (;;) {
      const introduced = writer.newIn(union);
      const due = upcoming(introduced.length);
      if (due.every((id, i) => id === introduced[i])) break;
      body.push(writer.entry(due[0]!));
    }
    body.push(writer.union(union));
  }

  const rest = upcoming(order.length);
  const last = rest.at(-1);
  const focusIntroducesLast =
    last !== undefined && tree.focus.length === 2 && tree.focus.includes(last) && tree.focus.some((id) => id !== last && tree.persons.has(id));
  for (const id of focusIntroducesLast ? rest.slice(0, -1) : rest) body.push(writer.entry(id));

  const sections: string[] = [];
  if (tree.title !== null && tree.title !== '') sections.push(`${DIRECTIVES.title}: ${titleText(tree.title)}`);
  if (body.length > 0) sections.push(body.join('\n'));
  if (tree.focus.length > 0) {
    sections.push(`${DIRECTIVES.focus}: ${tree.focus.map((id) => writer.entry(id)).join(` ${PLUS} `)}`);
  }
  return sections.length > 0 ? `${sections.join('\n\n')}\n` : '';
}
