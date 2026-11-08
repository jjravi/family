import { polygonsOverlap, rectPolygon, type Polygon } from '../../src/layout/geometry';
import { approxMeasurer } from '../../src/layout/measure';
import { framePolygon, runPolygon, shapePolygon } from '../../src/layout/shapes';
import { titleTextArea } from '../../src/layout/title';
import type { TextRun } from '../../src/layout/types';
import type { Tree } from '../../src/model/types';
import { composeScene, type Scene } from '../../src/render/scene';
import { DEFAULT_STYLE, type LayoutId, type PageSizeId, type Style, type ThemeId } from '../../src/style';

export const TOGGLES = {
  full: { dates: true, traits: true },
  dates: { dates: true, traits: false },
  none: { dates: false, traits: false },
} as const;
export type ToggleName = keyof typeof TOGGLES;

export function styleOf(layout: LayoutId, theme: ThemeId, toggles: ToggleName, size: PageSizeId = '18x24', extra: Partial<Style> = {}): Style {
  return { ...DEFAULT_STYLE, layout, theme, ...TOGGLES[toggles], size, ...extra };
}

export function sceneOf(tree: Tree, style: Style, seed = 'test'): Scene {
  return composeScene(tree, style, { measure: approxMeasurer, shareUrl: null, seed });
}

/** Every run on the poster with the region it must stay inside. */
export function ownedRuns(scene: Scene): { run: TextRun; owner: Polygon; label: string }[] {
  const out: { run: TextRun; owner: Polygon; label: string }[] = [];
  for (const { node, runs } of scene.nodes) {
    for (const run of runs) out.push({ run, owner: framePolygon(node.frame), label: `${node.key}:${run.text}` });
  }
  for (const mark of scene.marks) out.push({ run: mark.run, owner: rectPolygon(mark.frame), label: `mark:${mark.run.text}` });
  const area = titleTextArea(scene.title.block, scene.title.size);
  for (const run of scene.title.runs) out.push({ run, owner: rectPolygon(area), label: `title:${run.text}` });
  return out;
}

/** Pairs of node shapes that overlap. */
export function overlappingShapes(scene: Scene): string[] {
  const shapes = scene.nodes.map(({ node }) => ({ key: node.key, poly: shapePolygon(node.shape) }));
  const hits: string[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (polygonsOverlap(shapes[i]!.poly, shapes[j]!.poly, 0.05)) hits.push(`${shapes[i]!.key} x ${shapes[j]!.key}`);
    }
  }
  return hits;
}

/** Pairs of text runs whose footprints overlap. */
export function overlappingRuns(scene: Scene): string[] {
  const runs = ownedRuns(scene).map((r) => ({ ...r, poly: runPolygon(r.run) }));
  const hits: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (polygonsOverlap(runs[i]!.poly, runs[j]!.poly, 0.05)) hits.push(`${runs[i]!.label} x ${runs[j]!.label}`);
    }
  }
  return hits;
}
