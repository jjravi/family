import { describe, expect, it } from 'vitest';
import { embeddedFontCss, facesForSvg, matchWeight, usedFontFamilies } from '../../src/export/fontembed';
import { approxMeasurer } from '../../src/layout/measure';
import { drawPoster } from '../../src/render/poster';
import { DEFAULT_STYLE, THEME_IDS } from '../../src/style';
import { resolveTheme } from '../../src/themes';
import { FONT_FACES, FONT_FAMILIES, fontStack } from '../../src/themes/fonts';
import { sampleTree } from '../fixtures/sample-tree';

const { playfair, sourceSans, cormorant, greatVibes, jost } = FONT_FAMILIES;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const names = (faces: { family: string; weight: number; style: string; subset: string }[]) =>
  faces.map((f) => `${f.family}|${f.weight}|${f.style}|${f.subset}`);

describe('usedFontFamilies', () => {
  it('finds fontStack() families in font-family attributes', () => {
    const markup = svg(`<text font-family="${fontStack(playfair)}">Rose</text><text font-family="${fontStack(greatVibes)}">Kim</text>`);
    expect(usedFontFamilies(markup)).toEqual([playfair, greatVibes]);
  });

  it('finds families in style attributes, <style> rules, and the font shorthand, quoted or not, in any case', () => {
    expect(usedFontFamilies(svg(`<text style="font-size: 12px; font-family: &quot;Jost&quot;, sans-serif">a</text>`))).toEqual([jost]);
    expect(usedFontFamilies(svg(`<style>.t { font: italic 600 14px 'Cormorant Garamond', serif }</style>`))).toEqual([cormorant]);
    expect(usedFontFamilies(svg(`<text font-family="source sans 3, sans-serif">a</text>`))).toEqual([sourceSans]);
    expect(usedFontFamilies(svg(`<text font-family='"Great Vibes", cursive'>a</text>`))).toEqual([greatVibes]);
  });

  it('ignores family names that only appear as text', () => {
    expect(usedFontFamilies(svg(`<text font-family="serif">Jost Playfair Display</text>`))).toEqual([]);
  });
});

describe('matchWeight', () => {
  it('picks the weight CSS font matching would', () => {
    expect(matchWeight([500, 600], 500)).toBe(500);
    expect(matchWeight([500, 600], 400)).toBe(500);
    expect(matchWeight([300, 500], 450)).toBe(500);
    expect(matchWeight([300, 600], 450)).toBe(300);
    expect(matchWeight([400, 600], 500)).toBe(400);
    expect(matchWeight([300, 500], 600)).toBe(500);
    expect(matchWeight([300, 500], 200)).toBe(300);
    expect(matchWeight([500, 600], 300)).toBe(500);
    expect(matchWeight([], 400)).toBeUndefined();
  });
});

describe('facesForSvg', () => {
  it('embeds only the normal latin face for plain ASCII text without italics (undeclared weight = 400)', () => {
    const markup = svg(`<text font-family="${fontStack(playfair)}">Rose Kim 1932 – 2019 “kind”</text>`);
    expect(names(facesForSvg(markup))).toEqual(['Playfair Display|500|normal|latin']);
  });

  it('adds italic faces when the SVG uses italic', () => {
    const markup = svg(`<text font-family="${fontStack(jost)}" font-style="italic" font-weight="300">kind · warm</text>`);
    expect(names(facesForSvg(markup))).toEqual(['Jost|300|normal|latin', 'Jost|500|normal|latin', 'Jost|300|italic|latin']);
  });

  it('embeds the instance the browser picks for each declared weight', () => {
    const markup = svg(`<text font-family="${fontStack(playfair)}" font-weight="600">Sarah</text><text font-family="${fontStack(playfair)}" font-weight="500">Mia</text>`);
    expect(names(facesForSvg(markup))).toEqual(['Playfair Display|500|normal|latin', 'Playfair Display|600|normal|latin']);
  });

  it('reads weights from style declarations and the font shorthand', () => {
    const markup = svg(`<style>.t { font: italic 600 14px 'Cormorant Garamond', serif }</style><text class="t">a</text>`);
    expect(names(facesForSvg(markup))).toEqual([
      'Cormorant Garamond|500|normal|latin',
      'Cormorant Garamond|600|normal|latin',
      'Cormorant Garamond|500|italic|latin',
    ]);
  });

  it('embeds every weight of a family when a weight needs the cascade to resolve', () => {
    const markup = svg(`<text font-family="${fontStack(jost)}" font-weight="bolder">a</text>`);
    expect(names(facesForSvg(markup))).toEqual(['Jost|300|normal|latin', 'Jost|500|normal|latin']);
  });

  it('adds latin-ext faces only when the text has latin-ext characters', () => {
    const markup = svg(`<text font-family="${fontStack(cormorant)}" font-weight="600">Łukasz Żółć</text>`);
    expect(names(facesForSvg(markup))).toEqual([
      'Cormorant Garamond|500|normal|latin',
      'Cormorant Garamond|500|normal|latin-ext',
      'Cormorant Garamond|600|normal|latin',
      'Cormorant Garamond|600|normal|latin-ext',
    ]);
  });

  it('is empty when the SVG names no bundled family', () => {
    expect(facesForSvg(svg('<text font-family="serif">Rose</text><rect/>'))).toEqual([]);
  });

  it.each(THEME_IDS)('embeds every latin face %s draws for the sample poster with traits on', (theme) => {
    const { svg: poster } = drawPoster(sampleTree(), { ...DEFAULT_STYLE, theme, traits: true }, { measure: approxMeasurer, shareUrl: null, seed: 'fonts' });
    const { type } = resolveTheme(theme, 'converge');
    const families = new Set([type.coupleTitle, type.name, type.focusName, type.dates, type.trait].map((face) => face.family));
    const expected = FONT_FACES.filter((face) => face.subset === 'latin' && families.has(face.family));
    expect(names(facesForSvg(poster))).toEqual(names(expected));
  });
});

describe('embeddedFontCss', () => {
  it('keeps only the rules of the given faces, with their src replaced', () => {
    const faces = FONT_FACES.filter((face) => face.family === greatVibes);
    const css = embeddedFontCss(faces, (face) => `data:font/woff2;base64,${face.file}`);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    for (const face of faces) expect(css).toContain(`url("data:font/woff2;base64,${face.file}")`);
    expect(css).not.toContain(playfair);
    expect(css).not.toContain('skipped');
    expect(css).not.toMatch(/[<&]/);
  });

  it('is empty for no faces', () => {
    expect(embeddedFontCss([], () => 'x')).toBe('');
  });
});
