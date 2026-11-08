interface RootTag {
  /** Index of the `<` of the root `<svg`. */
  start: number;
  /** Index of the `>` that ends the root start tag. */
  end: number;
  selfClosing: boolean;
}

/** Start tags whose quoted attribute values may hold `>`. */
const START_TAG = /<[A-Za-z][^"'>]*(?:(?:"[^"]*"|'[^']*')[^"'>]*)*>/g;

function rootTag(svg: string): RootTag | null {
  let i = 0;
  for (;;) {
    while (i < svg.length && (/\s/.test(svg[i]!) || svg[i] === '\ufeff')) i++;
    const close = svg.startsWith('<?', i) ? '?>' : svg.startsWith('<!--', i) ? '-->' : svg.startsWith('<!', i) ? '>' : null;
    if (close === null) break;
    const next = svg.indexOf(close, i + 2);
    if (next < 0) return null;
    i = next + close.length;
  }
  if (!/^<svg[\s/>]/i.test(svg.slice(i, i + 5))) return null;
  let quote = '';
  for (let j = i + 4; j < svg.length; j++) {
    const c = svg[j];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return { start: i, end: j, selfClosing: svg[j - 1] === '/' };
    }
  }
  return null;
}

function requireRoot(svg: string): RootTag {
  const tag = rootTag(svg);
  if (!tag) throw new Error('Not an SVG document: no root <svg> element.');
  return tag;
}

/** `svg` with `markup` inserted as the first child of the root `<svg>` element (a self-closing root is opened up). Throws when there is no root `<svg>`. */
export function insertIntoRoot(svg: string, markup: string): string {
  const { end, selfClosing } = requireRoot(svg);
  if (selfClosing) return `${svg.slice(0, end - 1).trimEnd()}>${markup}</svg>${svg.slice(end + 1)}`;
  return `${svg.slice(0, end + 1)}${markup}${svg.slice(end + 1)}`;
}

/** `svg` with these attributes set on the root `<svg>` start tag, replacing existing values. Values must not contain `"`. */
export function setRootAttributes(svg: string, attributes: Readonly<Record<string, string>>): string {
  const { start, end } = requireRoot(svg);
  let tag = svg.slice(start, end + 1);
  for (const [name, value] of Object.entries(attributes)) {
    const existing = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`);
    tag = existing.test(tag) ? tag.replace(existing, `$1"${value}"`) : tag.replace(/^<svg/i, `$& ${name}="${value}"`);
  }
  return `${svg.slice(0, start)}${tag}${svg.slice(end + 1)}`;
}

function mapAttribute(tag: string, names: string, map: (value: string) => string): string {
  return tag.replace(
    new RegExp(`(\\s(?:${names})\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'g'),
    (_, before: string, double: string | undefined, single: string | undefined) =>
      double !== undefined ? `${before}"${map(double)}"` : `${before}'${map(single!)}'`,
  );
}

/**
 * `svg` with every element id prefixed, and every same-document reference to
 * those ids (`href` / `xlink:href="#id"`, `url(#id)`, `aria-labelledby`,
 * `aria-describedby`) updated to match. A second copy of a poster in the same
 * HTML document needs this: duplicate ids would resolve to the first copy.
 */
export function prefixIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  for (const [tag] of svg.matchAll(START_TAG)) {
    for (const match of tag.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) ids.add(match[1] ?? match[2]!);
  }
  if (ids.size === 0) return svg;
  const rename = (id: string) => (ids.has(id) ? `${prefix}${id}` : id);
  const renameRef = (ref: string) => (ref.startsWith('#') ? `#${rename(ref.slice(1))}` : ref);
  const renameList = (list: string) => list.replace(/\S+/g, rename);
  const renameUrls = (text: string) =>
    text.replace(/url\(\s*(["']?)#([^"')\s]+)\1\s*\)/g, (_, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`);
  return svg
    .replace(START_TAG, (tag) =>
      renameUrls(
        mapAttribute(mapAttribute(mapAttribute(tag, 'id', rename), 'href|xlink:href', renameRef), 'aria-labelledby|aria-describedby', renameList),
      ),
    )
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open: string, css: string, close: string) => `${open}${renameUrls(css)}${close}`);
}
