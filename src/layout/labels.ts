import { isLiving, type Person, type Tree } from '../model/types';
import type { Style } from '../style';

/** The text shown for one person, after the style toggles. */
export interface PersonLabel {
  name: string;
  /** `1932 – 2019`, `b. 1932`, `d. 2019`, `c. 1927 – 2008`; null when hidden or unknown. */
  dates: string | null;
  /** `kind · passionate`; null when hidden or empty. */
  traits: string | null;
}

/** The style toggles that change label text. */
export type LabelToggles = Pick<Style, 'dates' | 'traits' | 'living'>;

function year(value: number, approx: boolean): string {
  return approx ? `c. ${value}` : String(value);
}

/** The dates line for a person, honoring `living` (hide birth years of living persons). Null when nothing shows. */
export function datesLine(person: Person, living: boolean): string | null {
  const birth = person.birth === null || (living && isLiving(person)) ? null : year(person.birth, person.birthApprox);
  const death = person.death === null ? null : year(person.death, person.deathApprox);
  if (birth && death) return `${birth} \u2013 ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
}

/** The name, dates line, and trait line shown for a person under the toggles. */
export function personLabel(person: Person, toggles: LabelToggles): PersonLabel {
  return {
    name: person.name,
    dates: toggles.dates ? datesLine(person, toggles.living) : null,
    traits: toggles.traits && person.traits.length > 0 ? person.traits.join(' \u00b7 ') : null,
  };
}

/**
 * The poster title: `tree.title`, else decision 27's "A & B" using surnames
 * when both partners have one ("Kim & Ruiz"; "Sarah & Dave Ruiz" otherwise),
 * and the person's name for a single root.
 */
export function posterTitle(tree: Tree): string {
  if (tree.title) return tree.title;
  const names = tree.focus.map((id) => tree.persons.get(id)?.name ?? id);
  if (names.length < 2) return names[0] ?? '';
  const [a, b] = names as [string, string];
  const surname = (name: string): string | null => {
    const words = name.trim().split(/\s+/);
    return words.length > 1 ? words.at(-1)! : null;
  };
  const sa = surname(a);
  const sb = surname(b);
  if (sa && sb && sa !== sb) return `${sa} & ${sb}`;
  if (sa && sb) return `${a.slice(0, a.lastIndexOf(sa)).trim()} & ${b}`;
  return `${a} & ${b}`;
}
