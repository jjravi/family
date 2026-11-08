import { describe, expect, it } from 'vitest';
import { parse } from '../../src/dsl/parse';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import { approxMeasurer } from '../../src/layout/measure';
import { renderPoster } from '../../src/pipeline';
import { drawPoster } from '../../src/render/poster';
import { layoutsForFocusCount, THEME_IDS } from '../../src/style';
import { exampleTree } from '../fixtures/example-tree';
import { sampleTree } from '../fixtures/sample-tree';
import { styleOf } from './helpers';

/** The engine through the real parser: the first-screen poster and the spec example. */
describe('posters from parsed DSL', () => {
  it('parse() returns the fixtures the engine is tested with', () => {
    expect(parse(SAMPLE_DSL)).toEqual({ tree: sampleTree(), diagnostics: [] });
    expect(parse(EXAMPLE_DSL)).toEqual({ tree: exampleTree(), diagnostics: [] });
  });

  it('renderPoster(SAMPLE_DSL) draws the same poster as drawPoster(sampleTree()) for every couple layout and theme', () => {
    for (const layout of layoutsForFocusCount(2)) {
      for (const theme of THEME_IDS) {
        const style = styleOf(layout, theme, 'full');
        const result = renderPoster({ dsl: SAMPLE_DSL, style, shareUrl: null });
        expect(result.ok).toBe(true);
        expect(result.svg).toBe(drawPoster(sampleTree(), style, { measure: approxMeasurer, shareUrl: null, seed: SAMPLE_DSL }).svg);
      }
    }
  });

  it('draws the first screen (default style) with a real QR corner for a share URL within budget', () => {
    const shareUrl = `https://family.jostache.com/#v=1&d=${'q1ZKLs0rSc1V'.repeat(60)}&t=classic`;
    const result = renderPoster({ dsl: SAMPLE_DSL, style: styleOf('converge', 'classic', 'dates'), shareUrl });
    expect(result.ok).toBe(true);
    expect(result.layout).toBe('converge');
    expect(result.svg).toContain('<g class="qr"><g transform="translate(');
    expect(result.notices).toEqual([]);
  });

  it('draws the example DSL, padding the empty side with placeholders', () => {
    const result = renderPoster({ dsl: EXAMPLE_DSL, style: styleOf('converge', 'classic', 'full'), shareUrl: null });
    expect(result.ok).toBe(true);
    expect(result.svg!.match(/class="placeholder"/g)!.length).toBe(8);
  });
});
