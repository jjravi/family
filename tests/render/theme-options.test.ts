import { afterEach, describe, expect, it } from 'vitest';
import { polygonInside } from '../../src/layout/geometry';
import { approxMeasurer } from '../../src/layout/measure';
import { runPolygon } from '../../src/layout/shapes';
import { drawPoster } from '../../src/render/poster';
import { LAYOUT_IDS, layoutsForFocusCount } from '../../src/style';
import { THEMES, type ThemeOverride } from '../../src/themes';
import { overlappingRuns, ownedRuns, sceneOf, styleOf } from './helpers';
import { mirroredCouple, NAMED_TREES } from './trees';

/**
 * Schema options no bundled theme uses (pill and circle nodes, curve edges,
 * hidden placeholders), drawn through a per-layout override of the classic theme
 * on trees with unknown ancestors.
 */
const OPTIONS: [string, ThemeOverride][] = [
  ['pill nodes', { node: { shape: 'pill' } }],
  ['circle nodes', { node: { shape: 'circle' } }],
  ['curve edges', { edge: { style: 'curve' } }],
  ['hidden placeholders', { placeholder: 'hidden' }],
];
const TREES = [mirroredCouple, NAMED_TREES.nulls!];

afterEach(() => {
  THEMES.classic.layouts = {};
});

describe.each(OPTIONS)('%s', (name, override) => {
  it('draw every offered layout with text inside its node and apart from other text', () => {
    for (const make of TREES) {
      const tree = make();
      for (const layout of layoutsForFocusCount(tree.focus.length)) {
        THEMES.classic.layouts = Object.fromEntries(LAYOUT_IDS.map((id) => [id, override]));
        for (const toggles of ['full', 'none'] as const) {
          const scene = sceneOf(tree, styleOf(layout, 'classic', toggles));
          const label = `${name} ${layout} ${toggles}`;
          expect(overlappingRuns(scene), label).toEqual([]);
          expect(ownedRuns(scene).filter(({ run, owner }) => !polygonInside(runPolygon(run), owner, 0.05)).map((r) => r.label), label).toEqual([]);
          if (override.placeholder === 'hidden') expect(scene.nodes.some((n) => n.node.person === null), label).toBe(false);
          else if (layout !== 'desc') expect(scene.nodes.some((n) => n.node.person === null), label).toBe(true);
        }
        const { svg } = drawPoster(tree, styleOf(layout, 'classic', 'full'), { measure: approxMeasurer, shareUrl: null, seed: name });
        if (override.node?.shape === 'pill' && layout !== 'fan' && layout !== 'butterfly') expect(svg).toMatch(/<rect [^>]*rx="/);
        if (override.node?.shape === 'circle' && layout !== 'fan' && layout !== 'butterfly') expect(svg).toContain('<ellipse ');
        if (override.edge?.style === 'curve' && (layout === 'ped' || layout === 'converge' || layout === 'bowtie')) expect(svg).toMatch(/<path d="M[^"]*C/);
      }
    }
  });
});
