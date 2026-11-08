import { hierarchy, tree as tidyTree, type HierarchyPointNode } from 'd3-hierarchy';
import type { PersonId, Union } from '../model/types';
import type { PageGeometry, PageSizeId } from '../style';
import { clamp, descentY, SCALE, type LayoutInput } from './input';
import { generationMetrics, scaleMetrics, textInBox, type GenerationMetrics } from './metrics';
import { bottomCartouche, headingBlock } from './title';
import type { ForkLink, Layout, Link, PosterNode } from './types';

/** Deepest generation a descendant chart follows (also a guard against cyclic data). */
const MAX_DESCENDANT_GENERATIONS = 12;

/**
 * Small families (a couple and their children) would float in an empty page at
 * SCALE.max, so a chart that fits at more than that grows to fill SMALL_FILL of
 * the page, up to SMALL_MAX.
 */
const SMALL_MAX = 2.6;
const SMALL_FILL = 0.8;

const LARGEST_PAGE: PageSizeId = '24x36';

/**
 * One layout node: a union drawn as a joined pair of boxes (one box for a
 * single parent), or a person with no union. `anchor` is the partner the node
 * descends through (-1 for roots).
 */
interface Family {
  key: string;
  partners: (PersonId | null)[];
  anchor: number;
  union: Union | null;
  depth: number;
  children: Family[];
  /** Width at scale 1, set once box metrics are known. */
  width: number;
}

function familiesOf(input: LayoutInput, person: PersonId, depth: number, expanded: Set<string>, counter: { n: number }): Family[] {
  const unions = input.index.unionsOf(person);
  if (unions.length === 0) {
    return [{ key: `d${counter.n++}`, partners: [person], anchor: 0, union: null, depth, children: [], width: 0 }];
  }
  return unions.map((union) => familyFor(input, union, union.partners.indexOf(person), depth, expanded, counter));
}

function familyFor(input: LayoutInput, union: Union, anchor: number, depth: number, expanded: Set<string>, counter: { n: number }): Family {
  const family: Family = { key: `d${counter.n++}`, partners: [...union.partners], anchor, union, depth, children: [], width: 0 };
  if (!expanded.has(union.id) && depth + 1 < MAX_DESCENDANT_GENERATIONS) {
    expanded.add(union.id);
    for (const child of union.children) {
      if (!input.labels.has(child)) continue;
      family.children.push(...familiesOf(input, child, depth + 1, expanded, counter));
    }
  }
  return family;
}

/** Roots: the couple's union (couple mode), else the focus person's unions (or the person alone). */
function roots(input: LayoutInput): Family[] {
  const expanded = new Set<string>();
  const counter = { n: 0 };
  const { focus } = input.tree;
  if (focus.length === 2) {
    const [a, b] = focus as [PersonId, PersonId];
    const union = input.index.unionsOf(a).find((u) => u.partners.includes(b));
    if (union) return [familyFor(input, union, -1, 0, expanded, counter)];
    const pair: Union = { id: '(focus)', partners: [a, b], children: [], sourceLine: 0, implied: true };
    return [familyFor(input, pair, -1, 0, expanded, counter)];
  }
  return familiesOf(input, focus[0]!, 0, expanded, counter).map((f) => ({ ...f, anchor: -1 }));
}

/** The notice for a chart too wide to print legibly, suggesting only the page changes not already made. */
function tooWideNotice(page: PageGeometry): string {
  const options = [page.orientation === 'portrait' ? 'landscape' : null, page.size === LARGEST_PAGE ? null : 'a larger page size'].filter((o) => o !== null);
  return options.length > 0
    ? `The widest generation does not fit this page legibly; try ${options.join(' or ')}.`
    : 'The widest generation does not fit legibly even on the largest page, so names print small.';
}

/** Persons in a family and everything below it (organic branch widths). */
function subtreeSize(f: Family): number {
  return f.partners.filter((p) => p !== null).length + f.children.reduce((sum, c) => sum + subtreeSize(c), 0);
}

function walk(families: readonly Family[], visit: (f: Family) => void): void {
  for (const f of families) {
    visit(f);
    walk(f.children, visit);
  }
}

/**
 * `desc`: descendants as a tidy tree (Reingold-Tilford via d3-hierarchy). Each
 * union is one node drawn as a joined pair of boxes; a person with several
 * unions gets one node per union side by side; children sit centered under
 * their union in DSL order. Single root: the person's unions are the roots;
 * couple: the couple's union is the root.
 */
export function layoutDesc(input: LayoutInput): Layout {
  const { theme } = input;
  const notices: string[] = [];
  const top = roots(input);
  const byDepth: PersonId[][] = [];
  const counts = new Map<PersonId, number>();
  const order: PersonId[] = [];
  walk(top, (f) => {
    (byDepth[f.depth] ??= []).push(...f.partners.filter((p): p is PersonId => p !== null));
    for (const p of f.partners) {
      if (p === null) continue;
      if (!counts.has(p)) order.push(p);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  });
  const repeats = new Map<PersonId, number>();
  for (const p of order) if (counts.get(p)! > 1) repeats.set(p, repeats.size + 1);

  const depths = byDepth.length;
  const base: GenerationMetrics[] = byDepth.map((ids, d) =>
    generationMetrics(theme, ids.map((id) => input.labels.get(id)!), d, input.measure, { focus: d === 0 }),
  );
  const joinGapOf = (m: GenerationMetrics) => theme.metrics.gap * m.size * 1.6;
  const familyWidth = (f: Family, m: GenerationMetrics) => f.partners.length * m.w + (f.partners.length - 1) * joinGapOf(m);
  walk(top, (f) => (f.width = familyWidth(f, base[f.depth]!)));

  const virtual: Family = { key: 'root', partners: [], anchor: -1, union: null, depth: -1, children: top, width: 0 };
  const sibling = (m: GenerationMetrics) => theme.metrics.gap * m.size * 1.2;
  const laid = tidyTree<Family>()
    .nodeSize([1, 1])
    .separation((a, b) => {
      const m = base[a.data.depth]!;
      return (a.data.width + b.data.width) / 2 + sibling(m) * (a.parent === b.parent ? 1 : 1.8);
    })(hierarchy<Family>(virtual, (f) => f.children));

  const placed: HierarchyPointNode<Family>[] = laid.descendants().filter((n) => n.data.depth >= 0);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const n of placed) {
    minX = Math.min(minX, n.x - n.data.width / 2);
    maxX = Math.max(maxX, n.x + n.data.width / 2);
  }
  const extent = maxX - minX;

  const titled = input.tree.focus.length === 2 ? bottomCartouche(theme, input.title, input.area, input.measure) : headingBlock(theme, input.title, input.area);
  const area = titled.rest;
  const rowGap = (m: GenerationMetrics) => theme.metrics.rowGap * m.size * 1.2;
  const heightAt1 = base.reduce((sum, m) => sum + m.h, 0) + base.slice(1).reduce((sum, m) => sum + rowGap(m), 0);
  const fit = Math.min(area.w / extent, area.h / heightAt1);
  // No lower bound: a chart too wide for the page prints small (with the notice) rather than off its edges.
  const s = fit > SCALE.max ? Math.min(SMALL_MAX, Math.max(SCALE.max, fit * SMALL_FILL)) : fit;
  if (fit < SCALE.min) notices.push(tooWideNotice(input.page));

  const rows = base.map((m) => scaleMetrics(m, s));
  const contentH = rows.reduce((sum, m) => sum + m.h, 0);
  const gap = depths > 1 ? clamp((area.h - contentH) / (depths - 1), 0, rowGap(rows[0]!) * 4) : 0;
  const total = contentH + gap * (depths - 1);
  let y = area.y + Math.max(0, (area.h - total) / 2);
  const rowY: number[] = rows.map((m) => {
    const cy = y + m.h / 2;
    y += m.h + gap;
    return cy;
  });
  const offsetX = area.x + (area.w - extent * s) / 2 - minX * s;

  const nodes: PosterNode[] = [];
  const links: Link[] = [];
  const boxesOf = new Map<string, PosterNode[]>();
  for (const n of placed) {
    const f = n.data;
    const m = rows[f.depth]!;
    const joinGap = joinGapOf(m);
    const width = f.partners.length * m.w + (f.partners.length - 1) * joinGap;
    const left = offsetX + n.x * s - width / 2;
    const boxes = f.partners.map((person, i) => {
      const x = left + i * (m.w + joinGap);
      const text = textInBox(theme, m.w, m.h, m.size);
      const node: PosterNode = {
        key: `${f.key}.${i}`,
        person,
        generation: f.depth,
        slot: null,
        side: 0,
        focus: f.depth === 0 && person !== null && input.tree.focus.includes(person),
        shape: { kind: 'rect', x, y: rowY[f.depth]! - m.h / 2, w: m.w, h: m.h },
        frame: { kind: 'box', cx: x + m.w / 2, cy: rowY[f.depth]!, w: text.w, h: text.h, rotate: 0 },
        size: m.size,
        repeat: person === null ? null : (repeats.get(person) ?? null),
      };
      return node;
    });
    if (theme.placeholder === 'hidden') {
      for (const b of boxes) if (b.person !== null) nodes.push(b);
    } else nodes.push(...boxes);
    boxesOf.set(f.key, boxes);
    if (boxes.length === 2) {
      const [a, b] = boxes as [PosterNode, PosterNode];
      const ra = a.shape as { x: number; y: number; w: number; h: number };
      const rb = b.shape as { x: number; y: number; w: number; h: number };
      links.push({ kind: 'join', a: { x: ra.x + ra.w, y: ra.y + ra.h / 2 }, b: { x: rb.x, y: rb.y + rb.h / 2 }, size: m.size });
    }
  }
  for (const n of placed) {
    const f = n.data;
    if (f.children.length === 0) continue;
    const boxes = boxesOf.get(f.key)!;
    const first = boxes[0]!.shape as { x: number; y: number; w: number; h: number };
    const last = boxes[boxes.length - 1]!.shape as { x: number; y: number; w: number; h: number };
    const joined = boxes.length === 2;
    const source = {
      x: (first.x + last.x + last.w) / 2,
      y: joined ? descentY(theme, first.y + first.h / 2, boxes[0]!.size) : first.y + first.h,
    };
    const targets: ForkLink['targets'] = f.children.map((child) => {
      const box = boxesOf.get(child.key)![Math.max(0, child.anchor)]!.shape as { x: number; y: number; w: number };
      return { point: { x: box.x + box.w / 2, y: box.y }, placeholder: false, weight: subtreeSize(child) };
    });
    const childTop = targets[0]!.point.y;
    links.push({ kind: 'fork', axis: 'down', source, weight: subtreeSize(f), mid: (source.y + childTop) / 2, targets });
  }
  return { nodes, links, title: titled.block, scale: s, notices };
}
