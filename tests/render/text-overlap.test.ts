import { describe, expect, it } from 'vitest';
import { polygonInside } from '../../src/layout/geometry';
import { runPolygon } from '../../src/layout/shapes';
import type { Tree } from '../../src/model/types';
import { THEME_IDS, type LayoutId, type Orientation, type PageSizeId } from '../../src/style';
import { sampleTree } from '../fixtures/sample-tree';
import { overlappingRuns, ownedRuns, sceneOf, styleOf, type ToggleName } from './helpers';
import { cousinTree, descendants, mirroredCouple, NAMED_TREES, refocus } from './trees';

/**
 * Spec acceptance: every layout x theme renders the sample tree at 18x24 with
 * no overlapping text. Single-root layouts use focus Mia (4 full generations),
 * couple layouts Sarah + Dave Ruiz; desc runs both ways.
 */
const CASES: { layout: LayoutId; tree: () => Tree; label: string; orientation?: Orientation }[] = [
  { layout: 'ped', tree: () => refocus(sampleTree(), ['Mia']), label: 'Mia' },
  { layout: 'fan', tree: () => refocus(sampleTree(), ['Mia']), label: 'Mia' },
  { layout: 'fan', tree: () => refocus(sampleTree(), ['Mia']), label: 'Mia, portrait', orientation: 'portrait' },
  { layout: 'desc', tree: () => refocus(sampleTree(), ['Al Kim']), label: 'Al Kim' },
  { layout: 'desc', tree: sampleTree, label: 'Sarah + Dave Ruiz' },
  { layout: 'bowtie', tree: sampleTree, label: 'Sarah + Dave Ruiz' },
  { layout: 'butterfly', tree: sampleTree, label: 'Sarah + Dave Ruiz' },
  { layout: 'converge', tree: sampleTree, label: 'Sarah + Dave Ruiz' },
];
const TOGGLE_SETS: readonly ToggleName[] = ['full', 'dates', 'none'];

function check(tree: Tree, layout: LayoutId, theme: (typeof THEME_IDS)[number], toggles: ToggleName, size: PageSizeId = '18x24', orientation: Orientation | null = null) {
  const scene = sceneOf(tree, styleOf(layout, theme, toggles, size, { orientation }));
  const owned = ownedRuns(scene);
  const escaped = owned.filter(({ run, owner }) => !polygonInside(runPolygon(run), owner, 0.05)).map((r) => r.label);
  return { scene, escaped, overlaps: overlappingRuns(scene), count: owned.length };
}

describe.each(CASES)('$layout ($label) at 18x24', ({ layout, tree, label, orientation }) => {
  it.each(THEME_IDS)('%s: no text leaves its node or overlaps other text', (theme) => {
    for (const toggles of TOGGLE_SETS) {
      const { escaped, overlaps, count, scene } = check(tree(), layout, theme, toggles, '18x24', orientation);
      expect(escaped, `${toggles}: runs outside their node`).toEqual([]);
      expect(overlaps, `${toggles}: overlapping runs`).toEqual([]);
      expect(count).toBeGreaterThan(3);
      const names = scene.nodes.flatMap((n) => n.runs.filter((r) => r.role === 'name'));
      expect(names.length, `${label} ${toggles}: every person keeps a name`).toBeGreaterThanOrEqual(scene.nodes.filter((n) => n.node.person).length);
    }
  });
});

describe('text fitting on harder trees and smaller pages', () => {
  const harder: { name: string; tree: () => Tree; layouts: LayoutId[] }[] = [
    { name: 'deep6', tree: NAMED_TREES.deep6!, layouts: ['ped', 'fan'] },
    { name: 'deep7', tree: NAMED_TREES.deep7!, layouts: ['ped'] },
    { name: 'cousin', tree: cousinTree, layouts: ['ped', 'fan'] },
    { name: 'mirrored', tree: mirroredCouple, layouts: ['converge', 'bowtie', 'butterfly', 'desc'] },
    { name: 'descendants', tree: descendants, layouts: ['desc'] },
    { name: 'sample', tree: sampleTree, layouts: ['converge', 'bowtie', 'butterfly', 'desc'] },
  ];
  for (const { name, tree, layouts } of harder) {
    for (const layout of layouts) {
      it.each(['8x10', '18x24', '24x36', 'a4'] as const)(`${name} ${layout} at %s keeps text apart and inside`, (size) => {
        for (const theme of THEME_IDS) {
          for (const toggles of ['full', 'none'] as const) {
            for (const orientation of layout === 'fan' ? ([null, 'portrait'] as const) : [null]) {
              const { escaped, overlaps } = check(tree(), layout, theme, toggles, size, orientation);
              expect(escaped, `${theme} ${toggles} ${orientation ?? 'auto'}`).toEqual([]);
              expect(overlaps, `${theme} ${toggles} ${orientation ?? 'auto'}`).toEqual([]);
            }
          }
        }
      });
    }
  }
});
