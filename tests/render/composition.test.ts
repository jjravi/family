import { describe, expect, it } from 'vitest';
import { SCALE } from '../../src/layout/input';
import { approxMeasurer } from '../../src/layout/measure';
import { shapeBounds } from '../../src/layout/shapes';
import { drawPoster } from '../../src/render/poster';
import { THEME_IDS, type PageSizeId } from '../../src/style';
import { sampleTree } from '../fixtures/sample-tree';
import { sceneOf, styleOf } from './helpers';
import { descendants, NAMED_TREES, refocus, wideDescendants } from './trees';

const mia = () => refocus(sampleTree(), ['Mia']);

function nodeBounds(scene: ReturnType<typeof sceneOf>) {
  const rects = scene.nodes.map(({ node }) => shapeBounds(node.shape));
  return {
    top: Math.min(...rects.map((r) => r.y)),
    bottom: Math.max(...rects.map((r) => r.y + r.h)),
    left: Math.min(...rects.map((r) => r.x)),
    right: Math.max(...rects.map((r) => r.x + r.w)),
  };
}

describe('fan composition', () => {
  it.each(THEME_IDS)('%s: defaults to landscape with the title over the arc', (theme) => {
    const scene = sceneOf(mia(), styleOf('fan', theme, 'full'));
    expect(scene.orientation).toBe('landscape');
    const title = scene.title.block.frame;
    expect(title.y + title.h).toBeLessThanOrEqual(nodeBounds(scene).top + 1e-6);
  });

  it.each(THEME_IDS)('%s: on a portrait page tucks the title under the base and keeps the half circle', (theme) => {
    const scene = sceneOf(mia(), styleOf('fan', theme, 'full', '18x24', { orientation: 'portrait' }));
    expect(scene.orientation).toBe('portrait');
    const bounds = nodeBounds(scene);
    expect(scene.title.block.frame.y).toBeGreaterThanOrEqual(bounds.bottom - 1e-6);
    for (const { node } of scene.nodes) {
      if (node.shape.kind === 'sector') expect(Math.max(node.shape.a0, node.shape.a1)).toBeLessThanOrEqual(2 * Math.PI + 1e-9);
    }
    expect(bounds.left).toBeGreaterThanOrEqual(scene.area.x - 1e-6);
    expect(bounds.right).toBeLessThanOrEqual(scene.area.x + scene.area.w + 1e-6);
  });
});

describe('descendant chart scale', () => {
  it.each(THEME_IDS)('%s: a couple with two children grows past the usual cap and stays inside the area', (theme) => {
    const scene = sceneOf(sampleTree(), styleOf('desc', theme, 'full'));
    expect(scene.scale).toBeGreaterThan(SCALE.max);
    expect(scene.scale).toBeLessThanOrEqual(2.6);
    const bounds = nodeBounds(scene);
    expect(bounds.left).toBeGreaterThanOrEqual(scene.area.x - 1e-6);
    expect(bounds.right).toBeLessThanOrEqual(scene.area.x + scene.area.w + 1e-6);
    expect(bounds.top).toBeGreaterThanOrEqual(scene.area.y - 1e-6);
    // Leaves some air: a small family should not run edge to edge.
    expect(bounds.right - bounds.left).toBeLessThan(scene.area.w * 0.85);
  });

  it('leaves larger charts at or under the usual cap', () => {
    for (const tree of [descendants(), wideDescendants(6, 4), refocus(sampleTree(), ['Al Kim'])]) {
      for (const theme of THEME_IDS) expect(sceneOf(tree, styleOf('desc', theme, 'full')).scale).toBeLessThanOrEqual(SCALE.max);
    }
  });
});

describe('connector weights', () => {
  const edgeWidths = (svg: string) => {
    const edges = /<g class="edges">(.*?)<\/g><g class="nodes">/.exec(svg)![1]!;
    return [...edges.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  };
  const draw = (tree: ReturnType<typeof mia>, layout: 'ped' | 'fan' | 'converge', theme: 'modern' | 'classic', size: PageSizeId = '18x24') =>
    drawPoster(tree, styleOf(layout, theme, 'dates', size), { measure: approxMeasurer, shareUrl: null, seed: 'weights' }).svg;

  it('modern connectors print at least 1 pt at 18x24, even on a seven-generation pedigree', () => {
    const deep = NAMED_TREES.deep7!();
    for (const [tree, layout] of [[deep, 'ped'], [NAMED_TREES.deep6!(), 'fan'], [sampleTree(), 'converge']] as const) {
      const widths = edgeWidths(draw(tree, layout, 'modern'));
      expect(widths.length).toBeGreaterThan(0);
      expect(Math.min(...widths), layout).toBeGreaterThanOrEqual(1);
    }
    expect(sceneOf(deep, styleOf('ped', 'modern', 'dates')).scale).toBeLessThan(1 / 0.7);
  });

  it('the modern minimum scales with the page; classic keeps its own widths', () => {
    expect(Math.min(...edgeWidths(draw(NAMED_TREES.deep7!(), 'ped', 'modern', '24x36')))).toBeGreaterThanOrEqual(1.29);
    const classic = edgeWidths(draw(NAMED_TREES.deep7!(), 'ped', 'classic'));
    expect(Math.min(...classic)).toBeLessThan(1);
  });
});
