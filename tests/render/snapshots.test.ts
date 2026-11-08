import { describe, expect, it } from 'vitest';
import { approxMeasurer } from '../../src/layout/measure';
import type { Tree } from '../../src/model/types';
import { drawPoster } from '../../src/render/poster';
import { THEME_IDS, type LayoutId } from '../../src/style';
import { sampleTree } from '../fixtures/sample-tree';
import { styleOf } from './helpers';
import { refocus } from './trees';

/**
 * Golden SVGs for every layout x theme, with dates and traits on and with both
 * off (approxMeasurer, no QR). They open directly in a browser. A change here
 * must be intentional: review the diff, then run `npx vitest run -u`.
 */
const CASES: { name: string; layout: LayoutId; tree: () => Tree }[] = [
  { name: 'ped', layout: 'ped', tree: () => refocus(sampleTree(), ['Mia']) },
  { name: 'fan', layout: 'fan', tree: () => refocus(sampleTree(), ['Mia']) },
  { name: 'desc', layout: 'desc', tree: sampleTree },
  { name: 'desc-single', layout: 'desc', tree: () => refocus(sampleTree(), ['Al Kim']) },
  { name: 'bowtie', layout: 'bowtie', tree: sampleTree },
  { name: 'butterfly', layout: 'butterfly', tree: sampleTree },
  { name: 'converge', layout: 'converge', tree: sampleTree },
];

describe.each(CASES)('$name snapshots', ({ name, layout, tree }) => {
  it.each(THEME_IDS)('%s', async (theme) => {
    for (const toggles of ['full', 'none'] as const) {
      const { svg } = drawPoster(tree(), styleOf(layout, theme, toggles), { measure: approxMeasurer, shareUrl: null, seed: 'snapshot' });
      await expect(svg).toMatchFileSnapshot(`./__snapshots__/${name}-${theme}-${toggles === 'full' ? 'dates-traits' : 'plain'}.svg`);
    }
  });
});
