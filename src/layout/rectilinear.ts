import type { PersonId } from '../model/types';
import type { Rect } from './geometry';
import { clamp, descentY, SCALE, type LayoutInput } from './input';
import type { PersonLabel } from './labels';
import { generationMetrics, scaleMetrics, textInBox, type GenerationMetrics } from './metrics';
import { MAX_GENERATIONS, padSlots, pedigree, repeatNumbers, slotWeights } from './pedigree';
import { bottomCartouche, cartoucheHeight, cartoucheWidth, headingBlock, titleSize } from './title';
import type { ForkLink, Layout, Link, PosterNode, TextFrame, TitleBlock } from './types';

/** One focus person's ancestry, padded to the poster's depth. */
export interface PedigreeSide {
  slots: (PersonId | null)[][];
  weights: number[][];
}

/** Pedigrees for each focus person, padded to the deepest side (decision 14) and capped. */
export function pedigreeSides(input: LayoutInput, cap: number): { sides: PedigreeSide[]; generations: number; notices: string[] } {
  const raw = input.tree.focus.map((id) => pedigree(input.index, id, cap));
  const known = Math.max(...raw.map((p) => p.knownGenerations));
  const generations = Math.min(cap, known);
  const notices =
    known > cap ? [`This layout shows up to ${cap} generations; older ancestors are left out.`] : [];
  const sides = raw.map((p) => {
    const slots = padSlots(p.slots, generations);
    return { slots, weights: slotWeights(slots) };
  });
  return { sides, generations, notices };
}

/** Labels of the known persons in generation g on every side. */
export function generationLabels(input: LayoutInput, sides: readonly PedigreeSide[], g: number): PersonLabel[] {
  const labels: PersonLabel[] = [];
  for (const side of sides) {
    for (const person of side.slots[g] ?? []) {
      const label = person === null ? undefined : input.labels.get(person);
      if (label) labels.push(label);
    }
  }
  return labels;
}

/** Box geometry of one generation row at the chosen scale. */
interface Row {
  m: GenerationMetrics;
  /** Box extent on the page (rotated rows are tall and narrow). */
  w: number;
  h: number;
  rotated: boolean;
}

function rowFor(m: GenerationMetrics, slot: number, gap: number, allowRotate: boolean): Row | null {
  if (m.w + gap <= slot + 1e-6) return { m, w: m.w, h: m.h, rotated: false };
  if (allowRotate && m.h + gap <= slot + 1e-6) return { m, w: m.h, h: m.w, rotated: true };
  return null;
}

/** Text frame for a box centered at (cx, cy); rotated boxes read bottom to top. */
function boxFrame(input: LayoutInput, cx: number, cy: number, row: Row): TextFrame {
  const along = row.rotated ? row.h : row.w;
  const across = row.rotated ? row.w : row.h;
  const text = textInBox(input.theme, along, across, row.m.size);
  return { kind: 'box', cx, cy, w: text.w, h: text.h, rotate: row.rotated ? -90 : 0 };
}

function personNode(
  input: LayoutInput,
  key: string,
  person: PersonId | null,
  g: number,
  slot: number | null,
  side: 0 | 1,
  cx: number,
  cy: number,
  row: Row,
  repeats: ReadonlyMap<PersonId, number>,
): PosterNode {
  return {
    key,
    person,
    generation: g,
    slot,
    side,
    focus: g === 0,
    shape: { kind: 'rect', x: cx - row.w / 2, y: cy - row.h / 2, w: row.w, h: row.h },
    frame: boxFrame(input, cx, cy, row),
    size: row.m.size,
    repeat: person === null ? null : (repeats.get(person) ?? null),
  };
}

const SMALLEST_SCALE = 0.2;

/** Flat rows at this scale or more are never traded for rotated ones. */
const FLAT_ENOUGH = 0.8;

/**
 * The largest scale (from SCALE.max down) at which `attempt` lays every row
 * out. Rotated outer generations are a last resort: used only when flat rows
 * would fall below FLAT_ENOUGH and rotation allows a scale at least 25%
 * larger; when nothing fits, `squeeze` lays out at the smallest scale.
 */
function chooseScale<T>(
  attempt: (s: number, rotate: boolean) => T | null,
  allowRotate: boolean,
  squeeze: (s: number) => T,
): { s: number; rows: T } {
  const search = (rotate: boolean): { s: number; rows: T } | null => {
    for (let s = SCALE.max; s >= SMALLEST_SCALE; s -= 0.01) {
      const rows = attempt(s, rotate);
      if (rows) return { s, rows };
    }
    return null;
  };
  const flat = search(false);
  if (flat && flat.s >= FLAT_ENOUGH) return flat;
  const rotated = allowRotate ? search(true) : null;
  if (flat && (!rotated || flat.s >= rotated.s * 0.8)) return flat;
  if (rotated) return rotated;
  return { s: SMALLEST_SCALE, rows: squeeze(SMALLEST_SCALE) };
}

/** Rows stacked from `bottom` upward with gaps between `min` and `max`, centered in `area` when there is room. */
function stackRows(heights: readonly number[], area: Rect, minGap: number, maxGap: number): number[] {
  const content = heights.reduce((a, b) => a + b, 0);
  const n = heights.length;
  const gap = n > 1 ? clamp((area.h - content) / (n - 1), minGap, maxGap) : 0;
  const total = content + gap * (n - 1);
  let bottom = area.y + area.h - Math.max(0, (area.h - total) / 2);
  return heights.map((h) => {
    const cy = bottom - h / 2;
    bottom -= h + gap;
    return cy;
  });
}

/** How much larger each generation may be set than the next one out, room permitting (the focus reads first). */
const GROWTH = 1.15;

/** Per-generation scales: the outermost at `outer`, each inner one up to GROWTH larger, capped by its own room. */
function growScales(count: number, outer: number, room: (g: number) => number): number[] {
  const scales = new Array<number>(count).fill(outer);
  for (let g = count - 2; g >= 0; g--) scales[g] = Math.min(SCALE.max, scales[g + 1]! * GROWTH, Math.max(room(g), outer));
  return scales;
}

/** The scale edges and ornaments use: the middle generation's. */
function strokeScale(rows: readonly Row[], base: readonly GenerationMetrics[]): number {
  const g = Math.floor((rows.length - 1) / 2);
  return rows[g]!.m.size / base[g]!.size;
}

/** Fork links from each drawn child to its drawn parent slots. */
function pedigreeLinks(
  sides: readonly PedigreeSide[],
  nodes: ReadonlyMap<string, PosterNode>,
  keyOf: (side: number, g: number, k: number) => string,
  axisOf: (side: number) => ForkLink['axis'],
  anchors: (node: PosterNode, toward: ForkLink['axis']) => { x: number; y: number },
): ForkLink[] {
  const links: ForkLink[] = [];
  sides.forEach((side, s) => {
    const axis = axisOf(s);
    const back = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[axis];
    for (let g = 0; g + 1 < side.slots.length; g++) {
      side.slots[g]!.forEach((person, k) => {
        const child = nodes.get(keyOf(s, g, k));
        if (!child) return;
        const parents = [2 * k, 2 * k + 1]
          .map((j) => ({ node: nodes.get(keyOf(s, g + 1, j)), weight: side.weights[g + 1]![j]! }))
          .filter((p): p is { node: PosterNode; weight: number } => p.node !== undefined);
        if (parents.length === 0) return;
        const source = anchors(child, axis);
        const targets = parents.map((p) => ({
          point: anchors(p.node, back),
          placeholder: p.node.person === null || person === null,
          weight: p.weight,
        }));
        const vertical = axis === 'up' || axis === 'down';
        const far = targets[0]!.point;
        const mid = vertical ? (source.y + far.y) / 2 : (source.x + far.x) / 2;
        links.push({ kind: 'fork', axis, source, weight: side.weights[g]![k]!, mid, targets });
      });
    }
  });
  return links;
}

function anchor(node: PosterNode, toward: ForkLink['axis']): { x: number; y: number } {
  if (node.shape.kind !== 'rect') throw new Error('rectilinear anchors need rect shapes');
  const { x, y, w, h } = node.shape;
  if (toward === 'up') return { x: x + w / 2, y };
  if (toward === 'down') return { x: x + w / 2, y: y + h };
  if (toward === 'left') return { x, y: y + h / 2 };
  return { x: x + w, y: y + h / 2 };
}

function sideKey(side: number, g: number, k: number): string {
  return `${side === 0 ? 'a' : 'b'}${g}.${k}`;
}

/** The couple's children in DSL order (from every union joining the two), for the row under `converge`. */
function coupleChildren(input: LayoutInput): PersonId[] {
  const [a, b] = input.tree.focus;
  const children: PersonId[] = [];
  for (const union of input.index.unionsOf(a!)) {
    if (!union.partners.includes(b!)) continue;
    for (const child of union.children) if (!children.includes(child) && input.labels.has(child)) children.push(child);
  }
  return children;
}

/**
 * Vertical pedigrees: `ped` (one focus at the bottom center, slot k of generation
 * g at column (k + 0.5) / 2^g of the width) and `converge` (each partner's
 * ancestry over half the page, mirrored, merging into the couple at the bottom
 * center, with the couple's children below and a title cartouche at the base).
 */
function verticalPedigree(input: LayoutInput, couple: boolean): Layout {
  const { theme } = input;
  const { sides, generations, notices } = pedigreeSides(input, MAX_GENERATIONS.rectilinear);
  const repeats = repeatNumbers(sides.map((s) => s.slots));
  const titled = couple ? bottomCartouche(theme, input.title, input.area, input.measure) : headingBlock(theme, input.title, input.area);
  const base = Array.from({ length: generations }, (_, g) =>
    generationMetrics(theme, generationLabels(input, sides, g), g, input.measure, { focus: g === 0 }),
  );
  // Breathing room above the oldest generation, so it does not crowd the border.
  const headroom = couple ? Math.min(titled.rest.h * 0.02, theme.metrics.rowGap * base.at(-1)!.size * 0.6) : 0;
  const area = { ...titled.rest, y: titled.rest.y + headroom, h: titled.rest.h - headroom };
  const kids = couple ? coupleChildren(input) : [];
  const kidBase = kids.length > 0 ? generationMetrics(theme, kids.map((id) => input.labels.get(id)!), 1, input.measure) : null;
  const half = couple ? area.w / 2 : area.w;
  const slotOf = (g: number) => (couple && g === 0 ? area.w / 2 : half / 2 ** g);
  const gapOf = (m: GenerationMetrics) => theme.metrics.gap * m.size;
  const fitFlat = (b: GenerationMetrics, slot: number) => slot / (b.w + theme.metrics.gap * b.size);
  const fitTurned = (b: GenerationMetrics, slot: number) => slot / (b.h + theme.metrics.gap * b.size);
  const attempt = (s: number, rotate: boolean): { rows: Row[]; kid: Row | null } | null => {
    const room = (g: number) => Math.max(fitFlat(base[g]!, slotOf(g)), rotate && g >= 2 ? fitTurned(base[g]!, slotOf(g)) : 0);
    const scales = growScales(base.length, s, room);
    const rows: Row[] = [];
    for (let g = 0; g < base.length; g++) {
      const m = scaleMetrics(base[g]!, scales[g]!);
      const row = rowFor(m, slotOf(g), gapOf(m), rotate && g >= 2);
      if (!row) return null;
      rows.push(row);
    }
    let kid: Row | null = null;
    if (kidBase) {
      const slot = area.w / kids.length;
      const m = scaleMetrics(kidBase, Math.min(scales[Math.min(1, scales.length - 1)]!, fitFlat(kidBase, slot)));
      kid = rowFor(m, slot, gapOf(m), false);
      if (!kid) return null;
    }
    const all = kid ? [...rows, kid] : rows;
    const minGap = theme.metrics.rowGap * (all.reduce((a, r) => a + r.m.size, 0) / all.length);
    const total = all.reduce((a, r) => a + r.h, 0) + minGap * (all.length - 1);
    return total <= area.h + 1e-6 ? { rows, kid } : null;
  };
  const squeeze = (s: number) => {
    const squeezed = (b: GenerationMetrics, slot: number): Row => {
      const m = scaleMetrics(b, s);
      return { m, w: Math.max(1, Math.min(m.w, slot - gapOf(m))), h: m.h, rotated: false };
    };
    return { rows: base.map((b, g) => squeezed(b, slotOf(g))), kid: kidBase ? squeezed(kidBase, area.w / kids.length) : null };
  };
  const { s, rows: chosen } = chooseScale(attempt, true, squeeze);
  const { rows, kid } = chosen;
  if (s < SCALE.min) notices.push('This tree is large for the page; names are small. Try a larger page size.');
  const avg = rows.reduce((a, r) => a + r.m.size, 0) / rows.length;
  const heights = [...(kid ? [kid.h] : []), ...rows.map((r) => r.h)];
  // Deep trees set small type, so the gap cap also scales with the page: tall pages get used.
  const maxGap = Math.max(theme.metrics.rowGap * avg * 7, area.h * 0.18);
  const stacked = stackRows(heights, area, theme.metrics.rowGap * avg, maxGap);
  const kidY = kid ? stacked[0]! : null;
  const ys = kid ? stacked.slice(1) : stacked;

  const nodes = new Map<string, PosterNode>();
  const hidden = theme.placeholder === 'hidden';
  const joinGap = theme.metrics.gap * rows[0]!.m.size * 1.6;
  const cx = area.x + area.w / 2;
  sides.forEach((side, si) => {
    side.slots.forEach((row, g) => {
      row.forEach((person, k) => {
        if (person === null && hidden) return;
        let x: number;
        if (couple && g === 0) x = cx + (si === 0 ? -1 : 1) * (joinGap / 2 + rows[0]!.w / 2);
        else if (si === 0) x = area.x + (k + 0.5) * slotOf(g);
        else x = area.x + area.w - (k + 0.5) * slotOf(g);
        const key = sideKey(si, g, k);
        nodes.set(key, personNode(input, key, person, g, k, si as 0 | 1, x, ys[g]!, rows[g]!, repeats));
      });
    });
  });

  const links: Link[] = pedigreeLinks(sides, nodes, sideKey, () => 'up', anchor);
  const focusRow = rows[0]!;
  if (couple) {
    const a = nodes.get(sideKey(0, 0, 0))!;
    const b = nodes.get(sideKey(1, 0, 0))!;
    links.push({ kind: 'join', a: anchor(a, 'right'), b: anchor(b, 'left'), size: focusRow.m.size });
    if (kid && kidY !== null) {
      const gap = gapOf(kid.m);
      const total = kids.length * kid.w + (kids.length - 1) * gap * 1.5;
      const pitch = kids.length > 1 ? Math.min((area.w - kid.w) / (kids.length - 1), (total - kid.w) / (kids.length - 1)) : 0;
      const kidNodes = kids.map((id, i) =>
        personNode(input, `c${i}`, id, 1, null, 0, cx + (i - (kids.length - 1) / 2) * pitch, kidY, kid, repeats),
      );
      for (const node of kidNodes) nodes.set(node.key, node);
      const source = { x: cx, y: descentY(theme, ys[0]!, focusRow.m.size) };
      const top = kidY - kid.h / 2;
      links.push({
        kind: 'fork',
        axis: 'down',
        source,
        weight: kids.length,
        mid: (source.y + top) / 2,
        targets: kidNodes.map((n) => ({ point: anchor(n, 'up'), placeholder: false, weight: 1 })),
      });
    }
  }
  return { nodes: [...nodes.values()], links, title: titled.block, scale: strokeScale(rows, base), notices };
}

/** `ped`: a vertical pedigree, focus at the bottom center, generations stacked upward, title at the top. */
export function layoutPed(input: LayoutInput): Layout {
  return verticalPedigree(input, false);
}

/** `converge`: both ancestries flowing down into the couple at the bottom center, their children below, title cartouche at the base. */
export function layoutConverge(input: LayoutInput): Layout {
  return verticalPedigree(input, true);
}

/**
 * `bowtie`: the couple side by side at the center, the first partner's ancestry
 * fanning left in columns and the second's mirrored to the right; slot k of
 * generation g at row (k + 0.5) / 2^g of the height. The title cartouche sits in
 * the free center column above the couple.
 */
export function layoutBowtie(input: LayoutInput): Layout {
  const { theme, area } = input;
  const { sides, generations, notices } = pedigreeSides(input, MAX_GENERATIONS.rectilinear);
  const repeats = repeatNumbers(sides.map((s) => s.slots));
  const base = Array.from({ length: generations }, (_, g) =>
    generationMetrics(theme, generationLabels(input, sides, g), g, input.measure, { focus: g === 0 }),
  );
  const tSize = titleSize(theme, area.w) * 0.8;
  const reserve = generations > 1 ? 0 : cartoucheHeight(tSize) + tSize;
  const slotOf = (g: number) => (g === 0 ? area.h - reserve : area.h / 2 ** g);
  const gapOf = (m: GenerationMetrics) => theme.metrics.gap * m.size * 0.6;
  const joinGapOf = (m: GenerationMetrics) => theme.metrics.gap * m.size * 1.6;
  const colGapOf = (rows: readonly Row[]) => theme.metrics.rowGap * (rows.reduce((a, r) => a + r.m.size, 0) / rows.length) * 1.3;
  // Columns run outward from the couple; each side gets half the width.
  const attempt = (s: number): Row[] | null => {
    const scales = growScales(base.length, s, (g) => slotOf(g) / (base[g]!.h + theme.metrics.gap * 0.6 * base[g]!.size));
    const rows: Row[] = [];
    for (let g = 0; g < base.length; g++) {
      const m = scaleMetrics(base[g]!, scales[g]!);
      if (m.h + gapOf(m) > slotOf(g) + 1e-6) return null;
      rows.push({ m, w: m.w, h: m.h, rotated: false });
    }
    const total = joinGapOf(rows[0]!.m) / 2 + rows.reduce((a, r) => a + r.w, 0) + colGapOf(rows) * (rows.length - 1);
    return total <= area.w / 2 + 1e-6 ? rows : null;
  };
  const squeeze = (s: number): Row[] =>
    base.map((b, g) => {
      const m = scaleMetrics(b, s);
      return { m, w: m.w, h: Math.max(1, Math.min(m.h, slotOf(g) - gapOf(m))), rotated: false };
    });
  const { s, rows } = chooseScale(attempt, false, squeeze);
  if (s < SCALE.min) notices.push('This tree is large for the page; names are small. Try a larger page size.');
  const avg = rows.reduce((a, r) => a + r.m.size, 0) / rows.length;
  const joinGap = joinGapOf(rows[0]!.m);
  const cx = area.x + area.w / 2;
  const cy = area.y + reserve + (area.h - reserve) / 2;

  // Column centers for side 0 (mirrored for side 1), spreading leftover width into the gaps.
  const widths = rows.map((r) => r.w);
  const used = joinGap / 2 + widths.reduce((a, b) => a + b, 0);
  const n = generations - 1;
  const minGap = colGapOf(rows);
  const gap = n > 0 ? clamp((area.w / 2 - used) / n, minGap, minGap * 3) : 0;
  const offsets: number[] = [];
  let edge = joinGap / 2;
  for (let g = 0; g < generations; g++) {
    offsets.push(edge + widths[g]! / 2);
    edge += widths[g]! + gap;
  }
  const spare = Math.max(0, area.w / 2 - (edge - gap));
  const outward = (g: number) => offsets[g]! + (g === 0 ? 0 : spare * 0.5);

  const nodes = new Map<string, PosterNode>();
  const hidden = theme.placeholder === 'hidden';
  sides.forEach((side, si) => {
    const sign = si === 0 ? -1 : 1;
    side.slots.forEach((row, g) => {
      row.forEach((person, k) => {
        if (person === null && hidden) return;
        const x = cx + sign * outward(g);
        const y = g === 0 ? cy : area.y + (k + 0.5) * (area.h / 2 ** g);
        const key = sideKey(si, g, k);
        nodes.set(key, personNode(input, key, person, g, k, si as 0 | 1, x, y, rows[g]!, repeats));
      });
    });
  });

  const links: Link[] = pedigreeLinks(sides, nodes, sideKey, (si) => (si === 0 ? 'left' : 'right'), anchor);
  const a = nodes.get(sideKey(0, 0, 0))!;
  const b = nodes.get(sideKey(1, 0, 0))!;
  links.push({ kind: 'join', a: anchor(a, 'right'), b: anchor(b, 'left'), size: rows[0]!.m.size });

  // Title: the center column between the couple's two parent crossbars, above the couple.
  const crossbar = generations > 1 ? (outward(0) + widths[0]! / 2 + outward(1) - widths[1]! / 2) / 2 : area.w / 2;
  const inner = crossbar - avg * 0.8;
  const coupleTop = cy - rows[0]!.h / 2;
  const columnW = Math.min(area.w, 2 * inner);
  const room: Rect = { x: cx - columnW / 2, y: area.y, w: columnW, h: Math.max(0, coupleTop - area.y - tSize * 0.8) };
  const w = cartoucheWidth(theme, input.title, room.w, input.measure, tSize);
  const h = Math.min(room.h, cartoucheHeight(tSize, w >= room.w - 1 ? 2 : 1));
  const title: TitleBlock = {
    text: input.title,
    kind: 'cartouche',
    frame: { x: cx - w / 2, y: room.y + (room.h - h) / 2, w, h },
  };
  return { nodes: [...nodes.values()], links, title, scale: strokeScale(rows, base), notices };
}
