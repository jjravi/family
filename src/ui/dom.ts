/** Attribute values for h(): true sets an empty attribute; false, null, and undefined leave it out. */
export type Attrs = Record<string, string | number | boolean | null | undefined>;
export type Child = Node | string | null | undefined | false;

/** Sets or removes attributes (see Attrs). */
export function setAttrs(element: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
}

/** Creates an HTML element with attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setAttrs(element, attrs);
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) element.append(child);
  }
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A decorative 24×24 stroke icon from path data (see ICONS). */
export function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  setAttrs(svg, { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true', focusable: 'false' });
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

let counter = 0;

/** A page-unique id for wiring labels to controls. */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
