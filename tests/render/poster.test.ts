import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rectsOverlap } from '../../src/layout/geometry';
import { approxMeasurer } from '../../src/layout/measure';
import { shapeBounds } from '../../src/layout/shapes';
import type { Tree } from '../../src/model/types';
import { drawPoster } from '../../src/render/poster';
import { qrPlan, qrSvg } from '../../src/render/qr';
import { composeScene, QR_NOTICE } from '../../src/render/scene';
import { DEFAULT_STYLE, LAYOUT_IDS, layoutsForFocusCount, physicalSize, resolveStyle, THEME_IDS, type Style } from '../../src/style';
import { FONT_FAMILIES, fontStack } from '../../src/themes/fonts/families';
import { person, union } from '../fixtures/build';
import { sampleTree } from '../fixtures/sample-tree';
import { overlappingRuns } from './helpers';
import { family, refocus } from './trees';

vi.mock('../../src/render/qr', () => ({
  QR_MAX_BYTES: 1024,
  qrPlan: vi.fn(),
  qrSvg: vi.fn(),
}));
const planMock = vi.mocked(qrPlan);
const svgMock = vi.mocked(qrSvg);

beforeEach(() => {
  planMock.mockReset();
  svgMock.mockReset();
  planMock.mockImplementation((text) => (text.length > 1024 ? null : { version: 6, modules: 41, ecc: 'M', size: 64 }));
  svgMock.mockImplementation((_text, x, y, size, color) => `<g class="qr-mock" data-x="${x}" data-y="${y}" data-size="${size}" data-color="${color}"/>`);
});

const ctx = { measure: approxMeasurer, shareUrl: null, seed: 'seed' };
const style = (overrides: Partial<Style> = {}): Style => ({ ...DEFAULT_STYLE, ...overrides });

describe('drawPoster output contract', () => {
  it('returns the resolved layout, orientation, and page for every offered layout', () => {
    for (const tree of [sampleTree(), refocus(sampleTree(), ['Mia'])]) {
      for (const layout of [null, ...LAYOUT_IDS]) {
        const s = style({ layout });
        const result = drawPoster(tree, s, ctx);
        const resolved = resolveStyle(s, tree.focus.length);
        expect({ layout: result.layout, orientation: result.orientation, page: result.page }).toEqual(resolved);
        expect(layoutsForFocusCount(tree.focus.length)).toContain(result.layout);
      }
    }
  });

  it('writes a standalone SVG sized to the physical page with a title and an aria-label', () => {
    const result = drawPoster(sampleTree(), style(), ctx);
    const { width, height } = physicalSize(result.page);
    expect(result.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="18in" height="24in" viewBox="0 0 1296 1728" /);
    expect(width).toBe('18in');
    expect(height).toBe('24in');
    expect(result.svg).toContain('<title>The Kim &amp; Ruiz Family</title>');
    expect(result.svg).toContain('aria-label="Family tree poster: The Kim &amp; Ruiz Family"');
    expect(result.svg).not.toContain('@font-face');
    expect(result.svg.endsWith('</svg>')).toBe(true);
    const landscape = drawPoster(sampleTree(), style({ layout: 'bowtie', size: 'a3' }), ctx);
    expect(landscape.svg).toContain('width="420mm" height="297mm" viewBox="0 0 1190.55 841.89"');
  });

  it('puts data-id on every person node and draws every connected person', () => {
    const tree = refocus(sampleTree(), ['Mia']);
    const result = drawPoster(tree, style({ layout: 'ped' }), ctx);
    const ids = [...result.svg.matchAll(/data-id="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(['Mia', 'Sarah', 'Dave Ruiz', 'Mary', 'Tom Park', 'Elena', 'Carlos Ruiz', 'Rose Kim', 'Al Kim', 'Grace Park', 'Sam Park', 'Inés Vega', 'Luis Vega', 'Rita Ruiz', 'Jorge Ruiz']));
  });

  it('omits persons not connected to the focus', () => {
    const tree = sampleTree();
    tree.persons.set('Stray Person', person('Stray Person', 20, { birth: 1999 }));
    tree.unions.push(union('u10', ['Stray Person'], [], 20));
    for (const layout of layoutsForFocusCount(2)) {
      expect(drawPoster(tree, style({ layout }), ctx).svg).not.toContain('Stray Person');
    }
  });

  it('names fonts only through fontStack()', () => {
    const allowed = new Set(Object.values(FONT_FAMILIES).map((f) => fontStack(f)));
    for (const theme of THEME_IDS) {
      for (const layout of layoutsForFocusCount(2)) {
        const svg = drawPoster(sampleTree(), style({ theme, layout, traits: true }), ctx).svg;
        const families = [...svg.matchAll(/font-family="([^"]*)"/g)].map((m) => m[1]!);
        expect(families.length).toBeGreaterThan(0);
        for (const family of families) expect(allowed.has(family), family).toBe(true);
      }
    }
  });

  it('is deterministic and never calls Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    for (const theme of THEME_IDS) {
      const a = drawPoster(sampleTree(), style({ theme, traits: true }), ctx).svg;
      const b = drawPoster(sampleTree(), style({ theme, traits: true }), ctx).svg;
      expect(a).toBe(b);
    }
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('seeds organic jitter from the DSL text: botanical changes with the seed, classic does not', () => {
    const draw = (theme: Style['theme'], seed: string) => drawPoster(sampleTree(), style({ theme }), { ...ctx, seed }).svg;
    expect(draw('botanical', 'one')).not.toBe(draw('botanical', 'two'));
    const strip = (svg: string) => svg.replace(/ft[0-9a-z]+-/g, 'id-').replace(/"ft[0-9a-z]+/g, '"id');
    expect(strip(draw('classic', 'one'))).toBe(strip(draw('classic', 'two')));
  });
});

describe('unusual trees', () => {
  const lone = family([], ['Solo Person']);
  const pair = family([], ['Ann Lee', 'Bob Lee']);
  const cyclic: Tree = family(
    [
      [['Alpha', 'Beta'], ['Gamma']],
      [['Gamma', 'Delta'], ['Alpha']],
    ],
    ['Gamma'],
  );

  it('draws a lone person and a lone couple in every offered layout and theme', () => {
    for (const tree of [lone, pair]) {
      for (const layout of layoutsForFocusCount(tree.focus.length)) {
        for (const theme of THEME_IDS) {
          const scene = composeScene(tree, style({ layout, theme, traits: true }), ctx);
          expect(scene.nodes.filter((n) => n.node.person !== null).length).toBe(tree.focus.length);
          expect(overlappingRuns(scene)).toEqual([]);
          expect(drawPoster(tree, style({ layout, theme }), ctx).svg).toContain('data-id="');
        }
      }
    }
  });

  it('survives cyclic ancestry without looping: depth is capped and repeats are marked', () => {
    for (const layout of layoutsForFocusCount(1)) {
      const scene = composeScene(cyclic, style({ layout }), ctx);
      expect(scene.nodes.length).toBeGreaterThan(1);
      if (layout !== 'desc') expect(scene.nodes.some((n) => n.node.repeat !== null)).toBe(true);
    }
  });
});

describe('toggles', () => {
  const tree = sampleTree();

  it('dates and traits add lines, so boxes grow and the layout re-runs', () => {
    const height = (s: Style) => {
      const scene = composeScene(tree, s, ctx);
      const sarah = scene.nodes.find((n) => n.node.person === 'Sarah')!;
      return shapeBounds(sarah.node.shape).h / scene.nodes.find((n) => n.node.person === 'Sarah')!.node.size;
    };
    const none = height(style({ dates: false, traits: false }));
    const dates = height(style({ dates: true, traits: false }));
    const both = height(style({ dates: true, traits: true }));
    expect(dates).toBeGreaterThan(none);
    expect(both).toBeGreaterThan(dates);
  });

  it('shows the dates line and the italic trait line', () => {
    const svg = drawPoster(tree, style({ dates: true, traits: true }), ctx).svg;
    expect(svg).toContain('>1932 \u2013 2019<');
    expect(svg).toContain('>c. 1927 \u2013 2008<');
    expect(svg).toContain('>b. 1980<');
    expect(svg).toMatch(/font-style="italic"[^>]*>kind · passionate</);
    const bare = drawPoster(tree, style({ dates: false, traits: false }), ctx).svg;
    expect(bare).not.toContain('1932');
    expect(bare).not.toContain('passionate');
  });

  it('living hides the birth years of living persons only', () => {
    const svg = drawPoster(tree, style({ living: true }), ctx).svg;
    expect(svg).not.toContain('b. 1980');
    expect(svg).not.toContain('b. 1979');
    expect(svg).toContain('1932 \u2013 2019');
  });

  it('derives the default title when the tree has none (decision 27)', () => {
    const untitled: Tree = { ...sampleTree(), title: null };
    expect(drawPoster(untitled, style(), ctx).svg).toContain('<title>Sarah &amp; Dave Ruiz</title>');
  });
});

describe('QR corner', () => {
  const url = 'https://family.jostache.com/#v=1&d=abc';

  it('draws qrSvg in the ink color in a reserved bottom corner when qr is on and a share URL is given', () => {
    for (const layout of layoutsForFocusCount(2)) {
      const s = style({ layout, traits: true });
      const scene = composeScene(sampleTree(), s, { ...ctx, shareUrl: url });
      expect(scene.qr).not.toBeNull();
      const qr = scene.qr!.rect;
      expect(qr.w).toBe(64);
      expect(qr.x + qr.w).toBeCloseTo(scene.area.x + scene.area.w, 6);
      expect(qr.y + qr.h).toBeCloseTo(scene.safe.y + scene.safe.h - scene.band, 6);
      for (const { node } of scene.nodes) expect(rectsOverlap(shapeBounds(node.shape), qr), node.key).toBe(false);
      expect(rectsOverlap(scene.title.block.frame, qr)).toBe(false);
      const result = drawPoster(sampleTree(), s, { ...ctx, shareUrl: url });
      expect(result.svg).toContain(`data-size="64" data-color="${scene.theme.palette.ink}"`);
      expect(result.notices).not.toContain(QR_NOTICE);
      expect(svgMock).toHaveBeenLastCalledWith(url, qr.x, qr.y, 64, scene.theme.palette.ink);
    }
  });

  it('omits the corner with the notice when the link is too long for a QR code', () => {
    const result = drawPoster(sampleTree(), style(), { ...ctx, shareUrl: `${url}${'x'.repeat(2000)}` });
    expect(result.notices).toContain(QR_NOTICE);
    expect(result.svg).not.toContain('qr-mock');
  });

  it('draws nothing and says nothing when qr is off or there is no share URL', () => {
    for (const result of [drawPoster(sampleTree(), style({ qr: false }), { ...ctx, shareUrl: url }), drawPoster(sampleTree(), style(), ctx)]) {
      expect(result.svg).not.toContain('qr-mock');
      expect(result.notices).not.toContain(QR_NOTICE);
    }
    expect(planMock).not.toHaveBeenCalled();
  });
});
