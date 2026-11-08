import { describe, expect, it } from 'vitest';
import { approxMeasurer } from '../../src/layout/measure';
import { drawPoster } from '../../src/render/poster';
import { styleOf } from './helpers';
import { NAMED_TREES } from './trees';

/** The UI re-renders on every edit (300 ms debounce), so even the largest posters must draw quickly. */
describe('drawing speed', () => {
  it.each([
    ['ped', 'deep7'],
    ['fan', 'deep6'],
    ['desc', 'wide'],
    ['converge', 'sample'],
  ] as const)('%s with %s draws in well under 300 ms', (layout, tree) => {
    const t = NAMED_TREES[tree]!();
    const style = styleOf(layout, 'botanical', 'full');
    drawPoster(t, style, { measure: approxMeasurer, shareUrl: null, seed: 'warm-up' });
    const start = performance.now();
    drawPoster(t, style, { measure: approxMeasurer, shareUrl: null, seed: 'speed' });
    expect(performance.now() - start).toBeLessThan(150);
  });
});
