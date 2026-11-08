import { describe, expect, it } from 'vitest';
import { polygonsOverlap, rectPolygon } from '../../src/layout/geometry';
import { shapePolygon, shapeBounds } from '../../src/layout/shapes';
import type { PosterNode } from '../../src/layout/types';
import type { Tree } from '../../src/model/types';
import { LAYOUT_IDS, THEME_IDS, type LayoutId, type PageSizeId } from '../../src/style';
import { sampleTree } from '../fixtures/sample-tree';
import { overlappingShapes, sceneOf, styleOf } from '../render/helpers';
import { descendants, mirroredCouple, NAMED_TREES, refocus } from '../render/trees';

const SINGLE: readonly LayoutId[] = ['ped', 'fan', 'desc'];
const treeFor = (layout: LayoutId): Tree => (SINGLE.includes(layout) && layout !== 'desc' ? refocus(sampleTree(), ['Mia']) : sampleTree());
const SIZES: readonly PageSizeId[] = ['8x10', '18x24'];

describe('pedigree slots on the poster', () => {
  it.each(['ped', 'fan', 'converge', 'bowtie', 'butterfly'] as const)('%s: each slot index is below 2^g and unique per side and generation', (layout) => {
    for (const tree of [treeFor(layout), NAMED_TREES.deep6!()]) {
      if (tree.focus.length === 1 && ['converge', 'bowtie', 'butterfly'].includes(layout)) continue;
      const scene = sceneOf(tree, styleOf(layout, 'classic', 'full'));
      const seen = new Set<string>();
      for (const { node } of scene.nodes) {
        if (node.slot === null) continue;
        expect(node.slot).toBeGreaterThanOrEqual(0);
        expect(node.slot).toBeLessThan(2 ** node.generation);
        const key = `${node.side}/${node.generation}/${node.slot}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('no two boxes overlap', () => {
  for (const layout of LAYOUT_IDS) {
    it.each(SIZES)(`${layout} at %s, every theme, with and without dates and traits`, (size) => {
      const trees = [treeFor(layout), ...(layout === 'desc' ? [descendants(), refocus(sampleTree(), ['Al Kim'])] : [])];
      if (layout === 'ped' || layout === 'fan') trees.push(NAMED_TREES.deep6!());
      for (const tree of trees) {
        for (const theme of THEME_IDS) {
          for (const toggles of ['full', 'none'] as const) {
            const scene = sceneOf(tree, styleOf(layout, theme, toggles, size));
            expect(overlappingShapes(scene), `${theme} ${toggles}`).toEqual([]);
            const title = rectPolygon(scene.title.block.frame);
            for (const { node } of scene.nodes) expect(polygonsOverlap(shapePolygon(node.shape), title), `${node.key} vs title`).toBe(false);
          }
        }
      }
    });
  }
});

describe('nothing but the background inside the page margin', () => {
  it.each(LAYOUT_IDS)('%s keeps nodes and the title inside the safe area', (layout) => {
    for (const size of SIZES) {
      const scene = sceneOf(treeFor(layout), styleOf(layout, 'botanical', 'full', size));
      const { safe } = scene;
      const inside = (r: { x: number; y: number; w: number; h: number }) =>
        r.x >= safe.x - 0.01 && r.y >= safe.y - 0.01 && r.x + r.w <= safe.x + safe.w + 0.01 && r.y + r.h <= safe.y + safe.h + 0.01;
      for (const { node } of scene.nodes) expect(inside(shapeBounds(node.shape)), node.key).toBe(true);
      expect(inside(scene.title.block.frame)).toBe(true);
    }
  });
});

function center(node: PosterNode): { x: number; y: number } {
  const b = shapeBounds(node.shape);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

describe('descendant chart', () => {
  const families = (nodes: PosterNode[]) => {
    const byFamily = new Map<string, PosterNode[]>();
    for (const node of nodes) {
      const key = node.key.slice(0, node.key.lastIndexOf('.'));
      byFamily.set(key, [...(byFamily.get(key) ?? []), node]);
    }
    return byFamily;
  };

  it.each(['classic', 'botanical', 'modern'] as const)('centers children under their union, in DSL order (%s)', (theme) => {
    for (const tree of [descendants(), refocus(sampleTree(), ['Rose Kim']), sampleTree()]) {
      const scene = sceneOf(tree, styleOf('desc', theme, 'full'));
      const nodes = scene.nodes.map((n) => n.node);
      const byFamily = families(nodes);
      const familyOfBox = (x: number, y: number) =>
        [...byFamily.values()].find((boxes) => boxes.some((b) => {
          const r = shapeBounds(b.shape);
          return Math.abs(r.x + r.w / 2 - x) < 0.01 && Math.abs(r.y - y) < 0.01;
        }))!;
      const familyCenter = (boxes: PosterNode[]) => {
        const xs = boxes.map((b) => shapeBounds(b.shape));
        return (Math.min(...xs.map((r) => r.x)) + Math.max(...xs.map((r) => r.x + r.w))) / 2;
      };
      let forks = 0;
      for (const link of scene.links) {
        if (link.kind !== 'fork') continue;
        forks++;
        const kids = link.targets.map((t) => familyOfBox(t.point.x, t.point.y));
        const xs = link.targets.map((t) => t.point.x);
        for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
        expect((familyCenter(kids[0]!) + familyCenter(kids.at(-1)!)) / 2).toBeCloseTo(link.source.x, 6);
      }
      expect(forks).toBeGreaterThan(0);
    }
  });

  it('draws one node per union side by side for a person with several unions, marked as a repeat', () => {
    const scene = sceneOf(descendants(), styleOf('desc', 'classic', 'full'));
    const root = scene.nodes.filter((n) => n.node.person === 'Root Person');
    expect(root).toHaveLength(2);
    expect(root.every((n) => n.node.repeat === 1)).toBe(true);
    expect(center(root[0]!.node).y).toBeCloseTo(center(root[1]!.node).y, 6);
  });

  it("follows DSL order for siblings: the first child's family is leftmost", () => {
    const scene = sceneOf(descendants(), styleOf('desc', 'classic', 'none'));
    const x = (id: string) => center(scene.nodes.find((n) => n.node.person === id)!.node).x;
    expect(x('Alma')).toBeLessThan(x('Bruno'));
    expect(x('Bruno')).toBeLessThan(x('Cora'));
    expect(x('Ida')).toBeLessThan(x('Jon'));
    expect(x('Jon')).toBeLessThan(x('Kit'));
  });
});

describe('couple layouts are mirror-symmetric when both sides match', () => {
  const tree = mirroredCouple();
  const pairs = (nodes: PosterNode[]) =>
    nodes
      .filter((n) => n.side === 0 && n.slot !== null)
      .map((a) => [a, nodes.find((b) => b.side === 1 && b.slot === a.slot && b.generation === a.generation)!] as const);

  it.each(['converge', 'bowtie'] as const)('%s mirrors across the vertical center line', (layout) => {
    for (const theme of THEME_IDS) {
      const scene = sceneOf(tree, styleOf(layout, theme, 'full'));
      const axis = scene.area.x + scene.area.w / 2;
      const nodes = scene.nodes.map((n) => n.node);
      const matched = pairs(nodes);
      expect(matched.length).toBeGreaterThan(5);
      for (const [a, b] of matched) {
        const ra = shapeBounds(a.shape);
        const rb = shapeBounds(b.shape);
        expect(rb.w).toBeCloseTo(ra.w, 6);
        expect(rb.h).toBeCloseTo(ra.h, 6);
        expect(rb.y).toBeCloseTo(ra.y, 6);
        expect(rb.x + rb.w / 2 - axis).toBeCloseTo(axis - (ra.x + ra.w / 2), 6);
        expect(b.person === null).toBe(a.person === null);
      }
    }
  });

  it('butterfly mirrors across the horizontal diameter', () => {
    const scene = sceneOf(tree, styleOf('butterfly', 'classic', 'full'));
    for (const [a, b] of pairs(scene.nodes.map((n) => n.node))) {
      if (a.shape.kind !== 'sector' || b.shape.kind !== 'sector') throw new Error('expected sectors');
      expect(b.shape.r0).toBeCloseTo(a.shape.r0, 6);
      expect(b.shape.r1).toBeCloseTo(a.shape.r1, 6);
      expect(b.shape.a0).toBeCloseTo(2 * Math.PI - a.shape.a1, 6);
      expect(b.shape.a1).toBeCloseTo(2 * Math.PI - a.shape.a0, 6);
    }
  });
});

describe('capacity', () => {
  it('caps rectilinear pedigrees at 7 generations and fans at 6, with a notice', () => {
    const tree = NAMED_TREES.deep8!();
    const ped = sceneOf(tree, styleOf('ped', 'classic', 'none'));
    expect(Math.max(...ped.nodes.map((n) => n.node.generation))).toBe(6);
    expect(ped.notices.some((n) => n.includes('7 generations'))).toBe(true);
    const fan = sceneOf(tree, styleOf('fan', 'classic', 'none'));
    expect(Math.max(...fan.nodes.map((n) => n.node.generation))).toBe(5);
    expect(fan.notices.some((n) => n.includes('6 generations'))).toBe(true);
  });

  it('pads the shallower side of a couple with placeholders (decision 14)', () => {
    const scene = sceneOf(NAMED_TREES.example!(), styleOf('converge', 'classic', 'full'));
    const daveSide = scene.nodes.filter((n) => n.node.side === 1 && n.node.slot !== null);
    expect(daveSide.map((n) => n.node.person)).toEqual(['Dave Ruiz', null, null, null, null, null, null]);
  });

  it('suggests a larger page when the widest descendant generation does not fit', () => {
    const scene = sceneOf(NAMED_TREES.wide!(), styleOf('desc', 'classic', 'full', '8x10'));
    expect(scene.notices.some((n) => n.includes('larger page'))).toBe(true);
    expect(overlappingShapes(scene)).toEqual([]);
  });
});
