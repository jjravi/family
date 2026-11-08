import { layoutDesc } from '../layout/descendant';
import { fitLabel, type FitFlags } from '../layout/fit';
import { ASCENT, DESCENT, inflate, polar, rectsOverlap, type Point, type Rect } from '../layout/geometry';
import type { LayoutFn, LayoutInput } from '../layout/input';
import { personLabel, posterTitle, type PersonLabel } from '../layout/labels';
import type { TextMeasurer } from '../layout/measure';
import { labelType, setFace, textWidth } from '../layout/metrics';
import { layoutButterfly, layoutFan } from '../layout/radial';
import { layoutBowtie, layoutConverge, layoutPed } from '../layout/rectilinear';
import { fitTitle, titleSize } from '../layout/title';
import type { Layout, Link, PosterNode, TextRun, TitleBlock } from '../layout/types';
import { buildIndex } from '../model/index';
import type { PersonId, Tree } from '../model/types';
import { resolveStyle, type LayoutId, type Orientation, type PageGeometry, type Style } from '../style';
import { resolveTheme } from '../themes';
import type { Theme } from '../themes/schema';
import { shapeBounds } from '../layout/shapes';
import type { DrawContext } from './poster';
import { qrPlan } from './qr';

const LAYOUTS: Readonly<Record<LayoutId, LayoutFn>> = {
  ped: layoutPed,
  fan: layoutFan,
  desc: layoutDesc,
  bowtie: layoutBowtie,
  butterfly: layoutButterfly,
  converge: layoutConverge,
};

/** The notice when the share URL is over the QR budget (the corner is omitted). */
export const QR_NOTICE = 'link too long for QR';

/** A node with its fitted text. */
export interface PlacedNode {
  node: PosterNode;
  runs: TextRun[];
}

/** Small text outside the nodes: the couple's ampersand, or a "see also" number in a badge of radius `badge`. */
export interface Mark {
  run: TextRun;
  /** The box the mark owns. */
  frame: Rect;
  badge: number | null;
}

/** Everything the SVG writer draws, in page points. Tests read it to check overlaps. */
export interface Scene {
  layout: LayoutId;
  orientation: Orientation;
  page: PageGeometry;
  theme: Theme;
  /** Inside the page margin: the only place anything but the background is drawn. */
  safe: Rect;
  /** Width of the ornament band between `safe` and `area`. */
  band: number;
  /** Where layouts place nodes and titles. */
  area: Rect;
  nodes: PlacedNode[];
  marks: Mark[];
  links: Link[];
  title: { block: TitleBlock; runs: TextRun[]; size: number };
  qr: { rect: Rect; url: string } | null;
  scale: number;
  seed: string;
  notices: string[];
}

const FIT_NOTICES: readonly [keyof FitFlags, string][] = [
  ['traitsDropped', 'Some trait words were left out where boxes are too small.'],
  ['datesDropped', 'Some dates were left out where boxes are too small.'],
  ['abbreviated', 'Some names were shortened to fit.'],
  ['truncated', 'Some names were shortened to fit.'],
  ['hidden', 'Some names are too small to print at this size; try a larger page.'],
];

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

/** Width of the ornament band inside the safe area for a page. */
function bandWidth(safe: Rect, theme: Theme): number {
  const base = Math.min(46, Math.max(16, 0.034 * Math.min(safe.w, safe.h)));
  return theme.ornaments.border === 'none' && theme.ornaments.corners === 'none' ? base * 0.6 : base;
}

/** Ampersands between couples, for themes whose join mark is one, when the gap has room. */
function joinMarks(links: readonly Link[], theme: Theme, measure: TextMeasurer): Mark[] {
  if (theme.ornaments.join !== 'ampersand') return [];
  const marks: Mark[] = [];
  for (const link of links) {
    if (link.kind !== 'join') continue;
    const gap = link.b.x - link.a.x;
    const face = setFace({ ...theme.type.coupleTitle, style: 'italic' }, Math.min(link.size * 1.1, gap * 0.9));
    const width = textWidth(measure, face, '&');
    const size = face.font.size;
    if (width > gap * 0.8 || size < 6) continue;
    const cx = (link.a.x + link.b.x) / 2;
    const y = (link.a.y + link.b.y) / 2 + ((ASCENT - DESCENT) / 2) * size;
    marks.push({
      run: { role: 'mark', text: '&', font: face.font, tracking: 0, width, placement: { kind: 'line', x: cx, y, rotate: 0 } },
      frame: { x: link.a.x, y: y - ASCENT * size, w: gap, h: (ASCENT + DESCENT) * size },
      badge: null,
    });
  }
  return marks;
}

/** "See also" numbers in small badges at a corner of each repeated person's node. */
function repeatMarks(nodes: readonly PosterNode[], theme: Theme, measure: TextMeasurer): Mark[] {
  const marks: Mark[] = [];
  for (const node of nodes) {
    if (node.repeat === null) continue;
    const face = setFace(theme.type.dates, node.size * 0.62);
    const text = String(node.repeat);
    const width = textWidth(measure, face, text);
    const r = Math.max(width, face.font.size * 0.62) * 0.72 + face.font.size * 0.12;
    const at = badgeCenter(node, r);
    const size = face.font.size;
    marks.push({
      run: {
        role: 'mark',
        text,
        font: face.font,
        tracking: face.tracking,
        width,
        placement: { kind: 'line', x: at.x, y: at.y + ((ASCENT - DESCENT) / 2) * size, rotate: 0 },
      },
      frame: { x: at.x - r, y: at.y - r, w: 2 * r, h: 2 * r },
      badge: r,
    });
  }
  return marks;
}

/** Badge position: the top-right corner of a box, or the outer clockwise corner of a sector. */
function badgeCenter(node: PosterNode, r: number): Point {
  const shape = node.shape;
  if (shape.kind === 'rect') return { x: shape.x + shape.w - r * 0.2, y: shape.y + r * 0.2 };
  const a = shape.a1 - (r * 1.3) / shape.r1;
  return polar(shape.cx, shape.cy, shape.r1 - r * 1.3, a);
}

function hitsQr(layout: Layout, qr: Rect): boolean {
  const zone = inflate(qr, 6);
  return layout.nodes.some((n) => rectsOverlap(shapeBounds(n.shape), zone)) || rectsOverlap(layout.title.frame, zone);
}

/**
 * Lays out and fits a poster: style -> theme -> labels -> layout (re-run with
 * the QR corner cut off when they collide) -> fitted text. Pure and DOM-free.
 */
export function composeScene(tree: Tree, style: Style, ctx: DrawContext): Scene {
  const resolved = resolveStyle(style, tree.focus.length);
  const { page, layout: layoutId, orientation } = resolved;
  const theme = resolveTheme(style.theme, layoutId);
  const index = buildIndex(tree);
  const labels = new Map<PersonId, PersonLabel>();
  for (const id of index.connected) labels.set(id, personLabel(tree.persons.get(id)!, style));

  const safe: Rect = { x: page.margin, y: page.margin, w: page.width - 2 * page.margin, h: page.height - 2 * page.margin };
  const band = bandWidth(safe, theme);
  let area = inset(safe, band);
  const notices: string[] = [];

  let qr: Scene['qr'] = null;
  if (style.qr && ctx.shareUrl) {
    const plan = qrPlan(ctx.shareUrl);
    if (plan) {
      qr = { rect: { x: area.x + area.w - plan.size, y: area.y + area.h - plan.size, w: plan.size, h: plan.size }, url: ctx.shareUrl };
    } else {
      notices.push(QR_NOTICE);
    }
  }

  const input = (a: Rect): LayoutInput => ({
    tree,
    index,
    theme,
    labels,
    measure: ctx.measure,
    page,
    area: a,
    qr: qr?.rect ?? null,
    title: posterTitle(tree),
  });
  let layout = LAYOUTS[layoutId](input(area));
  if (qr && hitsQr(layout, qr.rect)) {
    area = { ...area, h: area.h - qr.rect.h - Math.max(12, qr.rect.h * 0.25) };
    layout = LAYOUTS[layoutId](input(area));
  }

  const flags = new Set<keyof FitFlags>();
  const nodes: PlacedNode[] = layout.nodes.map((node) => {
    const label = node.person === null ? undefined : labels.get(node.person);
    if (!label) return { node, runs: [] };
    const type = labelType(theme, node.size, node.focus);
    const fit = fitLabel(label, type, node.frame, ctx.measure, { wrap: node.frame.kind === 'box', endPad: node.size * 0.35 });
    for (const [flag] of FIT_NOTICES) if (fit[flag]) flags.add(flag);
    return { node, runs: fit.runs };
  });

  const size = titleSize(theme, area.w);
  const titleRuns = fitTitle(layout.title, theme, size, ctx.measure);
  const fitNotices = FIT_NOTICES.filter(([flag]) => flags.has(flag)).map(([, text]) => text);
  const marks = [...joinMarks(layout.links, theme, ctx.measure), ...repeatMarks(layout.nodes, theme, ctx.measure)];

  return {
    layout: layoutId,
    orientation,
    page,
    theme,
    safe,
    band,
    area,
    nodes,
    marks,
    links: layout.links,
    title: { block: layout.title, runs: titleRuns, size: titleRuns[0]?.font.size ?? size },
    qr,
    scale: layout.scale,
    seed: ctx.seed,
    notices: [...new Set([...layout.notices, ...fitNotices, ...notices])],
  };
}
