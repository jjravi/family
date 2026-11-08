const BLOCKED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
  'handler',
  'listener',
]);
const LINK_ATTRIBUTES = new Set(['href', 'xlink:href', 'src']);
const URL_ATTRIBUTES = new Set(['style', 'fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'cursor']);
const SAFE_LINK = /^(#|data:image\/(png|jpe?g|gif|webp);)/i;
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#|data:)/i;

export interface SafeSvg {
  /** The poster element, ready to insert into the page. */
  element: SVGSVGElement;
  /** Markup for print and export: the input itself unless something unsafe was removed. */
  markup: string;
}

function isUnsafeAttribute(attribute: Attr): boolean {
  const name = attribute.name.toLowerCase();
  if (name.startsWith('on')) return true;
  if (LINK_ATTRIBUTES.has(name)) return !SAFE_LINK.test(attribute.value.trim());
  return URL_ATTRIBUTES.has(name) && EXTERNAL_URL.test(attribute.value);
}

/**
 * Parses poster markup inertly (a `<template>`) and removes anything that could
 * run script or fetch from the network: script-capable and animation elements,
 * event-handler attributes, links other than in-document references and embedded
 * images, and external `url(...)` references. The poster arrives from a share
 * link, so this guards the page even if escaping upstream ever slips. Null when
 * the markup holds no `<svg>`.
 */
export function sanitizeSvg(markup: string): SafeSvg | null {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const svg = template.content.querySelector('svg');
  if (!svg) return null;

  let changed = false;
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    const name = element.localName.toLowerCase();
    const css = name === 'style' ? (element.textContent ?? '') : '';
    if (BLOCKED_ELEMENTS.has(name) || /@import/i.test(css) || EXTERNAL_URL.test(css)) {
      element.remove();
      changed = true;
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (!isUnsafeAttribute(attribute)) continue;
      element.removeAttributeNode(attribute);
      changed = true;
    }
  }
  return { element: svg, markup: changed ? new XMLSerializer().serializeToString(svg) : markup };
}
