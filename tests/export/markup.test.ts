import { describe, expect, it } from 'vitest';
import { insertIntoRoot, prefixIds, setRootAttributes } from '../../src/export/markup';

const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" width="18in" height="24in" viewBox="0 0 1296 1728">';

describe('insertIntoRoot', () => {
  it('inserts right after the root start tag', () => {
    expect(insertIntoRoot(`${ROOT}<rect/></svg>`, '<defs/>')).toBe(`${ROOT}<defs/><rect/></svg>`);
  });

  it('skips a BOM, XML declaration, comments, and a doctype', () => {
    const prolog = '\ufeff<?xml version="1.0"?>\n<!-- <svg in a comment> -->\n<!DOCTYPE svg>\n';
    expect(insertIntoRoot(`${prolog}${ROOT}</svg>`, '<defs/>')).toBe(`${prolog}${ROOT}<defs/></svg>`);
  });

  it('is not fooled by > inside quoted attribute values', () => {
    const root = `<svg aria-label="Kim > Ruiz" data-x='a>b' xmlns="http://www.w3.org/2000/svg">`;
    expect(insertIntoRoot(`${root}<g/></svg>`, '<defs/>')).toBe(`${root}<defs/><g/></svg>`);
  });

  it('opens a self-closing root', () => {
    expect(insertIntoRoot('<svg xmlns="http://www.w3.org/2000/svg" />', '<defs/>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><defs/></svg>');
  });

  it('throws without a root svg element', () => {
    expect(() => insertIntoRoot('<html></html>', '<defs/>')).toThrow(/root <svg>/);
    expect(() => insertIntoRoot('<svgx></svgx>', '<defs/>')).toThrow();
    expect(() => insertIntoRoot('<svg width="1"', '<defs/>')).toThrow();
  });
});

describe('setRootAttributes', () => {
  it('replaces existing values on the root only, in either quote style', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width='18in' height="24in" stroke-width="2"><rect width="10" height="10"/></svg>`;
    expect(setRootAttributes(svg, { width: '5400', height: '7200' })).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="5400" height="7200" stroke-width="2"><rect width="10" height="10"/></svg>`,
    );
  });

  it('adds missing attributes', () => {
    expect(setRootAttributes('<svg viewBox="0 0 1 1"/>', { preserveAspectRatio: 'none' })).toBe('<svg preserveAspectRatio="none" viewBox="0 0 1 1"/>');
  });
});

describe('prefixIds', () => {
  it('prefixes ids and every same-document reference to them', () => {
    const svg = [
      '<svg aria-labelledby="t d">',
      '<title id="t">Tree</title><desc id="d">x</desc>',
      '<style>.a { fill: url(#g1); }</style>',
      '<linearGradient id="g1"/><path id="arc-1" d="M0 0"/>',
      '<rect fill="url(#g1)" clip-path="url(\'#g1\')"/>',
      '<text><textPath href="#arc-1">Rose</textPath></text>',
      '<use xlink:href="#arc-1"/>',
      '</svg>',
    ].join('');
    expect(prefixIds(svg, 'p-')).toBe(
      [
        '<svg aria-labelledby="p-t p-d">',
        '<title id="p-t">Tree</title><desc id="p-d">x</desc>',
        '<style>.a { fill: url(#p-g1); }</style>',
        '<linearGradient id="p-g1"/><path id="p-arc-1" d="M0 0"/>',
        '<rect fill="url(#p-g1)" clip-path="url(\'#p-g1\')"/>',
        '<text><textPath href="#p-arc-1">Rose</textPath></text>',
        '<use xlink:href="#p-arc-1"/>',
        '</svg>',
      ].join(''),
    );
  });

  it('leaves data-id, external links, unknown references, and text content alone', () => {
    const svg = '<svg><g data-id="rose-kim"><a href="https://example.com/#x"/><use href="#missing"/><text>id="t" url(#t)</text></g><g id="t"/></svg>';
    expect(prefixIds(svg, 'p-')).toBe(
      '<svg><g data-id="rose-kim"><a href="https://example.com/#x"/><use href="#missing"/><text>id="t" url(#t)</text></g><g id="p-t"/></svg>',
    );
  });

  it('returns the input unchanged when there are no ids', () => {
    const svg = '<svg><rect width="1"/></svg>';
    expect(prefixIds(svg, 'p-')).toBe(svg);
  });
});
