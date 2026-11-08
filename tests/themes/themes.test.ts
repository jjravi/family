import { describe, expect, it } from 'vitest';
import { LAYOUT_IDS, THEME_IDS } from '../../src/style';
import { LAYOUT_OVERRIDES, resolveTheme, THEMES } from '../../src/themes';
import { FONT_FACES, FONT_FAMILIES } from '../../src/themes/fonts';
import { boxHeightEm, EDGE_STYLES, NODE_SHAPES, PLACEHOLDER_STYLES, type Face } from '../../src/themes/schema';

const families = new Set<string>(Object.values(FONT_FAMILIES));

function supported(face: Face): boolean {
  return FONT_FACES.some((f) => f.family === face.family && f.style === face.style && f.weight === face.weight);
}

describe.each(THEME_IDS)('theme %s', (id) => {
  const theme = THEMES[id];

  it('is complete data with valid choices', () => {
    expect(theme.id).toBe(id);
    expect(NODE_SHAPES).toContain(theme.node.shape);
    expect(EDGE_STYLES).toContain(theme.edge.style);
    expect(PLACEHOLDER_STYLES).toContain(theme.placeholder);
    for (const [key, color] of Object.entries(theme.palette)) {
      if (key === 'paper') continue;
      expect(color, key).toMatch(/^#[0-9a-f]{6}$/);
    }
    if (theme.palette.paper) expect(theme.palette.paper.edge).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('uses only bundled faces, with italic trait words', () => {
    const { type } = theme;
    for (const face of [type.display, type.coupleTitle, type.name, type.focusName, type.dates, type.trait]) {
      expect(families.has(face.family), face.family).toBe(true);
      expect(supported(face), `${face.family} ${face.weight} ${face.style}`).toBe(true);
    }
    expect(type.trait.style).toBe('italic');
  });

  it('shrinks names outward from the focus', () => {
    const sizes = theme.type.nameSizes;
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
    expect(theme.type.traitScale).toBeLessThan(1);
    expect(theme.type.datesScale).toBeLessThan(1);
  });

  it('reports box metrics with and without dates and traits', () => {
    const m = theme.metrics;
    const bare = boxHeightEm(m, { dates: false, traits: false });
    expect(boxHeightEm(m, { dates: true, traits: false })).toBeCloseTo(bare + m.datesLine, 9);
    expect(boxHeightEm(m, { dates: true, traits: true })).toBeCloseTo(bare + m.datesLine + m.traitsLine, 9);
    expect(boxHeightEm(m, { dates: false, traits: false, nameLines: 2 })).toBeCloseTo(bare + m.nameLine, 9);
    expect(m.minWidth).toBeLessThan(m.maxWidth);
  });
});

describe('per-layout overrides', () => {
  it('fans force radial connectors in every theme; other layouts keep the theme edge', () => {
    for (const id of THEME_IDS) {
      for (const layout of LAYOUT_IDS) {
        const resolved = resolveTheme(id, layout);
        const forced = LAYOUT_OVERRIDES[layout]?.edge?.style;
        expect(resolved.edge.style).toBe(forced ?? THEMES[id].edge.style);
        expect(resolved.palette).toEqual(THEMES[id].palette);
      }
    }
    expect(resolveTheme('botanical', 'fan').edge.style).toBe('radial');
    expect(resolveTheme('botanical', 'converge').edge.style).toBe('organic');
  });

  it('the three themes match the spec: classic boxes and orthogonal edges, botanical leaves and organic edges, modern text-only and radial', () => {
    expect([THEMES.classic.node.shape, THEMES.classic.edge.style]).toEqual(['box', 'orthogonal']);
    expect([THEMES.botanical.node.shape, THEMES.botanical.edge.style]).toEqual(['leaf', 'organic']);
    expect([THEMES.modern.node.shape, THEMES.modern.edge.style]).toEqual(['text-only', 'radial']);
    expect(THEMES.classic.type.name.family).toBe(FONT_FAMILIES.playfair);
    expect(THEMES.classic.type.dates.family).toBe(FONT_FAMILIES.sourceSans);
    expect(THEMES.botanical.type.coupleTitle.family).toBe(FONT_FAMILIES.greatVibes);
    expect(THEMES.modern.type.name.family).toBe(FONT_FAMILIES.jost);
  });
});
