import type { Tree } from '../model/types';
import type { PageGeometry } from '../style';

const MAX_SLUG_LENGTH = 60;
const FOLDS: Readonly<Record<string, string>> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th' };

/**
 * A file-name slug: lowercase letters and digits (any script) joined by '-',
 * accents on Latin letters folded, a leading "the" dropped, at most 60
 * characters. '' when nothing is left.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/([A-Za-z])\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ßæœøłđðþ]/g, (char) => FOLDS[char] ?? char)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^the-(?=.)/, '');
  return Array.from(slug).slice(0, MAX_SLUG_LENGTH).join('').replace(/-+$/, '');
}

/** The poster's name for file names and the tab title: its `title:`, else the focus names ("Sarah & Dave Ruiz"). */
export function posterTitle(tree: Tree): string {
  if (tree.title) return tree.title;
  return tree.focus.map((id) => tree.persons.get(id)?.name ?? id).join(' & ');
}

/** Download name from the poster title and page, e.g. `kim-ruiz-family-18x24.png`; landscape pages add `-landscape`. */
export function posterFilename(
  title: string,
  page: Pick<PageGeometry, 'size' | 'orientation'>,
  extension: 'png' | 'svg',
): string {
  const slug = slugify(title) || 'family-tree';
  const landscape = page.orientation === 'landscape' ? '-landscape' : '';
  return `${slug}-${page.size}${landscape}.${extension}`;
}
