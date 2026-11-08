import type { PersonId } from '../model/types';
import type { Rect } from './geometry';
import { clamp, SCALE, type LayoutInput } from './input';
import type { PersonLabel } from './labels';
import { labelType, labelWidths, nameSize } from './metrics';
import { MAX_GENERATIONS, repeatNumbers } from './pedigree';
import { generationLabels, pedigreeSides, type PedigreeSide } from './rectilinear';
import { bottomCartouche, headingBlock } from './title';
import type { Layout, Link, PolarLink, PosterNode, TextFrame } from './types';

/** Rings 1-3 set names along arcs; outer rings set them along the radius (decision 13). */
const ARC_RINGS = 3;
/** Share of the spare height above a letterboxed composition (below half: the optical center sits high). */
const OPTICAL = 0.44;

/** Text needs of one generation at scale 1, from the widest content (names on one line). */
interface RingNeed {
  size: number;
  /** Widest line. */
  textW: number;
  /** Stack of name, dates, and traits lines. */
  textH: number;
}

function ringNeed(input: LayoutInput, labels: readonly PersonLabel[], g: number): RingNeed {
  const { theme } = input;
  const size = nameSize(theme, g);
  const type = labelType(theme, size, g === 0);
  const widths = labels.map((l) => labelWidths(l, type, input.measure));
  const widest = Math.max(0, ...widths.map((w) => Math.max(w.name, w.dates, w.traits)));
  const maxText = (theme.metrics.maxWidth - 2 * theme.metrics.padX) * size;
  const minText = (theme.metrics.minWidth - 2 * theme.metrics.padX) * size;
  const hasDates = labels.some((l) => l.dates !== null);
  const hasTraits = labels.some((l) => l.traits !== null);
  return {
    size,
    textW: clamp(widest, minText, maxText),
    textH: type.nameLine + (hasDates ? type.datesLine : 0) + (hasTraits ? type.traitsLine : 0),
  };
}

/** Radii at scale 1: the center disc and each ring's inner and outer radius. */
interface Rings {
  center: number;
  inner: number[];
  outer: number[];
  gap: number;
}

/**
 * Ring radii: each ring is deep enough for its text (a line stack on arc
 * rings, the longest line on radial rings) and starts far enough out for its
 * text to fit the slot's arc; rings then grow outward to close any gap.
 */
function ringRadii(needs: readonly RingNeed[], center: number, theme: LayoutInput['theme']): Rings {
  const { padX, padY } = theme.metrics;
  const inner: number[] = [0];
  const outer: number[] = [center];
  const gap = Math.max(4, needs[1]?.size ?? 10) * 0.55;
  for (let g = 1; g < needs.length; g++) {
    const need = needs[g]!;
    const span = Math.PI / 2 ** g;
    const arc = g <= ARC_RINGS;
    const depth = arc ? need.textH + 2 * padY * need.size : need.textW + 2 * padX * need.size;
    const across = arc ? need.textW + 2 * padX * need.size : need.textH + 2 * padY * need.size;
    const r0 = Math.max(outer[g - 1]! + gap, across / span);
    inner.push(r0);
    outer.push(r0 + depth);
  }
  for (let g = 1; g + 1 < needs.length; g++) outer[g] = Math.max(outer[g]!, inner[g + 1]! - gap);
  return { center, inner, outer, gap };
}

function scaleRings(r: Rings, s: number): Rings {
  return { center: r.center * s, inner: r.inner.map((v) => v * s), outer: r.outer.map((v) => v * s), gap: r.gap * s };
}

/** Angles of slot k in generation g: the top half runs clockwise from the left; the bottom half mirrors it. */
function slotAngles(g: number, k: number, bottom: boolean): [number, number] {
  const span = Math.PI / 2 ** g;
  return bottom ? [Math.PI - (k + 1) * span, Math.PI - k * span] : [Math.PI + k * span, Math.PI + (k + 1) * span];
}

interface Wheel {
  cx: number;
  cy: number;
  rings: Rings;
  s: number;
}

function sectorNodes(
  input: LayoutInput,
  sides: readonly PedigreeSide[],
  wheel: Wheel,
  repeats: ReadonlyMap<PersonId, number>,
  needs: readonly RingNeed[],
): { nodes: Map<string, PosterNode>; links: Link[] } {
  const { theme } = input;
  const { cx, cy, rings, s } = wheel;
  const nodes = new Map<string, PosterNode>();
  const links: Link[] = [];
  const hidden = theme.placeholder === 'hidden';
  const keyOf = (side: number, g: number, k: number) => `${side === 0 ? 'a' : 'b'}${g}.${k}`;
  sides.forEach((side, si) => {
    const bottom = si === 1;
    for (let g = 1; g < side.slots.length; g++) {
      const size = needs[g]!.size * s;
      const r0 = rings.inner[g]!;
      const r1 = rings.outer[g]!;
      const pad = theme.metrics.padY * size * 0.6;
      side.slots[g]!.forEach((person, k) => {
        if (person === null && hidden) return;
        const [a0, a1] = slotAngles(g, k, bottom);
        // Shaped cells get a hairline gap; text-only cells share spokes.
        const inset = theme.node.shape === 'text-only' ? 0 : Math.min((1.2 * s) / r0, (a1 - a0) * 0.05);
        const frame: TextFrame =
          g <= ARC_RINGS
            ? { kind: 'arc', cx, cy, r0: r0 + pad, r1: r1 - pad, a0: a0 + inset, a1: a1 - inset }
            : { kind: 'radial', cx, cy, r0: r0 + pad, r1: r1 - pad, a0: a0 + inset, a1: a1 - inset };
        const key = keyOf(si, g, k);
        nodes.set(key, {
          key,
          person,
          generation: g,
          slot: k,
          side: si as 0 | 1,
          focus: false,
          shape: { kind: 'sector', cx, cy, r0, r1, a0: a0 + inset, a1: a1 - inset },
          frame,
          size,
          repeat: person === null ? null : (repeats.get(person) ?? null),
        });
      });
    }
    for (let g = 0; g + 1 < side.slots.length; g++) {
      side.slots[g]!.forEach((person, k) => {
        const child = g === 0 ? true : nodes.has(keyOf(si, g, k));
        if (!child) return;
        const targets: PolarLink['targets'] = [];
        for (const j of [2 * k, 2 * k + 1]) {
          const parent = nodes.get(keyOf(si, g + 1, j));
          if (!parent) continue;
          const [a0, a1] = slotAngles(g + 1, j, bottom);
          targets.push({ r: rings.inner[g + 1]!, a: (a0 + a1) / 2, placeholder: parent.person === null || person === null, weight: side.weights[g + 1]![j]! });
        }
        if (targets.length === 0) return;
        const [a0, a1] = g === 0 ? (bottom ? [0, Math.PI] : [Math.PI, 2 * Math.PI]) : slotAngles(g, k, bottom);
        const r = rings.outer[g]!;
        links.push({
          kind: 'polar',
          cx,
          cy,
          source: { r, a: (a0 + a1) / 2 },
          weight: side.weights[g]![k]!,
          mid: r + (rings.inner[g + 1]! - r) / 2,
          targets,
        });
      });
    }
  });
  return { nodes, links };
}

/** Center-disc metrics: a text box that fits above (or below) the diameter, `gap` clear of it. */
function centerRadius(need: RingNeed, theme: LayoutInput['theme'], gap: number): number {
  const w = need.textW + 2 * theme.metrics.padX * need.size;
  const h = need.textH + theme.metrics.padY * need.size;
  return Math.hypot(w / 2, h + gap / 2);
}

function centerNode(
  input: LayoutInput,
  key: string,
  person: PersonId,
  side: 0 | 1,
  wheel: Wheel,
  need: RingNeed,
  gap: number,
  repeats: ReadonlyMap<PersonId, number>,
  split: boolean,
): PosterNode {
  const { theme } = input;
  const { cx, cy, rings, s } = wheel;
  const size = need.size * s;
  const below = side === 1;
  const w = need.textW * s;
  const h = need.textH * s;
  const offset = gap / 2 + theme.metrics.padY * size * 0.5 + h / 2;
  const a0 = below ? 0 : Math.PI;
  return {
    key,
    person,
    generation: 0,
    slot: 0,
    side,
    focus: true,
    shape: { kind: 'sector', cx, cy, r0: 0, r1: rings.center, a0, a1: a0 + Math.PI, arcOnly: split },
    frame: { kind: 'box', cx, cy: below ? cy + offset : cy - offset, w, h, rotate: 0 },
    size,
    repeat: repeats.get(person) ?? null,
  };
}

/** The smallest of the scales the page allows on each axis, kept within the layout limits. */
function boundedScale(...allowed: number[]): number {
  return clamp(Math.min(...allowed), 0.2, SCALE.max);
}

/**
 * `fan`: a half circle with the focus at the base center; ring g holds the 2^g
 * ancestors of generation g in arcs of 180 / 2^g degrees, the first partner's
 * line on the left. Title at the top on landscape pages; on portrait pages,
 * where the half circle is width-bound and leaves height to spare, it is tucked
 * under the base. The group is centered on the page.
 */
export function layoutFan(input: LayoutInput): Layout {
  const { theme } = input;
  const { sides, generations, notices } = pedigreeSides(input, MAX_GENERATIONS.fan);
  const repeats = repeatNumbers(sides.map((s) => s.slots));
  const needs = Array.from({ length: generations }, (_, g) => ringNeed(input, generationLabels(input, sides, g), g));
  const center = centerRadius(needs[0]!, theme, 0) + theme.metrics.padY * needs[0]!.size;
  const unit = ringRadii(needs, center, theme);
  const R = unit.outer[generations - 1]!;
  const heading = headingBlock(theme, input.title, input.area);
  const area = heading.rest;
  const base = theme.metrics.padY * needs[0]!.size;
  const s = boundedScale(area.w / (2 * R), area.h / (R + base));
  if (s < SCALE.min) notices.push('This tree is large for the page; names are small. Try a larger page size.');
  const rings = scaleRings(unit, s);
  const fanH = rings.outer[generations - 1]! + base * s;
  // Center the title and the fan together, closing the gap between them.
  const titleH = heading.block.frame.h;
  const gapTitle = area.y - (heading.block.frame.y + titleH);
  const tucked = input.page.orientation === 'portrait';
  const top = input.area.y + Math.max(0, (input.area.h - (titleH + gapTitle + fanH)) * OPTICAL);
  const cx = area.x + area.w / 2;
  const cy = (tucked ? top : top + titleH + gapTitle) + rings.outer[generations - 1]!;
  const title = { ...heading.block, frame: { ...heading.block.frame, y: tucked ? cy + base * s + gapTitle : top } };
  const wheel: Wheel = { cx, cy, rings, s };
  const { nodes, links } = sectorNodes(input, sides, wheel, repeats, needs);
  const focus = centerNode(input, 'a0.0', input.tree.focus[0]!, 0, wheel, needs[0]!, 0, repeats, false);
  const list = [focus, ...nodes.values()];
  return { nodes: list, links, title, scale: s, notices };
}

/**
 * `butterfly`: two half-fans back to back forming a full circle around the
 * couple: the first partner's ancestry on the top half, the second's mirrored
 * on the bottom (arc text there is flipped to stay upright). The circle is
 * letterboxed on the page above a title cartouche.
 */
export function layoutButterfly(input: LayoutInput): Layout {
  const { theme } = input;
  const { sides, generations, notices } = pedigreeSides(input, MAX_GENERATIONS.fan);
  const repeats = repeatNumbers(sides.map((s) => s.slots));
  const needs = Array.from({ length: generations }, (_, g) => ringNeed(input, generationLabels(input, sides, g), g));
  const joinGap = needs[0]!.size * 1.5;
  const center = centerRadius(needs[0]!, theme, joinGap) + theme.metrics.padY * needs[0]!.size;
  const unit = ringRadii(needs, center, theme);
  const R = unit.outer[generations - 1]!;
  const titled = bottomCartouche(theme, input.title, input.area, input.measure);
  const area: Rect = titled.rest;
  const s = boundedScale(area.w / (2 * R), area.h / (2 * R));
  if (s < SCALE.min) notices.push('This tree is large for the page; names are small. Try a larger page size.');
  const rings = scaleRings(unit, s);
  const radius = rings.outer[generations - 1]!;
  const cartouche = titled.block.frame;
  const gapTitle = input.area.y + input.area.h - cartouche.h - (area.y + area.h);
  const group = 2 * radius + gapTitle + cartouche.h;
  const top = input.area.y + Math.max(0, (input.area.h - group) * OPTICAL);
  const cx = area.x + area.w / 2;
  const cy = top + radius;
  const title = { ...titled.block, frame: { ...cartouche, y: cy + radius + gapTitle } };
  const wheel: Wheel = { cx, cy, rings, s };
  const { nodes, links } = sectorNodes(input, sides, wheel, repeats, needs);
  const [a, b] = input.tree.focus as [PersonId, PersonId];
  const gap = joinGap * s;
  const nodeA = centerNode(input, 'a0.0', a, 0, wheel, needs[0]!, gap, repeats, true);
  const nodeB = centerNode(input, 'b0.0', b, 1, wheel, needs[0]!, gap, repeats, true);
  const half = Math.min(rings.center * 0.62, needs[0]!.textW * s * 0.5);
  links.push({ kind: 'join', a: { x: cx - half, y: cy }, b: { x: cx + half, y: cy }, size: needs[0]!.size * s });
  return { nodes: [nodeA, nodeB, ...nodes.values()], links, title, scale: s, notices };
}
